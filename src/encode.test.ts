import { describe, expect, test } from 'bun:test';
import { headerFor, inferOutFile } from './encode';

const EWPRJ_HEADER = 'CompressedElectronicsWorkbenchXML';
const MULTISIM_HEADER = 'MSMCompressedElectronicsWorkbenchXML';

describe('headerFor', () => {
  test('returns the EWPRJ header for .ewprj filenames', () => {
    expect(headerFor('foo.ewprj').toString('ascii')).toBe(EWPRJ_HEADER);
  });

  test.each([
    'foo.ms10',
    'foo.ms11',
    'foo.ms12',
    'foo.ms13',
    'foo.ms14',
    'foo.ms19',
  ])('returns the Multisim header for %s', name => {
    expect(headerFor(name).toString('ascii')).toBe(MULTISIM_HEADER);
  });

  test('throws on unknown extensions', () => {
    expect(() => headerFor('foo.txt')).toThrow(/Cannot infer format/);
    expect(() => headerFor('foo')).toThrow();
    expect(() => headerFor('foo.ewprj.bak')).toThrow();
  });

  test('matches the extension at the end, not anywhere', () => {
    expect(() => headerFor('something.ewprj')).not.toThrow();
    expect(() => headerFor('dir/sub.ms14')).not.toThrow();
    expect(() => headerFor('.ewprj.xml')).toThrow();
    expect(() => headerFor('.ms14.something')).toThrow();
  });

  test('does not match Multisim versions outside the verified range', () => {
    // .ms9 and .ms20+ aren't in the conservative pattern; user can pass --format multisim
    expect(() => headerFor('foo.ms9')).toThrow();
    expect(() => headerFor('foo.ms20')).toThrow();
  });
});

describe('inferOutFile', () => {
  test('strips a trailing .xml', () => {
    expect(inferOutFile('foo.ewprj.xml')).toBe('foo.ewprj');
    expect(inferOutFile('bar.ms14.xml')).toBe('bar.ms14');
    expect(inferOutFile('baz.ms10.xml')).toBe('baz.ms10');
  });

  test('handles paths with directories', () => {
    expect(inferOutFile('samples/Temp.ewprj.xml')).toBe('samples/Temp.ewprj');
  });

  test('throws on inputs that do not end in .xml', () => {
    expect(() => inferOutFile('foo.ewprj')).toThrow(/Cannot infer/);
    expect(() => inferOutFile('foo')).toThrow();
  });
});
