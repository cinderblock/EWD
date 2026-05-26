# Electronics Workbench Decoder and Encoder

Two CLIs:

- **`ewd`** — decode an EWB project (`.ewprj`, `.ms14`) into its underlying XML.
- **`ewe`** — encode XML back into a `.ewprj`/`.ms14` the original software can re-open.

The container is a small header (`CompressedElectronicsWorkbenchXML` or
`MSMCompressedElectronicsWorkbenchXML`), then a 64-bit little-endian total
decompressed length, then a sequence of `(decompressed_length: u32, compressed_length: u32, pkware_implode_block)` sections. Compression is
PKWare DCL Implode (ASCII literal mode, large dictionary). Multisim chunks
big files into 900 000-decompressed-byte sections; `ewe` mirrors that.

## Install

Requires [bun](https://bun.sh) (≥ 1.0).

```bash
bun install
```

## Decode

```bash
bun run ewd --verbose ./samples/Temp.ewprj ./samples/Design1.ms14
```

For each input, writes `<filename>.xml` next to it.

Options:

- `-v`, `--verbose` — log per-section progress
- `-c`, `--concurrent` — decode multiple files in parallel
- positional args — files to decode

## Encode

```bash
bun run ewe --verbose ./samples/Temp.ewprj.xml
# or with explicit output:
bun run ewe --output ./out.ewprj ./samples/Temp.ewprj.xml
```

By default, strips a trailing `.xml` from each input to derive the output
path. Format is inferred from the output extension (`.ewprj` vs `.ms14`).

Options:

- `-v`, `--verbose` — log per-section progress
- `-c`, `--concurrent` — encode multiple files in parallel
- `-o`, `--output <path>` — explicit output path (single-input only)
- positional args — XML files to encode

### Compression ratio caveat

`ewe` uses [`node-pkware`](https://github.com/cinderblock/node-pkware)'s
`implode` for compression. Its repetition search is currently incomplete
(see the upstream `TODO: search for a better repetition` log lines), so
re-encoded files are several times larger than the originals. They are
still valid: a decode/encode/decode round-trip on every sample tested
produces byte-identical XML, and the resulting files are accepted by
`ewd`. Improving compression density is a `node-pkware` problem.

## Tests

```bash
bun test
```

Covers unit tests for the encoder's filename helpers and round-trip
integration tests (tiny `.ewprj`, tiny `.ms14`, multi-block payload that
spans more than one PKWare section, and an empty payload).

## Development

```bash
bun run dev:ewd --verbose ./samples/Temp.ewprj
bun run dev:ewe --verbose ./samples/Temp.ewprj.xml
```

Both use `bun --watch` for fast reload on source changes.
