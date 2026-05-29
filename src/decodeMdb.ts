/**
 * Decode an NI Electronics Workbench component database (`.prj` / `.usr`)
 * to a single JSON file containing every table.
 *
 * The container is a Microsoft Access Jet 3 / Jet 4 database. We use
 * `mdb-reader` for the low-level page/B-tree work and just normalize the
 * results into a portable JSON shape:
 *
 *     {
 *       "format": "mdb",
 *       "source": "<filename>",
 *       "tables": {
 *         "<TableName>": {
 *           "columns": [{ "name": "...", "type": "..." }, ...],
 *           "rows": [{ "<col>": <value>, ... }, ...]
 *         },
 *         ...
 *       }
 *     }
 *
 * - Dates are emitted as ISO 8601 strings.
 * - OLE / binary blob values become `{ "_bytes": "base64", "value": "..." }`
 *   so they survive a JSON round-trip (important for the future in-place
 *   edit path).
 */

import { promises as fs } from 'node:fs';
import MDBReader from 'mdb-reader';
import { asBuffer } from './util/buffer';
import type { Logger } from './util/logger';

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TableJson {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
}

export interface MdbJson {
  format: 'mdb';
  source: string;
  tables: Record<string, TableJson>;
}

interface BufferLike {
  type: 'Buffer';
  data: number[];
}

function isBufferLike(v: unknown): v is BufferLike {
  return typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'Buffer';
}

export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) {
    return { _bytes: 'base64', value: Buffer.from(value).toString('base64') };
  }
  if (isBufferLike(value)) {
    return { _bytes: 'base64', value: Buffer.from(value.data).toString('base64') };
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

/**
 * Decode an NI EW component database (Jet 3 / Jet 4) held in memory into a
 * portable JS object: every table as `{ columns, rows }` with rows as plain
 * objects. Dates become ISO strings, OLE/binary blobs become base64
 * envelopes. Pure: no file or console I/O.
 */
export function decodeMdbBuffer(input: Uint8Array, source = '<buffer>'): MdbJson {
  const db = new MDBReader(asBuffer(input));
  const tables: Record<string, TableJson> = {};

  for (const name of db.getTableNames()) {
    const table = db.getTable(name);
    const columns: ColumnInfo[] = table.getColumns().map(c => ({ name: c.name, type: c.type }));
    const rows = table.getData().map(row => {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) normalized[k] = normalizeValue(v);
      return normalized;
    });
    tables[name] = { columns, rows };
  }

  return { format: 'mdb', source, tables };
}

export async function decodeMdb(filename: string, logger: Logger, outFile = `${filename}.json`): Promise<void> {
  if (!filename) throw new Error('No filename provided');

  logger.verbose(`Reading ${filename}`);
  const buf = await fs.readFile(filename);
  const json = decodeMdbBuffer(buf, filename);

  const tableCount = Object.keys(json.tables).length;
  const rowCount = Object.values(json.tables).reduce((n, t) => n + t.rows.length, 0);
  logger.silly(`Parsed ${tableCount} tables, ${rowCount} rows total`);

  await fs.writeFile(outFile, JSON.stringify(json, null, 2));
  logger.verbose(`Wrote ${outFile}`);
}
