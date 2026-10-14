/**
 * Structured logging.
 *
 * `pino` is replaced by a small JSON logger: one line per event, level-filtered,
 * and readable in development. The shape stays `{ level, time, msg, ...fields }`
 * so existing log tooling keeps working.
 */

const LEVELS = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 };

export function createLogger(env = {}) {
  const threshold = LEVELS[env.logLevel] ?? LEVELS.info;
  const pretty = (env.nodeEnv ?? 'development') !== 'production';

  const emit = (level, fields, message) => {
    if (LEVELS[level] < threshold) return;

    const record = {
      level,
      time: new Date().toISOString(),
      ...(fields && typeof fields === 'object' && !(fields instanceof Error)
        ? fields
        : {}),
    };

    if (pretty) {
      const suffix = Object.entries(record)
        .filter(([key]) => !['level', 'time'].includes(key))
        .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
        .join(' ');
      console[level === 'fatal' || level === 'error' ? 'error' : 'log'](
        `[${level}] ${message}${suffix ? ` ${suffix}` : ''}`,
      );
      return;
    }

    console.log(JSON.stringify({ ...record, msg: message }));
  };

  const normalise = (fields) => {
    if (fields instanceof Error) {
      return { err: { message: fields.message, stack: fields.stack } };
    }
    return fields;
  };

  return {
    fatal: (fields, message = '') =>
      emit('fatal', normalise(fields), typeof fields === 'string' ? fields : message),
    error: (fields, message = '') =>
      emit('error', normalise(fields), typeof fields === 'string' ? fields : message),
    warn: (fields, message = '') =>
      emit('warn', normalise(fields), typeof fields === 'string' ? fields : message),
    info: (fields, message = '') =>
      emit('info', normalise(fields), typeof fields === 'string' ? fields : message),
    debug: (fields, message = '') =>
      emit('debug', normalise(fields), typeof fields === 'string' ? fields : message),
  };
}
