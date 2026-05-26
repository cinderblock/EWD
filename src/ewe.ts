import commandLineArgs from 'command-line-args';
import winston from 'winston';
import { encode } from './encode';
import { encodeMdb } from './encodeMdb';
import { FORMATS, formatByKey, knownFormatsList } from './formats';

function looksLikeMdbJson(filename: string): boolean {
  return /\.json$/i.test(filename);
}

export async function main() {
  const { files, output, source, format, verbose, concurrent } = commandLineArgs([
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'concurrent', alias: 'c', type: Boolean },
    { name: 'output', alias: 'o', type: String },
    { name: 'source', alias: 's', type: String },
    { name: 'format', alias: 'f', type: String },
    { name: 'files', type: String, multiple: true, defaultOption: true },
  ]) as {
    files: string[];
    output?: string;
    source?: string;
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

  if (source && files.length > 1) {
    logger.error('--source cannot be combined with multiple input files');
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

  async function encodeOne(file: string): Promise<void> {
    if (looksLikeMdbJson(file)) {
      const result = await encodeMdb(file, logger, { source, outFile: output });
      logger.info(`${file} -> ${result.outFile}: ${result.applied.length} applied, ${result.skipped.length} skipped`);
      for (const s of result.skipped) {
        logger.warn(`  skipped ${s.change.table}[${s.change.rowIndex}].${s.change.column}: ${s.reason}`);
      }
      return;
    }
    await encode(file, logger, { outFile: output, format: resolvedFormat });
  }

  if (concurrent) {
    await Promise.all(files.map(encodeOne));
  } else {
    for (const f of files) {
      logger.info(`Next file: ${f}`);
      await encodeOne(f);
    }
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exitCode = 1;
  });
}
