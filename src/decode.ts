import { promises as fs } from 'fs';
import winston from 'winston';
import { FirstDifference } from './util/BufferFirstDifference';
import { UnexpectedValue } from './util/UnexpectedValue';
import zlib from 'zlib';
import { promisify } from 'util';

const inflate = promisify(zlib.inflate);

const results: Buffer[] = [];

export async function decode(filename: string, logger: winston.Logger) {
  if (!filename) throw new Error('No filename provided');

  let expectedHeader: Buffer;

  if (filename.endsWith('.ewprj')) {
    logger.verbose(`Opening EWPRJ: ${filename}`);
    expectedHeader = Buffer.from('CompressedElectronicsWorkbenchXML');
  } else if (filename.endsWith('.ms14')) {
    logger.verbose(`Opening MultiSIM: ${filename}`);
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

  try {
    let header = await read(expectedHeader.length);

    logger.verbose('Read header successfully');

    if (!header.equals(expectedHeader)) {
      throw new UnexpectedValue('File header does not match', expectedHeader, header);
    }

    logger.verbose('Header matches as expected');

    const finalLength = await readNumber(8);

    if (typeof finalLength == 'bigint') throw new Error('Cannot handle files this large');

    logger.verbose(`Full size: ${finalLength}`);

    let i = 0;

    let bytesRead = 0;

    while (bytesRead < finalLength) {
      const length = await readNumber(4);
      const blockSize = await readNumber(4);

      logger.verbose(`Section #${i} read ${blockSize} bytes, decompresses to ${length}`);

      const buffer = await read(blockSize);

      bytesRead += length;

      if (!i) {
        for (let result in results) {
          const diff = FirstDifference(results[result], buffer);
          logger.verbose(`Difference from #${result} at: ${diff ?? 'None!'}`);
        }

        results.push(buffer);
        logger.info('pushed' + results.length);
      }

      const header = Buffer.allocUnsafe(8);

      header.writeUInt32LE(length, 0);
      header.writeUInt32LE(blockSize, 4);

      const full = Buffer.concat([header, buffer]);

      const size = i ? 20 : 160;

      logger.verbose(buffer.slice(0, size).toString('hex'));
      if (!i) logger.verbose(buffer.slice(0, size).toString());

      if (!i) logger.verbose('Matches: ' + buffer.slice(0, 103).toString('hex'));

      i++;
    }
  } catch (e) {
    throw e;
  } finally {
    await file.close();
  }
}
