# Electronics Workbench Decoder and Encoder

Interop tools for Electronics Workbench / Multisim / Ultiboard binary
formats. The goal: get designs and part databases out of EW into
mainstream representations (and back, where the format permits).

- **`ewd`** — decode an EW file into JSON or XML, picking the right
  decoder by reading the file's magic bytes.
- **`ewe`** — encode the text-form back into an EW binary the original
  software can re-open. Currently supports compressed-XML; `.prj` Jet
  database encode is deferred (see below).

## Supported formats

| Key        | Extension(s)       | Kind             | Decode output    |
| ---------- | ------------------ | ---------------- | ---------------- |
| `ewprj`    | `.ewprj`           | `compressed-xml` | `<file>.xml`     |
| `multisim` | `.ms10` … `.ms19`  | `compressed-xml` | `<file>.xml`     |
| `mdb`      | `.prj`, `.usr`     | `mdb`            | `<file>.json`    |

### compressed-xml (`ewprj`, `multisim`)

PKWare DCL Implode (ASCII literal mode, large dictionary) wrapped in a
small container: a magic-string header, a 64-bit LE total decompressed
length, then a sequence of `(decompressed_length: u32,
compressed_length: u32, pkware_implode_block)` sections. Multisim chunks
big files into 900 000-decompressed-byte sections; `ewe` mirrors that.

Decode and encode are both supported. A decode/encode/decode round-trip
on every sample tested produces byte-identical XML, and the resulting
files are accepted by `ewd`.

### mdb (`.prj`, `.usr`)

NI ships part libraries and project component databases as Microsoft
Access Jet 3 / Jet 4 files (despite the `.prj` / `.usr` extensions).
`ewd` reads them via [`mdb-reader`](https://www.npmjs.com/package/mdb-reader)
and emits a single JSON document with every table:

```json
{
  "format": "mdb",
  "source": "Stocked.prj",
  "tables": {
    "SYS_COMPONENT": {
      "columns": [{ "name": "Component_ID", "type": "long" }, ...],
      "rows": [{ "Component_ID": 17, "Component_Name": "BD9763FVM", ... }, ...]
    },
    ...
  }
}
```

Dates become ISO 8601 strings; binary blob fields (`ole` columns) become
`{ "_bytes": "base64", "value": "..." }` envelopes so the data survives a
JSON round-trip.

**Encode (write-back) is not implemented yet.** Writing a valid Jet 3
file from scratch would mean reimplementing Access's page/B-tree storage
engine, which is a multi-month undertaking. The planned path is in-place
edits only: read an existing `.prj`, change cell values that fit in the
existing page layout, write back. That's tractable; a full Jet writer
is not.

## Format detection

`ewd` identifies the format by reading the magic bytes at the start of
the file, so the filename extension can be anything (renamed files, no
extension, `.dat`, etc.). It then dispatches to the right decoder.

`ewe` infers the format from the **output** filename's extension; pass
`--format <key>` to override for non-standard extensions. Out-of-range
Multisim versions (e.g. `.ms9` or future `.ms20+`) need an explicit
`--format multisim`.

## Install

Requires [bun](https://bun.sh) (≥ 1.0).

```bash
bun install
```

## Decode

```bash
bun run ewd --verbose ./samples/Temp.ewprj ./samples/Design1.ms14
bun run ewd --verbose ./samples/Stocked.prj          # writes Stocked.prj.json
```

For each input, writes `<filename>.xml` (compressed-xml) or
`<filename>.json` (mdb) next to it.

Options:

- `-v`, `--verbose` — log per-section progress
- `-c`, `--concurrent` — decode multiple files in parallel
- positional args — files to decode

## Encode

```bash
bun run ewe --verbose ./samples/Temp.ewprj.xml
# or with explicit output:
bun run ewe --output ./out.ewprj ./samples/Temp.ewprj.xml
# or force a format on a non-standard extension:
bun run ewe --format multisim --output ./out.dat ./samples/Design1.ms14.xml
```

By default, strips a trailing `.xml` from each input to derive the output
path. Format is inferred from the output extension (see the table above).

Options:

- `-v`, `--verbose` — log per-section progress
- `-c`, `--concurrent` — encode multiple files in parallel
- `-o`, `--output <path>` — explicit output path (single-input only)
- `-f`, `--format <key>` — force a format (`ewprj` or `multisim`)
- positional args — XML files to encode

Trying to encode an `mdb` target fails with a clear error until
in-place-edit support lands.

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

Covers the format registry (extension matching, header detection
including the Jet magic prefix with leading NUL bytes, on-disk
detection), encoder filename helpers, `mdb` value normalization
(`Date` → ISO, OLE blobs → base64), and compressed-xml round-trip
integration (tiny `.ewprj`, tiny `.ms14`, multi-block payload that
spans more than one PKWare section, and an empty payload).

## Development

```bash
bun run dev:ewd --verbose ./samples/Temp.ewprj
bun run dev:ewe --verbose ./samples/Temp.ewprj.xml
```

Both use `bun --watch` for fast reload on source changes.

## Lint, format, and typecheck

```bash
bun run check        # biome lint + format check (no changes)
bun run check:fix    # apply all safe fixes
bun run format       # format only
bun run typecheck    # tsc --noEmit
```

CI on push/PR runs `check`, `typecheck`, and `test` on Ubuntu and Windows.
