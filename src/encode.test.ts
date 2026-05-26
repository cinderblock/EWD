import { describe, expect, test } from 'bun:test';
import { headerFor, inferOutFile } from './encode';

describe('headerFor', () => {
  test('returns the .ewprj header for .ewprj filenames', () => {
    expect(headerFor('foo.ewprj').toString('ascii')).toBe('CompressedElectronicsWorkbenchXML');
  });

  test('returns the .ms14 header for .ms14 filenames', () => {
    expect(headerFor('foo.ms14').toString('ascii')).toBe('MSMCompressedElectronicsWorkbenchXML');
  });

  test('throws on unknown extensions', () => {
    expect(() => headerFor('foo.txt')).toThrow(/don't know what header/);
    expect(() => headerFor('foo')).toThrow();
    expect(() => headerFor('foo.ewprj.bak')).toThrow();
  });

  test('matches the extension at the end, not anywhere', () => {
    // these all end in .ewprj or .ms14
    expect(() => headerFor('something.ewprj')).not.toThrow();
    expect(() => headerFor('dir/sub.ms14')).not.toThrow();
    // but these do not
    expect(() => headerFor('.ewprj.xml')).toThrow();
    expect(() => headerFor('.ms14.something')).toThrow();
  });
});

describe('inferOutFile', () => {
  test('strips a trailing .xml', () => {
    expect(inferOutFile('foo.ewprj.xml')).toBe('foo.ewprj');
    expect(inferOutFile('bar.ms14.xml')).toBe('bar.ms14');
  });

  test('handles paths with directories', () => {
    expect(inferOutFile('samples/Temp.ewprj.xml')).toBe('samples/Temp.ewprj');
  });

  test('throws on inputs that do not end in .xml', () => {
    expect(() => inferOutFile('foo.ewprj')).toThrow(/Cannot infer/);
    expect(() => inferOutFile('foo')).toThrow();
  });
});
