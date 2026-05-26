import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { explode, stream } from 'node-pkware';
import type winston from 'winston';
import { detectFormatByHeader, knownFormatsList, MAX_HEADER_LENGTH } from './formats';
import { UnexpectedValue } from './util/UnexpectedValue';

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

export async function decode(filename: string, logger: winston.Logger, outFile = `${filename}.xml`): Promise<void> {
  if (!filename) throw new Error('No filename provided');

  const file = await fs.open(filename, 'r');
  let pos = 0;

  async function read(length: number) {
    const { bytesRead, buffer } = await file.read(Buffer.allocUnsafe(length), 0, length, pos);

    pos += bytesRead;

    if (bytesRead !== length) {
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
    if ((size === 8 && buffer[6] && buffer[7]) || (size === 7 && buffer[6])) {
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
      const headerBuffer = await read(MAX_HEADER_LENGTH);
      const format = detectFormatByHeader(headerBuffer);

      if (!format) {
        throw new UnexpectedValue(
          `File header doesn't match any known EW format. Supported: ${knownFormatsList()}`,
          `one of ${knownFormatsList()}`,
          headerBuffer.toString('ascii'),
        );
      }

      if (format.kind !== 'compressed-xml') {
        throw new Error(
          `This file is "${format.label}" (kind=${format.kind}); decode() only handles compressed-xml. ` +
            `Dispatch through ewd.ts which routes to the correct decoder for each kind.`,
        );
      }

      // Rewind past any bytes we read beyond the actual header length.
      pos -= MAX_HEADER_LENGTH - format.header.length;
      logger.silly(`Detected format: ${format.label}`);

      const finalLength = await readNumber(8);

      if (typeof finalLength === 'bigint') throw new Error('Cannot handle files this large');

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

      logger.verbose(`Wrote ${written} bytes to ${outFile}`);
      logger.silly(`Finished reading file: ${filename}`);
    } finally {
      await outputFile.close();
    }
  } finally {
    await file.close();
  }
}
