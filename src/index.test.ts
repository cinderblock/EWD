import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type DecodeResult,
  decodeBuffer,
  decodeFile,
  decodeMdbBuffer,
  detectFormatByHeader,
  type EwbFormat,
  encodeBuffer,
  FORMATS,
  formatByKey,
} from './index';

// node-pkware's implode logs to stdout; keep the test report clean.
let originalLog: typeof console.log;
beforeAll(() => {
  originalLog = console.log;
  console.log = () => {};
});
afterAll(() => {
  console.log = originalLog;
});

const ewprj = formatByKey('ewprj') as EwbFormat;
const multisim = formatByKey('multisim') as EwbFormat;
const mdb = formatByKey('mdb') as EwbFormat;

describe('public API surface', () => {
  test('exposes the expected callable exports', () => {
    for (const fn of [decodeBuffer, encodeBuffer, decodeMdbBuffer, decodeFile, formatByKey, detectFormatByHeader]) {
      expect(typeof fn).toBe('function');
    }
    expect(Array.isArray(FORMATS)).toBe(true);
    expect(FORMATS.length).toBeGreaterThan(0);
  });
});

describe('encodeBuffer / decodeBuffer round-trip', () => {
  test('round-trips a small XML payload through the ewprj format', () => {
    const xml = Buffer.from('<?xml version="1.0"?><root><child attr="v">text</child></root>');
    const { format, xml: out } = decodeBuffer(encodeBuffer(xml, ewprj));
    expect(format.key).toBe('ewprj');
    expect(Buffer.compare(out, xml)).toBe(0);
  });

  test('round-trips a multi-block payload (small blockSize forces >1 section)', () => {
    const xml = Buffer.from('<n>ABCDEFGHIJKLMNOP</n>'.repeat(50));
    const encoded = encodeBuffer(xml, multisim, { blockSize: 64 });
    const { format, xml: out } = decodeBuffer(encoded);
    expect(format.key).toBe('multisim');
    expect(Buffer.compare(out, xml)).toBe(0);
  });

  test('round-trips an empty payload', () => {
    const xml = Buffer.alloc(0);
    const { xml: out } = decodeBuffer(encodeBuffer(xml, ewprj));
    expect(out.length).toBe(0);
  });

  test('decodeBuffer rejects a non-compressed-xml (mdb) header', () => {
    const jet = Buffer.concat([Buffer.from('\x00\x01\x00\x00Standard Jet DB', 'latin1'), Buffer.alloc(40)]);
    expect(() => decodeBuffer(jet)).toThrow(/only handles compressed-xml/);
  });

  test('encodeBuffer rejects a non-compressed-xml format', () => {
    expect(() => encodeBuffer(Buffer.from('x'), mdb)).toThrow(/only compressed-xml/);
  });
});

describe('decodeFile (filename -> in-memory values)', () => {
  test('reads a compressed-xml file and returns the XML bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ewd-api-'));
    try {
      const xml = Buffer.from('<?xml version="1.0"?><MSMroot><node/></MSMroot>');
      const path = join(dir, 'sample.ms14');
      await writeFile(path, encodeBuffer(xml, multisim));

      const result: DecodeResult = await decodeFile(path);
      expect(result.kind).toBe('compressed-xml');
      if (result.kind === 'compressed-xml') {
        expect(result.format.key).toBe('multisim');
        expect(result.xml.toString()).toBe(xml.toString());
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects a file matching no known format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ewd-api-'));
    try {
      const path = join(dir, 'nope.bin');
      await writeFile(path, Buffer.from('not an EW file', 'utf8'));
      await expect(decodeFile(path)).rejects.toThrow(/known EW format/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('decodeMdbBuffer', () => {
  test('throws on input that is not a Jet database', () => {
    expect(() => decodeMdbBuffer(Buffer.alloc(32))).toThrow();
  });
});
