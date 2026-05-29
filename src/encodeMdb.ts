/**
 * In-place edit support for NI EW component databases (Jet 3 / Jet 4).
 *
 * Reads an edited JSON (produced by `ewd`) alongside the original `.prj`,
 * diffs cell values, and applies same-length byte patches to the original's
 * raw bytes. The result is a modified copy of the original `.prj` that
 * `mdb-reader` (and presumably Multisim) accept.
 *
 * Constraints for the first cut (per `plans/jet-in-place-edit.md`):
 *
 *   - Only `text` and `memo` columns are eligible. Numeric / date / OLE
 *     edits are skipped silently — that's a planned future expansion.
 *   - New value must have the same byte length as the old value (no
 *     row reflow). Length-changing edits are skipped.
 *   - Old value must appear exactly once in the raw file bytes. If it's
 *     missing (already changed?) or ambiguous (repeats), the change is
 *     skipped with a reason.
 *
 * Anything skipped is reported so the caller can decide what to do. The
 * "applied" + "skipped" breakdown is the primary return value.
 */

import { promises as fs } from 'node:fs';
import MDBReader from 'mdb-reader';
import { type MdbJson, normalizeValue } from './decodeMdb';
import type { Logger } from './util/logger';

export interface CellChange {
  table: string;
  rowIndex: number;
  column: string;
  oldValue: string;
  newValue: string;
}

export interface SkippedChange {
  change: CellChange;
  reason: string;
}

export interface PatchResult {
  applied: CellChange[];
  skipped: SkippedChange[];
  outFile: string;
}

type JetVersion = 3 | 4;
type JetTextEncoding = 'latin1' | 'utf16le';

export function detectJetVersion(buffer: Buffer): JetVersion {
  const v = buffer[0x14];
  if (v === 0x00) return 3;
  if (v === 0x01) return 4;
  throw new Error(`Unknown Jet version byte at offset 0x14: 0x${v?.toString(16) ?? '??'}`);
}

export function textEncodingForJet(version: JetVersion): JetTextEncoding {
  return version === 3 ? 'latin1' : 'utf16le';
}

function isEditableTextType(type: string): boolean {
  return type === 'text' || type === 'memo';
}

/** Compute the cell-level diff between an edited JSON and the original DB bytes. */
export function diffMdbAgainstOriginal(edited: MdbJson, originalBuffer: Buffer): CellChange[] {
  const db = new MDBReader(originalBuffer);
  const originalTables = new Set(db.getTableNames());
  const changes: CellChange[] = [];

  for (const [tableName, tableJson] of Object.entries(edited.tables)) {
    if (!originalTables.has(tableName)) continue;

    const editableColumns = new Set(tableJson.columns.filter(c => isEditableTextType(c.type)).map(c => c.name));
    if (editableColumns.size === 0) continue;

    const origRows = db.getTable(tableName).getData() as Record<string, unknown>[];

    for (let i = 0; i < tableJson.rows.length; i++) {
      const editedRow = tableJson.rows[i];
      const origRow = origRows[i];
      if (!origRow) continue;

      for (const col of editableColumns) {
        const newVal = editedRow[col];
        const oldNormalized = normalizeValue(origRow[col]);
        if (newVal === oldNormalized) continue;
        if (typeof newVal !== 'string' || typeof oldNormalized !== 'string') continue;
        if (newVal === '' || oldNormalized === '') continue; // empty<->non-empty needs row reflow
        changes.push({
          table: tableName,
          rowIndex: i,
          column: col,
          oldValue: oldNormalized,
          newValue: newVal,
        });
      }
    }
  }

  return changes;
}

/**
 * Apply a single change to `buffer` in place. Returns the offset that was
 * patched on success, or a reason string on failure. The buffer is mutated.
 */
export function applyChange(
  buffer: Buffer,
  change: CellChange,
  encoding: JetTextEncoding,
): { ok: true; offset: number } | { ok: false; reason: string } {
  const oldBytes = Buffer.from(change.oldValue, encoding);
  const newBytes = Buffer.from(change.newValue, encoding);

  if (oldBytes.length !== newBytes.length) {
    return { ok: false, reason: `byte length differs (${oldBytes.length} -> ${newBytes.length})` };
  }

  const offsets: number[] = [];
  let from = 0;
  for (;;) {
    const i = buffer.indexOf(oldBytes, from);
    if (i === -1) break;
    offsets.push(i);
    from = i + 1;
  }

  if (offsets.length === 0) return { ok: false, reason: 'old value not present in raw bytes' };
  if (offsets.length > 1) return { ok: false, reason: `old value appears ${offsets.length} times (ambiguous)` };

  newBytes.copy(buffer, offsets[0]);
  return { ok: true, offset: offsets[0] };
}

export interface EncodeMdbOptions {
  /** Source `.prj` to use as the template. Defaults to the JSON's `source` field. */
  source?: string;
  /** Output path for the patched file. Defaults to `<source>.patched.prj`. */
  outFile?: string;
}

export async function encodeMdb(
  editedJsonPath: string,
  logger: Logger,
  options: EncodeMdbOptions = {},
): Promise<PatchResult> {
  const editedJson = JSON.parse(await fs.readFile(editedJsonPath, 'utf8')) as MdbJson;

  if (editedJson.format !== 'mdb') {
    throw new Error(`Expected an mdb JSON document, got format=${String(editedJson.format)}`);
  }

  const sourcePath = options.source ?? editedJson.source;
  if (!sourcePath) {
    throw new Error('No --source given and the JSON has no "source" field; cannot locate the template .prj.');
  }

  const outFile = options.outFile ?? `${sourcePath}.patched.prj`;

  logger.verbose(`Loading template ${sourcePath}`);
  const originalReadOnly = await fs.readFile(sourcePath);
  const jetVersion = detectJetVersion(originalReadOnly);
  const encoding = textEncodingForJet(jetVersion);
  logger.silly(`Jet version ${jetVersion}, text encoding ${encoding}`);

  const changes = diffMdbAgainstOriginal(editedJson, originalReadOnly);
  logger.verbose(`Diff: ${changes.length} candidate cell change${changes.length === 1 ? '' : 's'}`);

  const buffer = Buffer.from(originalReadOnly); // independent mutable copy
  const result: PatchResult = { applied: [], skipped: [], outFile };

  for (const change of changes) {
    const r = applyChange(buffer, change, encoding);
    if (r.ok) {
      logger.silly(`patched ${change.table}[${change.rowIndex}].${change.column} @ ${r.offset}`);
      result.applied.push(change);
    } else {
      logger.silly(`skipped ${change.table}[${change.rowIndex}].${change.column}: ${r.reason}`);
      result.skipped.push({ change, reason: r.reason });
    }
  }

  await fs.writeFile(outFile, buffer);
  logger.verbose(
    `Wrote ${outFile}: ${result.applied.length} applied, ${result.skipped.length} skipped, ${changes.length} total candidates`,
  );

  return result;
}
