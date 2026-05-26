import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { constants, implode, stream } from 'node-pkware';
import type winston from 'winston';
import { type EwbFormat, formatForExtension, knownFormatsList } from './formats';

const { COMPRESSION_ASCII, DICTIONARY_SIZE_LARGE } = constants;
const { streamToBuffer, through } = stream;

// Decompressed bytes per block. Multisim/Ultiboard ship files chunked at this
// boundary; matching it keeps the section layout identical to originals.
export const DEFAULT_BLOCK_SIZE = 900000;

function compressBlock(block: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const src = Readable.from(block);
    const compressor = through(
      implode(COMPRESSION_ASCII, DICTIONARY_SIZE_LARGE, {
        inputBufferSize: block.length,
        outputBufferSize: block.length,
      }),
    );
    src.on('error', reject);
    compressor.on('error', reject);
    src.pipe(compressor).pipe(streamToBuffer(resolve));
  });
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
  return Buffer.from(resolveFormat(targetFilename).header, 'ascii');
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

export async function encode(inFile: string, logger: winston.Logger, options: EncodeOptions = {}): Promise<void> {
  if (!inFile) throw new Error('No input filename provided');

  const outFile = options.outFile ?? inferOutFile(inFile);
  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
  if (blockSize <= 0) throw new RangeError('blockSize must be > 0');

  const format = resolveFormat(outFile, options.format);
  const header = Buffer.from(format.header, 'ascii');

  logger.verbose(`Encoding ${inFile} -> ${outFile} as ${format.label}`);

  const xml = await fs.readFile(inFile);
  const totalLength = xml.length;
  logger.silly(`Read ${totalLength} bytes from ${inFile}`);

  const output = await fs.open(outFile, 'w');
  try {
    await output.write(header);

    const sizeBuf = Buffer.allocUnsafe(8);
    sizeBuf.writeBigUInt64LE(BigInt(totalLength));
    await output.write(sizeBuf);

    let section = 0;
    for (let offset = 0; offset < totalLength; offset += blockSize) {
      const end = Math.min(offset + blockSize, totalLength);
      const slice = xml.subarray(offset, end);

      const compressed = await compressBlock(slice);

      logger.silly(`Section #${section}: ${slice.length} bytes -> ${compressed.length} compressed`);

      const sectionHeader = Buffer.allocUnsafe(8);
      sectionHeader.writeUInt32LE(slice.length, 0);
      sectionHeader.writeUInt32LE(compressed.length, 4);

      await output.write(sectionHeader);
      await output.write(compressed);

      section++;
    }

    logger.verbose(`Wrote ${outFile} (${section} section${section === 1 ? '' : 's'})`);
  } finally {
    await output.close();
  }
}
