import winston from 'winston';
import { decode } from './decode';
import commandLineArgs from 'command-line-args';

export async function main() {
  const filename = process.argv[process.argv.length - 1];

  const { files, verbose, concurrent } = commandLineArgs([
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'concurrent', alias: 'c', type: Boolean },
    { name: 'files', type: String, multiple: true, defaultOption: true },
  ]) as {
    files: string[];
    verbose: boolean;
    concurrent: boolean;
  };

  const logger = winston.createLogger({
    level: verbose ? 'verbose' : 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      }),
    ],
  });

  if (!files) {
    logger.error('No files specified');
    return;
  }

  if (concurrent) await Promise.all(files.map(f => decode(f, logger)));
  else
    for (const f of files) {
      logger.info(`Next file: ${f}`);
      await decode(f, logger);
    }
}

if (require.main === module) {
  main().catch(e => {
    throw e;
  });
}
