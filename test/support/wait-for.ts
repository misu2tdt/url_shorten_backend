/**
 * Polls `probe` until it returns something truthy, then returns that value.
 * Used for work the app does after responding (click tracking); never a fixed sleep.
 */
export async function waitFor<T>(
  probe: () => Promise<T | null | undefined | false>,
  description: string,
  timeoutMs = 2000,
  intervalMs = 25,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${description}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
