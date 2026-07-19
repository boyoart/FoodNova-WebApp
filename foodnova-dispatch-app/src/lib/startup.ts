export const STARTUP_WATCHDOG_MS = 10_000;

export function startupLog(event: string, details: Record<string, unknown> = {}) {
  if (!__DEV__) return;
  console.log("DISPATCH_STARTUP", {
    at: new Date().toISOString(),
    event,
    ...details,
  });
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  code: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
