import { describe, expect, test } from 'bun:test';
import { detectFormatByHeader, FORMATS, formatByKey, formatForExtension, knownFormatsList } from './formats';

const EWPRJ_HEADER = 'CompressedElectronicsWorkbenchXML';
const MULTISIM_HEADER = 'MSMCompressedElectronicsWorkbenchXML';

describe('FORMATS table', () => {
  test('every entry has a unique key', () => {
    const keys = FORMATS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every entry has a unique header', () => {
    const headers = FORMATS.map(f => f.header);
    expect(new Set(headers).size).toBe(headers.length);
  });
});

describe('formatByKey', () => {
  test('returns ewprj for "ewprj"', () => {
    expect(formatByKey('ewprj')?.header).toBe(EWPRJ_HEADER);
  });

  test('returns multisim for "multisim"', () => {
    expect(formatByKey('multisim')?.header).toBe(MULTISIM_HEADER);
  });

  test('returns undefined for unknown keys', () => {
    expect(formatByKey('nope')).toBeUndefined();
    expect(formatByKey('')).toBeUndefined();
  });
});

describe('formatForExtension', () => {
  test.each(['file.ewprj', 'a/b/c.ewprj'])('matches %s as ewprj', name => {
    expect(formatForExtension(name)?.key).toBe('ewprj');
  });

  test.each(['x.ms10', 'x.ms11', 'x.ms12', 'x.ms13', 'x.ms14', 'x.ms15', 'x.ms19'])('matches %s as multisim', name => {
    expect(formatForExtension(name)?.key).toBe('multisim');
  });

  test.each([
    'x.ms9',
    'x.ms20',
    'x.ms100',
    'x.txt',
    'x',
    'x.xml',
  ])('returns undefined for %s (outside known patterns)', name => {
    expect(formatForExtension(name)).toBeUndefined();
  });
});

describe('detectFormatByHeader', () => {
  test('detects EWPRJ from its magic bytes', () => {
    const buf = Buffer.from(`${EWPRJ_HEADER}\x00\x00\x00\x00\x00\x00\x00\x00`, 'ascii');
    expect(detectFormatByHeader(buf)?.key).toBe('ewprj');
  });

  test('detects Multisim from its magic bytes', () => {
    const buf = Buffer.from(`${MULTISIM_HEADER}\x00\x00\x00\x00\x00\x00\x00\x00`, 'ascii');
    expect(detectFormatByHeader(buf)?.key).toBe('multisim');
  });

  test('detects EWPRJ even when the buffer carries extra trailing bytes (no false MSM match)', () => {
    // EWPRJ's header is a substring of MSM's header, but it appears at offset 3,
    // not at offset 0. So a buffer starting with the EWPRJ header but extending
    // longer must still resolve to EWPRJ, not MSM.
    const buf = Buffer.concat([Buffer.from(EWPRJ_HEADER, 'ascii'), Buffer.alloc(20)]);
    expect(detectFormatByHeader(buf)?.key).toBe('ewprj');
  });

  test('returns undefined for unrecognized headers', () => {
    expect(detectFormatByHeader(Buffer.from('NotAnEWFile1234567890', 'ascii'))).toBeUndefined();
    expect(detectFormatByHeader(Buffer.alloc(50))).toBeUndefined();
  });

  test('returns undefined when the buffer is too short to fit any header', () => {
    expect(detectFormatByHeader(Buffer.from('Compressed', 'ascii'))).toBeUndefined();
  });
});

describe('knownFormatsList', () => {
  test('includes every format key', () => {
    const summary = knownFormatsList();
    for (const f of FORMATS) {
      expect(summary).toContain(f.key);
      expect(summary).toContain(f.label);
    }
  });
});
