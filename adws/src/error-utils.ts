/**
 * Safely execute a function and return its result or a default value.
 * Useful for operations that might fail but shouldn't crash the workflow.
 */
export function withFallback<T>(
  fn: () => T,
  fallback: T
): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Safely execute an async function and return its result or a default value.
 * Useful for operations that might fail but shouldn't crash the workflow.
 */
export async function withFallbackAsync<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Create a result type for operations that can succeed or fail.
 */
export type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Safely execute a function and return a Result.
 */
export function safeExecute<T>(fn: () => T): Result<T> {
  try {
    return { success: true, data: fn() };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Safely execute an async function and return a Result.
 */
export async function safeExecuteAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}