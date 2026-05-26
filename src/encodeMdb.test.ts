import { describe, expect, test } from 'bun:test';
import { applyChange, detectJetVersion, textEncodingForJet } from './encodeMdb';

function jetHeader(versionByte: number): Buffer {
  const buf = Buffer.alloc(64);
  buf[0] = 0x00;
  buf[1] = 0x01;
  buf[2] = 0x00;
  buf[3] = 0x00;
  buf.write('Standard Jet DB', 4, 'latin1');
  buf[0x14] = versionByte;
  return buf;
}

describe('detectJetVersion', () => {
  test('returns 3 for version byte 0x00', () => {
    expect(detectJetVersion(jetHeader(0x00))).toBe(3);
  });

  test('returns 4 for version byte 0x01', () => {
    expect(detectJetVersion(jetHeader(0x01))).toBe(4);
  });

  test('throws on an unrecognized version byte', () => {
    expect(() => detectJetVersion(jetHeader(0x09))).toThrow(/Unknown Jet version/);
  });
});

describe('textEncodingForJet', () => {
  test('Jet 3 uses latin1', () => {
    expect(textEncodingForJet(3)).toBe('latin1');
  });

  test('Jet 4 uses utf16le', () => {
    expect(textEncodingForJet(4)).toBe('utf16le');
  });
});

describe('applyChange', () => {
  const change = (oldValue: string, newValue: string) => ({
    table: 'T',
    rowIndex: 0,
    column: 'C',
    oldValue,
    newValue,
  });

  test('patches a unique same-length value in latin1', () => {
    const buf = Buffer.from('prefix WM10134CT-ND suffix unique data', 'latin1');
    const r = applyChange(buf, change('WM10134CT-ND', 'WMTESTING-ND'), 'latin1');
    expect(r).toEqual({ ok: true, offset: 7 });
    expect(buf.toString('latin1')).toBe('prefix WMTESTING-ND suffix unique data');
  });

  test('refuses when the byte length differs', () => {
    const buf = Buffer.from('hello world', 'latin1');
    const r = applyChange(buf, change('hello', 'hellos'), 'latin1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/byte length differs/);
    expect(buf.toString('latin1')).toBe('hello world'); // unchanged
  });

  test('refuses when the old value is missing', () => {
    const buf = Buffer.from('hello world', 'latin1');
    const r = applyChange(buf, change('absent', 'newval'), 'latin1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not present/);
  });

  test('refuses when the old value is ambiguous', () => {
    const buf = Buffer.from('foo bar foo baz', 'latin1');
    const r = applyChange(buf, change('foo', 'qux'), 'latin1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/2 times/);
    expect(buf.toString('latin1')).toBe('foo bar foo baz'); // unchanged
  });

  test('works with utf16le (Jet 4) encoding', () => {
    const buf = Buffer.concat([
      Buffer.from('prefix', 'latin1'),
      Buffer.from('OldVal', 'utf16le'),
      Buffer.from('suffix uniq', 'latin1'),
    ]);
    const r = applyChange(buf, change('OldVal', 'NewVal'), 'utf16le');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const patched = buf.subarray(r.offset, r.offset + 12).toString('utf16le');
      expect(patched).toBe('NewVal');
    }
  });

  test('only patches one occurrence (mutates buffer in place)', () => {
    const original = Buffer.from('aaa unique12 bbb', 'latin1');
    const buf = Buffer.from(original);
    const r = applyChange(buf, change('unique12', 'changed!'), 'latin1');
    expect(r.ok).toBe(true);
    expect(buf.toString('latin1')).toBe('aaa changed! bbb');
    expect(original.toString('latin1')).toBe('aaa unique12 bbb'); // original Buffer untouched
  });
});
