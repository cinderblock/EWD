import { promises } from 'fs';
import winston from 'winston';
import { UnexpectedBuffer } from './UnexpectedBuffer';

export async function decode(filename: string, logger: winston.Logger) {
  if (!filename) throw new Error('No filename provided');

  let expectedHeader: Buffer;

  if (filename.endsWith('.ewprj')) {
    logger.info(`Opening EWPRJ: ${filename}`);
    expectedHeader = Buffer.from('CompressedElectronicsWorkbenchXML');
  } else if (filename.endsWith('.ewprj')) {
    logger.info(`Opening MultiSIM: ${filename}`);
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

  let header = await read(expectedHeader.length);

  logger.info('Read header successfully');

  if (!header.equals(expectedHeader)) {
    throw new UnexpectedBuffer('File header does not match', expectedHeader, header);
  }

  logger.info('Header matches as expected');
}
