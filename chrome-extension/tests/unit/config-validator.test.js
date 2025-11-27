/**
 * ConfigValidator Unit Tests
 *
 * Tests URL validation, cache duration validation, and error messages.
 * Target: 100% coverage
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the config module exports
// Since config.js uses module.exports, we need to dynamically import it
const { ConfigValidator, DEFAULT_CONFIG } = await import("../../config.js");

describe("ConfigValidator", () => {
  describe("URL Validation", () => {
    it("should validate HTTPS URLs", () => {
      const result = ConfigValidator.validate({
        backendUrl: "https://api.example.com",
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject HTTP URLs for non-localhost hosts", () => {
      const result = ConfigValidator.validate({
        backendUrl: "http://api.example.com",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "backendUrl must be a valid HTTP/HTTPS URL",
      );
    });

    it("should accept HTTP URLs for localhost", () => {
      const result = ConfigValidator.validate({
        backendUrl: "http://localhost:8000",
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept HTTP URLs for 127.0.0.1", () => {
      const result = ConfigValidator.validate({
        backendUrl: "http://127.0.0.1:8000",
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept HTTP URLs with allowInsecureUrls flag enabled", () => {
      // Spy on console.warn to verify warning is logged
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = ConfigValidator.validate({
        backendUrl: "http://api.staging.example.com",
        allowInsecureUrls: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should log warning when allowInsecureUrls is enabled", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      ConfigValidator.validate({
        allowInsecureUrls: true,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("SECURITY WARNING"),
      );

      warnSpy.mockRestore();
    });

    it("should reject invalid URL formats", () => {
      const result = ConfigValidator.validate({
        backendUrl: "not-a-valid-url",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "backendUrl must be a valid HTTP/HTTPS URL",
      );
    });

    it("should reject non-HTTP/HTTPS protocols", () => {
      const protocols = [
        "ftp://example.com",
        "file:///path/to/file",
        "mailto:test@example.com",
      ];

      protocols.forEach((url) => {
        const result = ConfigValidator.validate({
          backendUrl: url,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          "backendUrl must be a valid HTTP/HTTPS URL",
        );
      });
    });

    it("should validate backendUrl as string type", () => {
      const result = ConfigValidator.validate({
        backendUrl: 12345,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("backendUrl must be a string");
    });
  });

  describe("Cache Duration Validation", () => {
    it("should validate cacheDuration as number type", () => {
      const result = ConfigValidator.validate({
        cacheDuration: "24",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("cacheDuration must be a number");
    });

    it("should reject cacheDuration < 1 hour", () => {
      const result = ConfigValidator.validate({
        cacheDuration: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "cacheDuration must be between 1 and 168 hours",
      );
    });

    it("should reject cacheDuration > 168 hours", () => {
      const result = ConfigValidator.validate({
        cacheDuration: 169,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "cacheDuration must be between 1 and 168 hours",
      );
    });

    it("should accept cacheDuration within range (1-168)", () => {
      const validDurations = [1, 24, 48, 72, 168];

      validDurations.forEach((duration) => {
        const result = ConfigValidator.validate({
          cacheDuration: duration,
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe("Boolean Field Validation", () => {
    it("should validate cacheEnabled as boolean type", () => {
      const result = ConfigValidator.validate({
        cacheEnabled: "true",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("cacheEnabled must be a boolean");
    });

    it("should accept boolean values for cacheEnabled", () => {
      const result1 = ConfigValidator.validate({ cacheEnabled: true });
      const result2 = ConfigValidator.validate({ cacheEnabled: false });

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });

    it("should validate allowInsecureUrls as boolean type", () => {
      const result = ConfigValidator.validate({
        allowInsecureUrls: "false",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("allowInsecureUrls must be a boolean");
    });
  });

  describe("getUrlError()", () => {
    it("should return HTTPS requirement message for HTTP non-localhost", () => {
      const error = ConfigValidator.getUrlError("http://api.example.com");

      expect(error).toBe(
        "HTTPS is required for non-localhost addresses. Please use https:// instead of http://",
      );
    });

    it("should return protocol error for non-HTTP/HTTPS protocols", () => {
      const error = ConfigValidator.getUrlError("ftp://example.com");

      expect(error).toBe("Only HTTP and HTTPS protocols are supported");
    });

    it('should return "Invalid URL format" for malformed URLs', () => {
      const error = ConfigValidator.getUrlError("not-a-url");

      expect(error).toBe("Invalid URL format");
    });

    it('should return "Invalid URL format" for localhost HTTP (edge case)', () => {
      // getUrlError doesn't check localhost exception, it's just for error messages
      // So HTTP localhost will fall through to "Invalid URL format"
      const error = ConfigValidator.getUrlError("http://localhost:8000");

      // Based on the code, this should return "Invalid URL format" as the last fallback
      // since it doesn't match the non-localhost HTTP check conditions exactly
      expect(error).toBe("Invalid URL format");
    });
  });

  describe("Multiple Field Validation", () => {
    it("should validate multiple fields simultaneously", () => {
      const result = ConfigValidator.validate({
        backendUrl: "not-a-url",
        cacheEnabled: "true",
        cacheDuration: 200,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain(
        "backendUrl must be a valid HTTP/HTTPS URL",
      );
      expect(result.errors).toContain("cacheEnabled must be a boolean");
      expect(result.errors).toContain(
        "cacheDuration must be between 1 and 168 hours",
      );
    });

    it("should accept valid complete configuration", () => {
      const result = ConfigValidator.validate({
        backendUrl: "https://api.example.com",
        cacheEnabled: true,
        cacheDuration: 24,
        allowInsecureUrls: false,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept partial configuration (undefined fields ignored)", () => {
      const result = ConfigValidator.validate({
        cacheEnabled: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty object", () => {
      const result = ConfigValidator.validate({});

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle null values gracefully", () => {
      const result = ConfigValidator.validate({
        backendUrl: null,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("backendUrl must be a string");
    });

    it("should handle undefined values (skip validation)", () => {
      const result = ConfigValidator.validate({
        backendUrl: undefined,
        cacheEnabled: undefined,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
