import winston from 'winston';
import { decode } from './decode';
import commandLineArgs from 'command-line-args';

export async function main() {
  const filename = process.argv[process.argv.length - 1];

  const {
    file: files,
    verbose,
    concurrent,
  } = commandLineArgs([
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'concurrent', alias: 'c', type: Boolean },
    { name: 'file', type: String, multiple: true, defaultOption: true },
  ]) as {
    file: string[];
    verbose: boolean;
    concurrent: boolean;
  };

  const logger = winston.createLogger({
    level: verbose ? 'info' : 'error',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
      new winston.transports.Console({
        format: winston.format.simple(),
      }),
    ],
  });

  if (concurrent) await Promise.all(files.map(f => decode(f, logger)));
  else for (const f of files) await decode(f, logger);
}

if (require.main === module) {
  main().catch(e => {
    throw e;
  });
}
