/**
 * LoggingUtils Unit Tests
 *
 * Tests PII redaction, URL sanitization, and object cleaning.
 * Target: 100% coverage
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Logger } from "../../logging-utils.js";

describe("Logger", () => {
  const logger = new Logger("[Test]");

  describe("sanitizeString", () => {
    it("should redact email addresses", () => {
      const input = "Contact user@example.com for details";
      const expected = "Contact [REDACTED] for details";
      expect(logger.sanitizeString(input)).toBe(expected);
    });

    it("should redact Bearer tokens", () => {
      const input = "Authorization: Bearer abcdef123456";
      const expected = "Authorization: [REDACTED]";
      expect(logger.sanitizeString(input)).toBe(expected);
    });

    it("should redact API keys in query params (via pattern)", () => {
      // If it's not a URL object but string pattern
      const input = "Request?key=AIzaSyD";
      const expected = "Request?[REDACTED]";
      expect(logger.sanitizeString(input)).toBe(expected);
    });

    it("should redact query parameters from URLs", () => {
      const input = "https://example.com/api?user=123&token=abc";
      const expected = "https://example.com/api?[REDACTED_PARAMS]";
      expect(logger.sanitizeString(input)).toBe(expected);
    });

    it("should redact query parameters from URLs embedded in text", () => {
      const input =
        "Check this url: https://site.com/path?secret=123 and this one http://insecure.com?q=test";
      const expected =
        "Check this url: https://site.com/path?[REDACTED_PARAMS] and this one http://insecure.com?[REDACTED_PARAMS]";
      expect(logger.sanitizeString(input)).toBe(expected);
    });
  });

  describe("sanitizeObject", () => {
    it("should recurse into objects", () => {
      const input = {
        name: "test",
        data: {
          email: "test@example.com",
        },
      };
      const result = logger.sanitizeObject(input);
      expect(result.data.email).toBe("[REDACTED]");
    });

    it("should redact sensitive keys", () => {
      const input = {
        authToken: "secret123",
        password: "password123",
        api_key: "key123",
        publicData: "safe",
      };
      const result = logger.sanitizeObject(input);
      expect(result.authToken).toBe("[REDACTED]");
      expect(result.password).toBe("[REDACTED]");
      expect(result.api_key).toBe("[REDACTED]");
      expect(result.publicData).toBe("safe");
    });
  });

  describe("Logging Methods with Persistence", () => {
    // Mock chrome.storage.local
    const storageMock = {
      set: vi.fn(),
    };
    global.chrome = {
      storage: {
        local: storageMock,
      },
    };
    const logger = new Logger("[PersistenceTest]");

    beforeEach(() => {
      storageMock.set.mockClear();
    });

    afterAll(() => {
      delete global.chrome;
    });

    it("should log to console.log for info", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.info("Test message");
      expect(spy).toHaveBeenCalledWith("[PersistenceTest]", "Test message");
      spy.mockRestore();
    });

    it("should persist logs to storage", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.info("Persist this");
      expect(storageMock.set).toHaveBeenCalled();
      const callArg = storageMock.set.mock.calls[0][0];
      expect(callArg.extension_logs).toBeDefined();
      const hasLog = callArg.extension_logs.some(log => log.message.includes("Persist this"));
      expect(hasLog).toBe(true);
      spy.mockRestore();
    });

    it("should sanitize arguments passed to log", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.info("User:", "user@example.com");
      expect(spy).toHaveBeenCalledWith("[PersistenceTest]", "User:", "[REDACTED]");
      spy.mockRestore();
    });

    it("should respect log levels", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logger.setLevel(Logger.LOG_LEVELS.INFO); // No debug

      logger.debug("Debug message");
      logger.info("Info message");

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();

      debugSpy.mockRestore();
      infoSpy.mockRestore();
    });
  });
});
