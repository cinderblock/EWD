import { describe, expect, test } from 'bun:test';
import { normalizeValue } from './decodeMdb';

describe('normalizeValue', () => {
  test('passes primitives through unchanged', () => {
    expect(normalizeValue('hello')).toBe('hello');
    expect(normalizeValue(42)).toBe(42);
    expect(normalizeValue(true)).toBe(true);
    expect(normalizeValue(false)).toBe(false);
  });

  test('returns null for null/undefined', () => {
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue(undefined)).toBeNull();
  });

  test('Date becomes an ISO 8601 string', () => {
    const d = new Date('2020-05-09T19:19:42.000Z');
    expect(normalizeValue(d)).toBe('2020-05-09T19:19:42.000Z');
  });

  test('Uint8Array becomes a base64 envelope', () => {
    const u8 = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(normalizeValue(u8)).toEqual({ _bytes: 'base64', value: '3q2+7w==' });
  });

  test('Buffer becomes a base64 envelope', () => {
    const buf = Buffer.from([0x01, 0x02, 0x03]);
    expect(normalizeValue(buf)).toEqual({ _bytes: 'base64', value: 'AQID' });
  });

  test('Buffer-like JSON shape ({type:"Buffer", data:[...]}) becomes a base64 envelope', () => {
    const bufLike = { type: 'Buffer', data: [0x41, 0x42, 0x43] };
    expect(normalizeValue(bufLike)).toEqual({ _bytes: 'base64', value: 'QUJD' });
  });

  test('bigint becomes a decimal string (JSON does not support bigint natively)', () => {
    expect(normalizeValue(123456789012345n)).toBe('123456789012345');
  });
});
