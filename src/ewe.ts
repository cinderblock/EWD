import commandLineArgs from 'command-line-args';
import winston from 'winston';
import { encode } from './encode';

export async function main() {
  const { files, output, verbose, concurrent } = commandLineArgs([
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'concurrent', alias: 'c', type: Boolean },
    { name: 'output', alias: 'o', type: String },
    { name: 'files', type: String, multiple: true, defaultOption: true },
  ]) as {
    files: string[];
    output?: string;
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
    process.exitCode = 1;
    return;
  }

  if (output && files.length > 1) {
    logger.error('--output cannot be combined with multiple input files');
    process.exitCode = 1;
    return;
  }

  if (concurrent) {
    await Promise.all(files.map(f => encode(f, logger, output)));
  } else {
    for (const f of files) {
      logger.info(`Next file: ${f}`);
      await encode(f, logger, output);
    }
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exitCode = 1;
  });
}
