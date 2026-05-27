/**
 * Convert a Node `Buffer` to a standalone `ArrayBuffer` containing exactly
 * the bytes of the Buffer. Buffer instances are often views onto a larger
 * shared pool, so we slice to the relevant range.
 */
export function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
