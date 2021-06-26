import winston from 'winston';
import { decode } from './decode';

export async function main() {
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

  return decode(filename, logger);
}

if (require.main === module) {
  main().catch(e => {
    throw e;
  });
}
