import { ProviderError, RetryExhaustedError } from "./errors.js";

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

export class RetryHandler {
  private readonly options: RetryOptions;

  constructor(options?: Partial<RetryOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Wrap a normal async call with retry logic */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        if (attempt < this.options.maxRetries) {
          const delay = this.getDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new RetryExhaustedError(
      `All ${this.options.maxRetries} retries exhausted`,
      this.options.maxRetries + 1,
      { cause: lastError },
    );
  }

  /** Wrap a streaming call with retry logic */
  async *executeStream<T>(
    fn: () => AsyncIterable<T>,
  ): AsyncIterable<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        yield* fn();
        return;
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        if (attempt < this.options.maxRetries) {
          const delay = this.getDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new RetryExhaustedError(
      `All ${this.options.maxRetries} retries exhausted`,
      this.options.maxRetries + 1,
      { cause: lastError },
    );
  }

  /** Determine if an error is retryable */
  private isRetryable(error: unknown): boolean {
    // Network errors (no status code, typically TypeError or similar)
    if (!(error instanceof ProviderError)) {
      return true;
    }

    const { statusCode } = error;

    // No status code means network-level error — retryable
    if (statusCode === undefined) {
      return true;
    }

    // Rate limiting (429) — retryable
    if (statusCode === 429) {
      return true;
    }

    // Server errors (5xx) — retryable
    if (statusCode >= 500) {
      return true;
    }

    // All other 4xx (400, 401, 403, etc.) — not retryable
    return false;
  }

  /** Calculate exponential backoff delay for a given attempt */
  getDelay(attempt: number): number {
    const delay = this.options.baseDelay * Math.pow(2, attempt);
    return Math.min(delay, this.options.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
