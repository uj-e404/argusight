const isProd = process.env.NODE_ENV === 'production';

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, tag: string, msg: string, meta?: Record<string, unknown>) {
  if (isProd) {
    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      tag,
      msg,
      ...meta,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  } else {
    const prefix = `[${tag}]`;
    const args: unknown[] = [prefix, msg];
    if (meta) args.push(meta);
    if (level === 'error') {
      console.error(...args);
    } else if (level === 'warn') {
      console.warn(...args);
    } else {
      console.log(...args);
    }
  }
}

export const logger = {
  info: (tag: string, msg: string, meta?: Record<string, unknown>) => log('info', tag, msg, meta),
  warn: (tag: string, msg: string, meta?: Record<string, unknown>) => log('warn', tag, msg, meta),
  error: (tag: string, msg: string, meta?: Record<string, unknown>) => log('error', tag, msg, meta),
};
