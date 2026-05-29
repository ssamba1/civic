import * as Sentry from "@sentry/nextjs";

export interface Logger {
  correlationId: string;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, err?: unknown, meta?: Record<string, unknown>): void;
}

export function createLogger(context: string): Logger {
  const correlationId = crypto.randomUUID();

  function emit(
    level: "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>
  ) {
    const entry = JSON.stringify({
      level,
      context,
      correlationId,
      message,
      ts: new Date().toISOString(),
      ...meta,
    });
    if (level === "error") {
      console.error(entry);
    } else if (level === "warn") {
      console.warn(entry);
    } else {
      console.log(entry);
    }
  }

  return {
    correlationId,

    info(message, meta) {
      emit("info", message, meta);
    },

    warn(message, meta) {
      emit("warn", message, meta);
    },

    error(message, err, meta) {
      const errMsg =
        err instanceof Error ? err.message : err != null ? String(err) : undefined;
      emit("error", message, { ...meta, ...(errMsg ? { err: errMsg } : {}) });

      Sentry.withScope((scope) => {
        scope.setTag("context", context);
        scope.setTag("correlationId", correlationId);
        if (meta) scope.setExtras(meta);
        if (err instanceof Error) {
          Sentry.captureException(err);
        } else {
          Sentry.captureMessage(message, "error");
        }
      });
    },
  };
}
