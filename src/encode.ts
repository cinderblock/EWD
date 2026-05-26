import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { constants, implode, stream } from 'node-pkware';
import type winston from 'winston';

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

export function headerFor(targetFilename: string): Buffer {
  if (targetFilename.endsWith('.ewprj')) {
    return Buffer.from('CompressedElectronicsWorkbenchXML');
  }
  if (targetFilename.endsWith('.ms14')) {
    return Buffer.from('MSMCompressedElectronicsWorkbenchXML');
  }
  throw new Error(`I don't know what header to use for: ${targetFilename}`);
}

export function inferOutFile(inFile: string): string {
  if (inFile.endsWith('.xml')) return inFile.slice(0, -'.xml'.length);
  throw new Error(`Cannot infer output filename from ${inFile}, pass --output`);
}

export async function encode(
  inFile: string,
  logger: winston.Logger,
  outFile = inferOutFile(inFile),
  blockSize = DEFAULT_BLOCK_SIZE,
): Promise<void> {
  if (!inFile) throw new Error('No input filename provided');
  if (blockSize <= 0) throw new RangeError('blockSize must be > 0');

  const header = headerFor(outFile);

  logger.verbose(`Encoding ${inFile} -> ${outFile}`);

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
