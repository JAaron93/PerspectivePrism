import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeUrl } from "../../sidepanel.js";

describe("DOMPurify Sanitization in Sidepanel UI (FR-4)", () => {
  describe("sanitizeText", () => {
    it("should strip malicious script tags and inline execution code", () => {
      const malicious = `<script>alert("XSS")</script>Claim Text`;
      const clean = sanitizeText(malicious);
      expect(clean).not.toContain("<script>");
      expect(clean).not.toContain('alert("XSS")');
      expect(clean).toContain("Claim Text");
    });

    it("should strip onerror and onclick event handlers", () => {
      const malicious = `<img src="invalid" onerror="alert('hack')" />Safe Claim`;
      const clean = sanitizeText(malicious);
      expect(clean).not.toContain("onerror");
      expect(clean).not.toContain("alert");
      expect(clean).toContain("Safe Claim");
    });

    it("should preserve allowed safe tags like b, i, strong, span", () => {
      const formatted = `<b>Important</b> <i>Claim</i> <span>text</span>`;
      const clean = sanitizeText(formatted);
      expect(clean).toBe(formatted);
    });

    it("should handle non-string input gracefully", () => {
      expect(sanitizeText(123)).toBe(123);
      expect(sanitizeText(null)).toBe(null);
    });
  });

  describe("sanitizeUrl", () => {
    it("should block javascript: protocol URIs", () => {
      const unsafe = "javascript:alert(document.cookie)";
      const clean = sanitizeUrl(unsafe);
      expect(clean).toBe("#");
    });

    it("should block case-insensitive JAVASCRIPT: protocol URIs", () => {
      const unsafe = "JavaSCRIPT:eval('alert(1)')";
      const clean = sanitizeUrl(unsafe);
      expect(clean).toBe("#");
    });

    it("should block data: protocol URIs", () => {
      const unsafe = "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==";
      const clean = sanitizeUrl(unsafe);
      expect(clean).toBe("#");
    });

    it("should allow valid https:// and http:// research URLs", () => {
      const safeHttps = "https://www.pbs.org/newshour/science/climate-study";
      const safeHttp = "http://news.bbc.co.uk/reporting";

      expect(sanitizeUrl(safeHttps)).toBe(safeHttps);
      expect(sanitizeUrl(safeHttp)).toBe(safeHttp);
    });

    it("should handle non-string or empty input gracefully", () => {
      expect(sanitizeUrl(undefined)).toBe("#");
      expect(sanitizeUrl(null)).toBe("#");
      expect(sanitizeUrl("")).toBe("#");
      expect(sanitizeUrl("   ")).toBe("#");
    });
  });
});
