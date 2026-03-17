export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  debug: (event: string, fields?: Record<string, unknown>) => void;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
};

type LoggerConfig = {
  level: LogLevel;
  service: string;
  workerId: string;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function nowIso(): string {
  return new Date().toISOString();
}

function writeLine(obj: Record<string, unknown>): void {
  // Keep it JSONL so it plays nicely with Docker logs, Loki, etc.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(obj));
}

export function createLogger(config: LoggerConfig): Logger {
  const min = LEVEL_ORDER[config.level];

  const base = {
    ts: undefined as string | undefined,
    level: undefined as LogLevel | undefined,
    service: config.service,
    workerId: config.workerId,
    event: undefined as string | undefined,
  };

  const log = (level: LogLevel, event: string, fields?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < min) return;
    writeLine({
      ...base,
      ts: nowIso(),
      level,
      event,
      ...(fields ?? {}),
    });
  };

  return {
    debug: (event, fields) => log('debug', event, fields),
    info: (event, fields) => log('info', event, fields),
    warn: (event, fields) => log('warn', event, fields),
    error: (event, fields) => log('error', event, fields),
  };
}
