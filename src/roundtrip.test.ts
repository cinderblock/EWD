import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import winston from 'winston';
import { encode } from './encode';
import { decode } from './decode';

const silentLogger = winston.createLogger({
  silent: true,
  transports: [new winston.transports.Console({ silent: true })],
});

// node-pkware's implode logs `TODO: search for a better repetition` directly to
// stdout. Silence it for the duration of the suite so the test report is clean.
let originalLog: typeof console.log;
beforeAll(() => {
  originalLog = console.log;
  console.log = () => {};
});
afterAll(() => {
  console.log = originalLog;
});

async function roundtrip(original: Buffer, ext: 'ewprj' | 'ms14') {
  const dir = await mkdtemp(join(tmpdir(), 'ewd-roundtrip-'));
  try {
    const xml = join(dir, `fixture.${ext}.xml`);
    const compressed = join(dir, `fixture.${ext}`);
    const decoded = join(dir, `roundtrip.xml`);

    await writeFile(xml, original);
    await encode(xml, silentLogger);
    await decode(compressed, silentLogger, decoded);

    return await readFile(decoded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('encode + decode round-trip', () => {
  test('a tiny XML payload round-trips through .ewprj', async () => {
    const original = Buffer.from('<?xml version="1.0"?><root><child attr="v">text</child></root>');
    const result = await roundtrip(original, 'ewprj');
    expect(Buffer.compare(result, original)).toBe(0);
  });

  test('a tiny XML payload round-trips through .ms14', async () => {
    const original = Buffer.from('<?xml version="1.0"?><MSMroot><node/></MSMroot>');
    const result = await roundtrip(original, 'ms14');
    expect(Buffer.compare(result, original)).toBe(0);
  });

  test('a multi-block payload round-trips (forces > 1 section)', async () => {
    // Vary the content so blocks aren't pathologically repetitive.
    const piece = '<?xml version="1.0"?><n attr="ABCDEFGHIJKLMNOP">payload</n>\n';
    const original = Buffer.from(piece.repeat(20000)); // ~1.1 MB, > 900 000 block size
    expect(original.length).toBeGreaterThan(900_000);

    const result = await roundtrip(original, 'ewprj');
    expect(Buffer.compare(result, original)).toBe(0);
  }, 60_000);

  test('empty XML payload round-trips', async () => {
    const original = Buffer.alloc(0);
    const result = await roundtrip(original, 'ewprj');
    expect(Buffer.compare(result, original)).toBe(0);
  });
});
