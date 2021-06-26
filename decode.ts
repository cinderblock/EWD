import promises from 'fs';

const filename = process.argv[process.argv.length - 1];

if (!filename) throw new Error('No filename provided');

console.log('Opening:', filename);

// const file =

if (filename.endsWith('.ewprj')) {
  console.log('Opening EWPRJ:', filename);
} else if (filename.endsWith('.ewprj')) {
  console.log('Opening MultiSIM:', filename);
} else {
  throw new Error(`I don't know how to open: ${filename}`);
}
