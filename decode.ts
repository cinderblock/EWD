import { promises } from 'fs';
import winston from 'winston';

export async function main(filename: string, logger: winston.Logger) {
  if (!filename) throw new Error('No filename provided');

  let expectedHeader: Buffer;

  if (filename.endsWith('.ewprj')) {
    logger.info(`Opening EWPRJ: ${filename}`);
    expectedHeader = Buffer.from('CompressedElectronicsWorkbenchXML');
  } else if (filename.endsWith('.ewprj')) {
    logger.info(`Opening MultiSIM: ${filename}`);
    expectedHeader = Buffer.from('MSMCompressedElectronicsWorkbenchXML');
  } else {
    throw new Error(`I don't know how to open: ${filename}`);
  }

  const file = await promises.open(filename, 'r');

  const { bytesRead, buffer } = await file.read(Buffer.allocUnsafe(expectedHeader.length), 0, expectedHeader.length, 0);

  if (bytesRead != expectedHeader.length) throw new Error('Failed to read enough bytes for the header we expect');

  logger.info('Read header successfully');
}

if (require.main === module) {
  const filename = process.argv[process.argv.length - 1];

  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
      new winston.transports.Console({
        format: winston.format.simple(),
      }),
    ],
  });

  main(filename, logger).catch(e => {
    throw e;
  });
}
