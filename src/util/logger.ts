/**
 * The minimal logging surface the decode/encode functions use. A winston
 * `Logger` is structurally compatible and is what the CLIs pass in, but
 * depending on this narrow interface (rather than winston's types) keeps
 * winston out of the published type declarations — consumers of the library
 * don't have winston installed (it's bundled into the CLIs, not a dependency).
 */
export interface Logger {
  silly(message: string): void;
  verbose(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
