const IS_PROD = process.env.NODE_ENV === "production";

function devLog(...args: unknown[]): void {
  if (!IS_PROD) {
    console.log(...args);
  }
}

function devWarn(...args: unknown[]): void {
  if (!IS_PROD) {
    console.warn(...args);
  }
}

function devError(...args: unknown[]): void {
  if (!IS_PROD) {
    console.error(...args);
  }
}

function prodError(scope: string, err: unknown): void {
  console.error(`[${scope}]`, err instanceof Error ? err.message : String(err));
}

export const log = {
  dev: devLog,
  warn: devWarn,
  error: prodError,
};