export class UnexpectedValue<T = string> extends Error {
  constructor(name: string, public expected: T, public received: T) {
    super(name);
  }
}
