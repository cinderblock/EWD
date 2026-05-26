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

**Encode is in-place-edit only.** Writing a valid Jet 3 file from
scratch would mean reimplementing Access's page/B-tree storage engine,
which is out of scope. Instead `ewe` patches an existing `.prj`:

1. You decode with `ewd` to produce `<file>.prj.json`.
2. You edit the JSON in your text editor (or with a script).
3. You run `ewe edited.json` and `ewe` diffs the edited JSON against
   the original `.prj`, then byte-patches each changed cell.

Today's limits (each enforced by the encoder, with a clear "skipped"
report when violated):

- Only `text` and `memo` columns. Numeric / date / OLE edits are skipped.
- New value must have the same byte length as the old value. Length
  changes would require row reflow / free-space accounting (planned).
- Old value must appear exactly once in the file. If it's ambiguous
  (collides with another row) or missing, the change is skipped.

These constraints cover the typical vendor / price / MPN editing
workflow because those values are usually unique and you usually
substitute one same-length identifier for another. The skipped list
tells you exactly when they don't.

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

### Compressed-XML (greenfield encode from `.xml`)

```bash
bun run ewe --verbose ./samples/Temp.ewprj.xml
# or with explicit output:
bun run ewe --output ./out.ewprj ./samples/Temp.ewprj.xml
# or force a format on a non-standard extension:
bun run ewe --format multisim --output ./out.dat ./samples/Design1.ms14.xml
```

By default, strips a trailing `.xml` from each input to derive the output
path. Format is inferred from the output extension (see the table above).

### MDB in-place edits from `.json`

```bash
# Decode first to produce the editable JSON.
bun run ewd ./samples/Stocked.prj
# Edit ./samples/Stocked.prj.json in your editor / script.
# Then re-encode: ewe diffs vs the original and writes a patched copy.
bun run ewe --verbose ./samples/Stocked.prj.json
# -> samples/Stocked.prj.patched.prj
```

`ewe` recognizes `.json` inputs and routes them through the in-place
edit path. The original `.prj` location is taken from the JSON's
`source` field (or `--source <path>` to override). The patched copy
goes to `<source>.patched.prj` (or `--output <path>` to override).

Each `--verbose` run prints `N applied, M skipped` and lists every
skipped change with its reason. Skipped changes leave the file
untouched at that cell.

### Options

- `-v`, `--verbose` — log progress
- `-c`, `--concurrent` — encode multiple files in parallel
- `-o`, `--output <path>` — explicit output path (single-input only)
- `-s`, `--source <path>` — for MDB JSON inputs: override the source `.prj`
- `-f`, `--format <key>` — for compressed-XML: force a format (`ewprj` or `multisim`)
- positional args — XML or JSON files to encode

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
