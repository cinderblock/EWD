/// <reference path="./util/implode-decoder.d.ts" />
/// <reference path="./util/node-pkware.d.ts" />

import { promises as fs } from 'fs';
import winston from 'winston';
import { FirstDifference } from './util/BufferFirstDifference';
import { UnexpectedValue } from './util/UnexpectedValue';
import decoder from 'implode-decoder';
import { decompress, constants } from 'node-pkware';
import { WritableStreamBuffer } from 'stream-buffers';
import { promisify } from 'util';

const compressedBlocks: Buffer[] = [];
const decompressedBlocks: string[] = [];

async function decodeBlock(block: Buffer, expectedLength: number): Promise<string> {
  const d = decoder();

  const res = new WritableStreamBuffer({ initialSize: expectedLength });
  d.pipe(res);
  d.end(block);

  const newDecoder = decompress({ debug: true, outputBufferSize: expectedLength, inputBufferSize: block.length });

  const resNew = new WritableStreamBuffer({ initialSize: expectedLength });
  resNew.write(await newDecoder(block, 'binary'));
  // resNew.end(await newDecoder(Buffer.from([]), 'binary'));

  const ret = res.getContentsAsString('ascii');
  const retNew = resNew.getContentsAsString('ascii');

  if (!ret) throw new Error('Decoder returned null');
  if (!retNew) throw new Error('Decoder returned null');

  if (ret.length !== expectedLength)
    throw new Error(`Decoder returned wrong length. Expected: ${expectedLength}. Got: ${ret.length}.`);

  if (retNew.length !== expectedLength) {
    console.log('ret:', ret.substring(retNew.length - 100, retNew.length));
    console.log('New:', retNew.substring(retNew.length - 100));

    console.log(newDecoder._state);

    throw new Error(`New Decoder returned wrong length. Expected: ${expectedLength}. Got: ${retNew.length}.`);
  }

  return ret;
}

function analyzeSection(compressed: Buffer, section: number, logger: winston.Logger): void {
  return;

  if (section === 0) {
    for (let result in compressedBlocks) {
      const diff = FirstDifference(compressedBlocks[result], compressed);
      logger.verbose(`Difference from #${result} at: ${diff ?? 'None!'}`);
    }

    compressedBlocks.push(compressed);
    logger.info('pushed' + compressedBlocks.length);
  }

  const header = Buffer.allocUnsafe(8);

  header.writeUInt32LE(length, 0);
  header.writeUInt32LE(compressed.length, 4);

  const full = Buffer.concat([header, compressed]);

  const size = section === 0 ? 20 : 160;

  logger.verbose(compressed.slice(0, size).toString('hex'));
  if (!section) logger.verbose(compressed.slice(0, size).toString());

  if (!section) logger.verbose('Matches: ' + compressed.slice(0, 103).toString('hex'));
}

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

    let section = -1;

    let decompressedBytesRead = 0;

    while (decompressedBytesRead < finalLength) {
      section++;
      const length = await readNumber(4);
      const blockSize = await readNumber(4);

      logger.verbose(`Section #${section} read ${blockSize} bytes, decompresses to ${length}`);

      const compressedData = await read(blockSize);

      decompressedBytesRead += length;

      compressedBlocks.push(compressedData);

      const decodedBlock = decodeBlock(compressedData, length);

      decompressedBlocks.push(await decodedBlock);

      analyzeSection(compressedData, section, logger);
    }
  } catch (e) {
    throw e;
  } finally {
    await file.close();
  }

  logger.verbose(`Finished reading file: ${filename}`);
}
