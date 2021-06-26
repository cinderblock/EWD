import { promises } from 'fs';

export async function main(filename: string) {
  if (!filename) throw new Error('No filename provided');

  let expectedHeader: Buffer;

  if (filename.endsWith('.ewprj')) {
    console.log('Opening EWPRJ:', filename);
    expectedHeader = Buffer.from('CompressedElectronicsWorkbenchXML');
  } else if (filename.endsWith('.ewprj')) {
    console.log('Opening MultiSIM:', filename);
    expectedHeader = Buffer.from('MSMCompressedElectronicsWorkbenchXML');
  } else {
    throw new Error(`I don't know how to open: ${filename}`);
  }

  const file = await promises.open(filename, 'r');

  const { bytesRead, buffer } = await file.read(Buffer.allocUnsafe(expectedHeader.length), 0, expectedHeader.length, 0);

  if (bytesRead != expectedHeader.length) throw new Error('Failed to read enough bytes for the header we expect');

  console.log('Read header');
}

if (require.main === module) {
  const filename = process.argv[process.argv.length - 1];

  main(filename).catch(e => {
    throw e;
  });
}
