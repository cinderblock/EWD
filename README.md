# Electronics Workbench Decoder (and Encoder?)

## Development

```bash
npm i
npm run dev -- --verbose ../path-to-file.ewprj ../path-to-file2.ewprj
```

## Progress

### 2021-06-26

_Italics_ mark my guesses that I think are right.

Using `procmon` from Sysinternals, I was able to see a bunch of distinct file reads with curiously specific read lengths. For example:

1. Read `4096` bytes at address `0`. _Checking Header_
2. Read `8` bytes at offset `33` (= `111239`)
3. Read `4` bytes at offset `41` (= `111239`)
4. Read `4` bytes at offset `45` (= `9342`)
5. Read `9342` bytes at offset `49`. _Compressed data_

This helped decode some of the byte packing and reveals some basic structure to these files.

- Header string: `MSMCompressedElectronicsWorkbenchXML` or `CompressedElectronicsWorkbenchXML`
- 8-bytes LE _final decompressed length_ = `F`
- Repeated blocks:
  - 4-bytes LE _decompressed size_ = `D`, always `<= 900000`
  - 4-bytes LE _compressed block size_ = `N`
  - `N`\-bytes of _compressed data_

After trying this on a number of example files, I can see that all of the `D`s always sum up to `F`.

I've checked each block of data against common CRC algorithms, with and without length headers, and not found a match.

Now, I'm taking a look at the first bytes of each block for patterns. I think I've found some interesting details.

The first `39` bytes of Block #0 seem to always match: `01062001e2e0c9a687606baaa51b68702478b870bc6d3074ba6550372b668b040238200e163148`.

For `.ms14` files, the first `102` bytes of Block#0 always seem to match: `01062001e2e0c9a687606baaa51b68702478b870bc6d3074ba6550372b668b040238200e16314820b3915dd36628daba590c15b2ae2130bf49f1ec7d9becac130c0c38bfa458aab241703f6168b6f315ef9048e65a6cd9dd9165738be5425ebef44dd99bc7c1`

For `.ewprj` files, the first `103` bytes of Block #0 always seem to match: `01062001e2e0c9a687606baaa51b68702478b870bc6d3074ba6550372b668b040238200e163148b8a6cd50b4f5b4182a645d4360fe91e2d9fb36d95957181870be48b1546583e07ec2d06ce72bde2191ccb5d8b25b93cded99baa3d1970f7d93f6267070712452`

Looking at all blocks, they always seem to start with the same two bytes: `0106`.

I know that many compression standards always start each block of compression with a couple header bytes. That's my guess as to what these are. However, looking at lists of common compressions I don't see `0x0106` as one.

I think this is getting close. Knowing that these files are likely "Compressed XML" files, and that the first `39` bytes of the compressed blocks always match, and XML files often start with a common header... this feels like it should be enough to brute force decoding this!

Time to try some more guesses!
