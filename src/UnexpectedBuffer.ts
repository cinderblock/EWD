export class UnexpectedBuffer extends Error {
  constructor(name: string, public expected: Buffer, public received: Buffer) {
    super(name);
  }
}
