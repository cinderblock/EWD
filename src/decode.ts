import { promises as fs } from 'node:fs';
import { explode } from 'node-pkware/simple';
import { detectFormatByHeader, type EwbFormat, knownFormatsList, MAX_HEADER_LENGTH } from './formats';
import { asBuffer, bufferToArrayBuffer } from './util/buffer';
import type { Logger } from './util/logger';
import { UnexpectedValue } from './util/UnexpectedValue';

function decodeBlock(block: Buffer, expectedLength: number): Buffer {
  const result = Buffer.from(explode(bufferToArrayBuffer(block)));
  if (result.length !== expectedLength) {
    throw new Error(`Decoder returned wrong length. Expected: ${expectedLength}. Got: ${result.length}.`);
  }
  return result;
}

export interface DecodedXml {
  /** The detected container format. */
  format: EwbFormat;
  /** The decompressed XML bytes. */
  xml: Buffer;
}

/**
 * Decode a compressed-XML EW container (`.ewprj`, `.ms1x`) held entirely in
 * memory. Detects the format from the magic header, decompresses every PKWare
 * section, and returns the concatenated XML. Pure: no file or console I/O.
 */
export function decodeBuffer(input: Uint8Array): DecodedXml {
  const buf = asBuffer(input);
  let pos = 0;

  const readBytes = (length: number): Buffer => {
    if (pos + length > buf.length) {
      throw new UnexpectedValue('Unexpected end of input', length, buf.length - pos);
    }
    const slice = buf.subarray(pos, pos + length);
    pos += length;
    return slice;
  };

  // Reads a little-endian unsigned integer of `size` bytes (1-8). Values that
  // wouldn't fit in a JS safe integer (bytes 6/7 set in a 7/8-byte field)
  // are rejected rather than silently truncated.
  const readUInt = (size: number): number => {
    const slice = readBytes(size);
    if ((size === 8 && (slice[6] || slice[7])) || (size === 7 && slice[6])) {
      throw new Error('Cannot handle files this large');
    }
    // Buffer.readUIntLE handles at most 6 bytes; higher bytes are zero here.
    return slice.readUIntLE(0, Math.min(size, 6));
  };

  const header = buf.subarray(0, Math.min(MAX_HEADER_LENGTH, buf.length));
  const format = detectFormatByHeader(header);
  if (!format) {
    throw new UnexpectedValue(
      `Input doesn't match any known EW format. Supported: ${knownFormatsList()}`,
      `one of ${knownFormatsList()}`,
      header.toString('ascii'),
    );
  }
  if (format.kind !== 'compressed-xml') {
    throw new Error(
      `Input is "${format.label}" (kind=${format.kind}); decodeBuffer only handles compressed-xml. ` +
        `Use decodeMdbBuffer for ${format.kind} containers.`,
    );
  }

  pos = format.header.length;
  const finalLength = readUInt(8);

  const blocks: Buffer[] = [];
  let decompressed = 0;
  while (decompressed < finalLength) {
    const length = readUInt(4);
    const blockSize = readUInt(4);
    const compressed = readBytes(blockSize);
    blocks.push(decodeBlock(compressed, length));
    decompressed += length;
  }

  return { format, xml: Buffer.concat(blocks) };
}

export async function decode(filename: string, logger: Logger, outFile = `${filename}.xml`): Promise<void> {
  if (!filename) throw new Error('No filename provided');

  logger.silly(`Reading ${filename}`);
  const { format, xml } = decodeBuffer(await fs.readFile(filename));
  logger.silly(`Detected format: ${format.label}`);

  await fs.writeFile(outFile, xml);
  logger.verbose(`Wrote ${xml.length} bytes to ${outFile}`);
}
