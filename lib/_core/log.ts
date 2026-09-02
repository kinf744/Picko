const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export function devLog(...args: unknown[]): void {
  if (IS_DEV) {
    console.log(...args);
  }
}

export function devWarn(...args: unknown[]): void {
  if (IS_DEV) {
    console.warn(...args);
  }
}

export function devError(...args: unknown[]): void {
  if (IS_DEV) {
    console.error(...args);
  }
}

export const secureLog = {
  dev: devLog,
  warn: devWarn,
  error: devError,
};