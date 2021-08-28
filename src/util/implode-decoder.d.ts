declare module 'implode-decoder' {
  import { Duplex } from 'stream';
  declare function ImplodeDecoder(): Duplex;
  export = ImplodeDecoder;
}
