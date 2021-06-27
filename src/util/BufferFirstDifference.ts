export function FirstDifference(a: Buffer, b: Buffer) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return i;
  }

  return null;
}
