import { promises as fs } from 'node:fs';
import { implode } from 'node-pkware/simple';
import { type EwbFormat, formatForExtension, knownFormatsList } from './formats';
import { asBuffer, bufferToArrayBuffer } from './util/buffer';
import type { Logger } from './util/logger';

// Decompressed bytes per block. Multisim/Ultiboard ship files chunked at this
// boundary; matching it keeps the section layout identical to originals.
export const DEFAULT_BLOCK_SIZE = 900000;

function compressBlock(block: Buffer): Buffer {
  return Buffer.from(implode(bufferToArrayBuffer(block), 'ascii', 'large'));
}

/**
 * Encode XML bytes into a compressed-XML EW container, in memory. The XML is
 * split into `blockSize`-byte sections, each PKWare-imploded, and wrapped with
 * the format's magic header and section table. Pure: no file or console I/O.
 */
export function encodeBuffer(xml: Uint8Array, format: EwbFormat, options: { blockSize?: number } = {}): Buffer {
  if (format.kind !== 'compressed-xml') {
    throw new Error(
      `Encoding "${format.label}" (kind=${format.kind}) is not supported; only compressed-xml containers can be encoded.`,
    );
  }

  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
  if (blockSize <= 0) throw new RangeError('blockSize must be > 0');

  const src = asBuffer(xml);
  const parts: Buffer[] = [Buffer.from(format.header, 'latin1')];

  const sizeBuf = Buffer.allocUnsafe(8);
  sizeBuf.writeBigUInt64LE(BigInt(src.length));
  parts.push(sizeBuf);

  for (let offset = 0; offset < src.length; offset += blockSize) {
    const slice = src.subarray(offset, Math.min(offset + blockSize, src.length));
    const compressed = compressBlock(slice);

    const sectionHeader = Buffer.allocUnsafe(8);
    sectionHeader.writeUInt32LE(slice.length, 0);
    sectionHeader.writeUInt32LE(compressed.length, 4);

    parts.push(sectionHeader, compressed);
  }

  return Buffer.concat(parts);
}

/**
 * Resolve the target format. Prefers an explicit `format` override; falls back
 * to inferring from the output filename's extension.
 */
export function resolveFormat(targetFilename: string, override?: EwbFormat): EwbFormat {
  if (override) return override;
  const inferred = formatForExtension(targetFilename);
  if (!inferred) {
    throw new Error(
      `Cannot infer format for "${targetFilename}". Pass an explicit format. Known: ${knownFormatsList()}.`,
    );
  }
  return inferred;
}

/** Backward-compatible helper: returns the magic header bytes for a target filename. */
export function headerFor(targetFilename: string): Buffer {
  return Buffer.from(resolveFormat(targetFilename).header, 'latin1');
}

export function inferOutFile(inFile: string): string {
  if (inFile.endsWith('.xml')) return inFile.slice(0, -'.xml'.length);
  throw new Error(`Cannot infer output filename from ${inFile}, pass --output`);
}

export interface EncodeOptions {
  /** Output filename. Defaults to stripping a trailing `.xml` from `inFile`. */
  outFile?: string;
  /** Decompressed bytes per section. Defaults to `DEFAULT_BLOCK_SIZE`. */
  blockSize?: number;
  /** Force a specific output format. Overrides extension-based inference. */
  format?: EwbFormat;
}

export async function encode(inFile: string, logger: Logger, options: EncodeOptions = {}): Promise<void> {
  if (!inFile) throw new Error('No input filename provided');

  const outFile = options.outFile ?? inferOutFile(inFile);
  const format = resolveFormat(outFile, options.format);

  logger.verbose(`Encoding ${inFile} -> ${outFile} as ${format.label}`);

  const xml = await fs.readFile(inFile);
  const out = encodeBuffer(xml, format, { blockSize: options.blockSize });

  await fs.writeFile(outFile, out);
  logger.verbose(`Wrote ${out.length} bytes to ${outFile}`);
}
