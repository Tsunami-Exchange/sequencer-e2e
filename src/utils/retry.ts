type Options<T> = {
  maxRetries: number;
  shouldRetry?: (error: Error | null, result: T | null) => boolean;
};

export const retry = async <T>(fn: () => T | Promise<T>, options: Options<T>): Promise<T> => {
  let left = options.maxRetries;
  while (left > 0) {
    try {
      const result = await fn();
      const shouldRetry = options.shouldRetry?.(null, result) ?? false;
      if (!shouldRetry) {
        return result;
      }
    } catch (e) {
      const shouldRetry = options.shouldRetry?.(e as Error, null) ?? true;
      if (!shouldRetry) {
        throw e;
      }
    } finally {
      left--;
    }
  }
  throw new Error('Max retries exceeded');
};
