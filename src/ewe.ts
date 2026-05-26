import commandLineArgs from 'command-line-args';
import winston from 'winston';
import { encode } from './encode';
import { FORMATS, formatByKey, knownFormatsList } from './formats';

export async function main() {
  const { files, output, format, verbose, concurrent } = commandLineArgs([
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'concurrent', alias: 'c', type: Boolean },
    { name: 'output', alias: 'o', type: String },
    { name: 'format', alias: 'f', type: String },
    { name: 'files', type: String, multiple: true, defaultOption: true },
  ]) as {
    files: string[];
    output?: string;
    format?: string;
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

  let resolvedFormat: ReturnType<typeof formatByKey>;
  if (format) {
    resolvedFormat = formatByKey(format);
    if (!resolvedFormat) {
      logger.error(
        `Unknown --format "${format}". Known: ${FORMATS.map(f => f.key).join(', ')} (${knownFormatsList()})`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const options = { outFile: output, format: resolvedFormat };

  if (concurrent) {
    await Promise.all(files.map(f => encode(f, logger, options)));
  } else {
    for (const f of files) {
      logger.info(`Next file: ${f}`);
      await encode(f, logger, options);
    }
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exitCode = 1;
  });
}
