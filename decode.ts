import { promises } from 'fs';
import winston from 'winston';
import { UnexpectedBuffer } from './UnexpectedBuffer';

export async function decode(filename: string, logger: winston.Logger) {
  if (!filename) throw new Error('No filename provided');

  let expectedHeader: Buffer;

  if (filename.endsWith('.ewprj')) {
    logger.verbose(`Opening EWPRJ: ${filename}`);
    expectedHeader = Buffer.from('CompressedElectronicsWorkbenchXML');
  } else if (filename.endsWith('.ewprj')) {
    logger.verbose(`Opening MultiSIM: ${filename}`);
    expectedHeader = Buffer.from('MSMCompressedElectronicsWorkbenchXML');
  } else {
    throw new Error(`I don't know how to open: ${filename}`);
  }

  const file = await promises.open(filename, 'r');
  let pos = 0;

  async function read(length: number) {
    const { bytesRead, buffer } = await file.read(Buffer.allocUnsafe(length), 0, length, pos);

    pos += bytesRead;

    if (bytesRead != length) {
      logger.error(`BytesRead: ${bytesRead} ${length}`);
      throw new Error('Failed to read as many bytes as we expect');
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

  let header = await read(expectedHeader.length);

  logger.verbose('Read header successfully');

  if (!header.equals(expectedHeader)) {
    throw new UnexpectedBuffer('File header does not match', expectedHeader, header);
  }

  logger.verbose('Header matches as expected');

  const finalLength = await readNumber(8);

  if (typeof finalLength == 'bigint') throw new Error('Cannot handle files this large');

  logger.verbose(`Full size: ${finalLength}`);
}
