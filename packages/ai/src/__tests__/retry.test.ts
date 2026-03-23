import { describe, it, expect, vi } from "vitest";
import { RetryHandler } from "../retry.js";
import { ProviderError, RetryExhaustedError } from "../errors.js";

describe("RetryHandler", () => {
  // Use tiny delays for fast tests
  const fastOptions = { maxRetries: 3, baseDelay: 1, maxDelay: 100 };

  describe("execute", () => {
    it("should return result on first success", async () => {
      const handler = new RetryHandler(fastOptions);
      const fn = vi.fn().mockResolvedValue("ok");

      const result = await handler.execute(fn);

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable errors and succeed", async () => {
      const handler = new RetryHandler(fastOptions);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ProviderError("server error", "openai", 500))
        .mockRejectedValueOnce(new ProviderError("server error", "openai", 503))
        .mockResolvedValue("recovered");

      const result = await handler.execute(fn);

      expect(result).toBe("recovered");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should retry on rate limit (429) errors", async () => {
      const handler = new RetryHandler(fastOptions);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ProviderError("rate limited", "openai", 429))
        .mockResolvedValue("ok");

      const result = await handler.execute(fn);

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should retry on network errors (non-ProviderError)", async () => {
      const handler = new RetryHandler(fastOptions);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValue("ok");

      const result = await handler.execute(fn);

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should NOT retry on auth failure (401)", async () => {
      const handler = new RetryHandler(fastOptions);
      const authError = new ProviderError("unauthorized", "openai", 401);
      const fn = vi.fn().mockRejectedValue(authError);

      await expect(handler.execute(fn)).rejects.toThrow(authError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on forbidden (403)", async () => {
      const handler = new RetryHandler(fastOptions);
      const forbiddenError = new ProviderError("forbidden", "openai", 403);
      const fn = vi.fn().mockRejectedValue(forbiddenError);

      await expect(handler.execute(fn)).rejects.toThrow(forbiddenError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on bad request (400)", async () => {
      const handler = new RetryHandler(fastOptions);
      const badReqError = new ProviderError("bad request", "openai", 400);
      const fn = vi.fn().mockRejectedValue(badReqError);

      await expect(handler.execute(fn)).rejects.toThrow(badReqError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should throw RetryExhaustedError when all retries fail", async () => {
      const handler = new RetryHandler(fastOptions);
      const serverError = new ProviderError("server error", "openai", 500);
      const fn = vi.fn().mockRejectedValue(serverError);

      await expect(handler.execute(fn)).rejects.toThrow(RetryExhaustedError);
      // 1 initial + 3 retries = 4 total
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it("should include last error as cause in RetryExhaustedError", async () => {
      const handler = new RetryHandler(fastOptions);
      const lastError = new ProviderError("final failure", "openai", 500);
      const fn = vi.fn().mockRejectedValue(lastError);

      try {
        await handler.execute(fn);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RetryExhaustedError);
        expect((err as RetryExhaustedError).cause).toBe(lastError);
        expect((err as RetryExhaustedError).attempts).toBe(4);
      }
    });
  });

  describe("executeStream", () => {
    it("should yield all items on first success", async () => {
      const handler = new RetryHandler(fastOptions);
      async function* gen() {
        yield 1;
        yield 2;
        yield 3;
      }

      const results: number[] = [];
      for await (const item of handler.executeStream(gen)) {
        results.push(item);
      }

      expect(results).toEqual([1, 2, 3]);
    });

    it("should retry stream on retryable error", async () => {
      const handler = new RetryHandler(fastOptions);
      let callCount = 0;

      function makeStream() {
        callCount++;
        async function* gen(): AsyncIterable<number> {
          if (callCount === 1) {
            throw new ProviderError("server error", "openai", 500);
          }
          yield 1;
          yield 2;
        }
        return gen();
      }

      const results: number[] = [];
      for await (const item of handler.executeStream(makeStream)) {
        results.push(item);
      }

      expect(results).toEqual([1, 2]);
      expect(callCount).toBe(2);
    });

    it("should NOT retry stream on non-retryable error", async () => {
      const handler = new RetryHandler(fastOptions);
      const authError = new ProviderError("unauthorized", "openai", 401);

      function makeFailingStream(): AsyncIterable<number> {
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                return Promise.reject(authError);
              },
            };
          },
        };
      }

      const results: number[] = [];
      await expect(async () => {
        for await (const item of handler.executeStream(makeFailingStream)) {
          results.push(item);
        }
      }).rejects.toThrow(authError);
    });

    it("should throw RetryExhaustedError when all stream retries fail", async () => {
      const handler = new RetryHandler(fastOptions);
      const serverError = new ProviderError("server error", "openai", 500);

      function makeFailingStream(): AsyncIterable<number> {
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                return Promise.reject(serverError);
              },
            };
          },
        };
      }

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const item of handler.executeStream(makeFailingStream)) {
          // consume
        }
      }).rejects.toThrow(RetryExhaustedError);
    });
  });

  describe("getDelay", () => {
    it("should calculate exponential backoff", () => {
      const handler = new RetryHandler({ baseDelay: 1000, maxDelay: 30000 });

      expect(handler.getDelay(0)).toBe(1000);
      expect(handler.getDelay(1)).toBe(2000);
      expect(handler.getDelay(2)).toBe(4000);
      expect(handler.getDelay(3)).toBe(8000);
    });

    it("should cap delay at maxDelay", () => {
      const handler = new RetryHandler({ baseDelay: 1000, maxDelay: 5000 });

      expect(handler.getDelay(0)).toBe(1000);
      expect(handler.getDelay(1)).toBe(2000);
      expect(handler.getDelay(2)).toBe(4000);
      expect(handler.getDelay(3)).toBe(5000); // capped
      expect(handler.getDelay(10)).toBe(5000); // still capped
    });
  });

  describe("default options", () => {
    it("should use default maxRetries=3, baseDelay=1000, maxDelay=30000", () => {
      const handler = new RetryHandler();

      // Verify defaults via getDelay
      expect(handler.getDelay(0)).toBe(1000);
      expect(handler.getDelay(1)).toBe(2000);
      expect(handler.getDelay(2)).toBe(4000);
    });
  });
});
