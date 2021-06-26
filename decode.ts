import promises from 'fs';

export async function main(filename: string) {
  if (!filename) throw new Error('No filename provided');

  if (filename.endsWith('.ewprj')) {
    console.log('Opening EWPRJ:', filename);
  } else if (filename.endsWith('.ewprj')) {
    console.log('Opening MultiSIM:', filename);
  } else {
    throw new Error(`I don't know how to open: ${filename}`);
  }

  const file = await promises.open();
}

if (require.main === module) {
  const filename = process.argv[process.argv.length - 1];

  main(filename).catch(e => {
    throw e;
  });
}
