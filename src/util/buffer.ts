/**
 * Convert a Node `Buffer` to a standalone `ArrayBuffer` containing exactly
 * the bytes of the Buffer. Buffer instances are often views onto a larger
 * shared pool, so we slice to the relevant range.
 */
export function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * View any `Uint8Array` as a Node `Buffer` without copying. Returns the input
 * directly if it is already a Buffer.
 */
export function asBuffer(input: Uint8Array): Buffer {
  return Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}
