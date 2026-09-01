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
    meta?: Record<string, unknown>,
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
      // Non-Error throwables (PostgrestError etc.) are plain objects, String()
      // yields "[object Object]" and destroys the diagnostic fields, so
      // serialize objects as JSON instead.
      let errMsg: string | undefined;
      if (err instanceof Error) {
        errMsg = err.message;
      } else if (err != null) {
        if (typeof err === "object") {
          try {
            errMsg = JSON.stringify(err);
          } catch {
            errMsg = String(err);
          }
        } else {
          errMsg = String(err);
        }
      }
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
