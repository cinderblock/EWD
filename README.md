# Electronics Workbench Decoder (and Encoder?)

Decompresses National Instruments Electronics Workbench / Multisim / Ultiboard
project files (`.ewprj`, `.ms14`) into their underlying XML.

The container is a small header (`CompressedElectronicsWorkbenchXML` or
`MSMCompressedElectronicsWorkbenchXML`) followed by a 64-bit total decompressed
length, then a sequence of `(decompressed_length: u32, compressed_length: u32, pkware_implode_block)` sections. Compression is PKWare DCL Implode (ASCII,
large dictionary).

For each input file, a `<filename>.xml` is written next to the input.

## Development

```bash
npm i
npm run dev -- --verbose ./samples/Temp.ewprj ./samples/Design1.ms14
```

CLI options:

- `-v`, `--verbose` — log per-section progress
- `-c`, `--concurrent` — decode multiple files in parallel
- positional args — files to decode
