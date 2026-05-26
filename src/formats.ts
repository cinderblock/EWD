/**
 * Known Electronics Workbench compressed-XML container formats. Each variant
 * starts with a fixed ASCII magic header so files can be identified by content
 * regardless of extension.
 */

export interface EwbFormat {
  /** Short identifier for the `--format` CLI flag. */
  key: string;
  /** Human-readable name used in log output. */
  label: string;
  /** ASCII magic bytes at the start of the file. */
  header: string;
  /** Extensions that default to this format when no `--format` is given. */
  extensionPattern: RegExp;
}

export const FORMATS: readonly EwbFormat[] = [
  {
    key: 'ewprj',
    label: 'Ultiboard / Electronics Workbench',
    header: 'CompressedElectronicsWorkbenchXML',
    extensionPattern: /\.ewprj$/i,
  },
  {
    key: 'multisim',
    label: 'Multisim',
    header: 'MSMCompressedElectronicsWorkbenchXML',
    // Multisim 10 through 19. Verified on .ms13 and .ms14; .ms10-12 / .ms15+
    // are extrapolated. Use `--format multisim` for files outside this range.
    extensionPattern: /\.ms1\d$/i,
  },
];

export const MAX_HEADER_LENGTH = Math.max(...FORMATS.map(f => f.header.length));

export function formatByKey(key: string): EwbFormat | undefined {
  return FORMATS.find(f => f.key === key);
}

export function formatForExtension(filename: string): EwbFormat | undefined {
  return FORMATS.find(f => f.extensionPattern.test(filename));
}

/**
 * Identify a file's format from its leading bytes. Tries longest header first
 * so a shorter header that happens to be a prefix of a longer one would never
 * swallow the longer match.
 */
export function detectFormatByHeader(buffer: Buffer): EwbFormat | undefined {
  return [...FORMATS]
    .sort((a, b) => b.header.length - a.header.length)
    .find(f => {
      const expected = Buffer.from(f.header, 'ascii');
      return buffer.length >= expected.length && buffer.subarray(0, expected.length).equals(expected);
    });
}

export function knownFormatsList(): string {
  return FORMATS.map(f => `${f.key} (${f.label}, header "${f.header}")`).join('; ');
}
