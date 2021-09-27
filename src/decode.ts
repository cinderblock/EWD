import { promises as fs } from 'fs';
import winston from 'winston';
import { UnexpectedValue } from './util/UnexpectedValue';
import { explode, stream } from 'node-pkware';
import { Readable } from 'stream';
const { streamToBuffer, through } = stream;

async function decodeBlock(block: Buffer, expectedLength: number): Promise<Buffer> {
  const ret = await new Promise<Buffer>(resolve =>
    Readable.from(block)
      .pipe(through(explode({ inputBufferSize: block.length, outputBufferSize: expectedLength })))
      .pipe(streamToBuffer(resolve)),
  );

  if (ret.length !== expectedLength)
    throw new Error(`Decoder returned wrong length. Expected: ${expectedLength}. Got: ${ret.length}.`);

  return ret;
}

export async function decode(filename: string, logger: winston.Logger, outFile = filename + '.xml'): Promise<void> {
  if (!filename) throw new Error('No filename provided');

  let expectedHeader: Buffer;

  if (filename.endsWith('.ewprj')) {
    logger.silly(`Opening EWPRJ: ${filename}`);
    expectedHeader = Buffer.from('CompressedElectronicsWorkbenchXML');
  } else if (filename.endsWith('.ms14')) {
    logger.silly(`Opening MultiSIM: ${filename}`);
    expectedHeader = Buffer.from('MSMCompressedElectronicsWorkbenchXML');
  } else {
    throw new Error(`I don't know how to parse: ${filename}`);
  }

  const file = await fs.open(filename, 'r');
  let pos = 0;

  async function read(length: number) {
    const { bytesRead, buffer } = await file.read(Buffer.allocUnsafe(length), 0, length, pos);

    pos += bytesRead;

    if (bytesRead != length) {
      throw new UnexpectedValue('Failed to read as many bytes as we expect', length, bytesRead);
    }

    return buffer;
  }

  async function readNumber(size: 1): Promise<number>;
  async function readNumber(size: 2): Promise<number>;
  async function readNumber(size: 3): Promise<number>;
  async function readNumber(size: 4): Promise<number>;
  async function readNumber(size: 5): Promise<number>;
  async function readNumber(size: 6): Promise<number>;
  async function readNumber(size: 7): Promise<number | bigint>;
  async function readNumber(size: 8): Promise<number | bigint>;
  async function readNumber(size: number) {
    const buffer = await read(size);
    if ((size == 8 && buffer[6] && buffer[7]) || (size == 7 && buffer[6])) {
      return buffer.readBigUInt64LE();
    }

    if (size > 8) throw new RangeError('Cannot handle size > 8');

    // Buffer.readUIntLE() can only handle number up to 6 bytes
    if (size >= 6) size = 6;

    return buffer.readUIntLE(0, size);
  }

  let written = 0;

  try {
    logger.silly(`Opening ${outFile} for output`);
    const outputFile = await fs.open(outFile, 'w');

    try {
      let header = await read(expectedHeader.length);

      logger.silly('Read header successfully');

      if (!header.equals(expectedHeader)) {
        throw new UnexpectedValue('File header does not match', expectedHeader, header);
      }

      logger.silly('Header matches as expected');

      const finalLength = await readNumber(8);

      if (typeof finalLength == 'bigint') throw new Error('Cannot handle files this large');

      logger.silly(`Full size: ${finalLength}`);

      let section = -1;

      let decompressedBytesRead = 0;

      while (decompressedBytesRead < finalLength) {
        section++;
        const length = await readNumber(4);
        const blockSize = await readNumber(4);

        logger.silly(`Section #${section} read ${blockSize} bytes, decompresses to ${length}`);

        const compressedData = await read(blockSize);

        decompressedBytesRead += length;

        const decodedBlock = await decodeBlock(compressedData, length);

        written += (await outputFile.write(decodedBlock)).bytesWritten;
      }

      await Promise.all([outputFile.close(), file.close()]);

      logger.verbose(`Wrote ${written} bytes to ${outFile}`);
      logger.silly(`Finished reading file: ${filename}`);
    } catch (e) {
      await outputFile.close();
      throw e;
    }
  } catch (e) {
    await file.close();
    throw e;
  }
}
