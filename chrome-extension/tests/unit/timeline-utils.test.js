import { describe, it, expect, beforeAll } from "vitest";
import { parseTimestampToSeconds, clusterClaims } from "../../timeline-utils.js";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Timeline Utilities", () => {
  describe("parseTimestampToSeconds", () => {
    it("should parse MM:SS format correctly", () => {
      expect(parseTimestampToSeconds("1:00")).toBe(60);
      expect(parseTimestampToSeconds("01:05")).toBe(65);
      expect(parseTimestampToSeconds("00:00")).toBe(0);
    });

    it("should parse HH:MM:SS format correctly", () => {
      expect(parseTimestampToSeconds("1:00:00")).toBe(3600);
      expect(parseTimestampToSeconds("02:30:15")).toBe(9015);
    });

    it("should handle invalid inputs gracefully by returning 0", () => {
      expect(parseTimestampToSeconds(null)).toBe(0);
      expect(parseTimestampToSeconds(undefined)).toBe(0);
      expect(parseTimestampToSeconds("")).toBe(0);
      expect(parseTimestampToSeconds("invalid")).toBe(0);
      expect(parseTimestampToSeconds("-05:00")).toBe(0);
    });
  });

  describe("clusterClaims", () => {
    it("should group claims chronologically within inclusive 5-second threshold", () => {
      const claims = [
        { claim_text: "Claim at 0:00", timestamp: "0:00", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } },
        { claim_text: "Claim at 0:05", timestamp: "0:05", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } },
        { claim_text: "Claim 1", timestamp: "1:00", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } },
        { claim_text: "Claim 2", timestamp: "1:02", truth_profile: { overall_assessment: "Mixed", perspectives: {}, bias_indicators: { deception_score: 0.5 } } },
        { claim_text: "Claim 3", timestamp: "1:04", truth_profile: { overall_assessment: "Likely False", perspectives: {}, bias_indicators: { deception_score: 0.8 } } },
        { claim_text: "Claim 4", timestamp: "1:15", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } }
      ];

      // Video duration = 100 seconds
      const clusters = clusterClaims(claims, 100);

      expect(clusters).toHaveLength(3);
      
      // Boundary-case: claims at 0:00 and 0:05 grouped into one cluster
      expect(clusters[0].timestampSeconds).toBe(0);
      expect(clusters[0].claims).toHaveLength(2);
      expect(clusters[0].claims[0].claim_text).toBe("Claim at 0:00");
      expect(clusters[0].claims[1].claim_text).toBe("Claim at 0:05");

      // First cluster (second chronologically): Claim 1, 2, 3 clustered at 60s
      expect(clusters[1].timestampSeconds).toBe(60);
      expect(clusters[1].claims).toHaveLength(3);
      // Aggregated severity: Likely False > Mixed > Likely True
      expect(clusters[1].severity).toBe("Likely False");

      // Second cluster (third chronologically): Claim 4 at 75s
      expect(clusters[2].timestampSeconds).toBe(75);
      expect(clusters[2].claims).toHaveLength(1);
      expect(clusters[2].severity).toBe("Likely True");
    });

    it("should preserve transitive grouping (chained claims)", () => {
      const claims = [
        { claim_text: "Claim A", timestamp: "0:00", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } },
        { claim_text: "Claim B", timestamp: "0:04", truth_profile: { overall_assessment: "Mixed", perspectives: {}, bias_indicators: { deception_score: 0.4 } } },
        { claim_text: "Claim C", timestamp: "0:08", truth_profile: { overall_assessment: "Likely False", perspectives: {}, bias_indicators: { deception_score: 0.8 } } }
      ];
      // 0:00 to 0:04 is 4s (<= 5s) -> grouped.
      // 0:04 to 0:08 is 4s (<= 5s) -> transitive grouping should combine all three
      const clusters = clusterClaims(claims, 100);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].claims).toHaveLength(3);
      expect(clusters[0].severity).toBe("Likely False");
    });

    it("should clamp claim timestamps between 0 and duration", () => {
      const claims = [
        { claim_text: "Claim Out of Bounds", timestamp: "2:00", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } },
        { claim_text: "Claim Negative", timestamp: "-0:10", truth_profile: { overall_assessment: "Mixed", perspectives: {}, bias_indicators: { deception_score: 0.4 } } }
      ];
      // duration = 60s (1:00)
      const clusters = clusterClaims(claims, 60);
      
      // "2:00" (120s) -> clamped to 60s
      // "-0:10" (invalid/parsed as 0) -> clamped to 0s
      expect(clusters[0].timestampSeconds).toBe(0);
      expect(clusters[1].timestampSeconds).toBe(60);
    });

    it("should handle unknown or zero duration by not clamping/using defaults safely", () => {
      const claims = [
        { claim_text: "Claim 1", timestamp: "1:00", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } }
      ];
      const clusters = clusterClaims(claims, 0); // 0 duration
      expect(clusters[0].timestampSeconds).toBe(60); // parses but clamp shouldn't break or NaN

      const clustersNull = clusterClaims(claims, null); // null duration
      expect(clustersNull[0].timestampSeconds).toBe(60);
    });

    it("should sort shuffled input claims chronologically before clustering", () => {
      const claims = [
        { claim_text: "Claim 3", timestamp: "1:04", truth_profile: { overall_assessment: "Likely False", perspectives: {}, bias_indicators: { deception_score: 0.8 } } },
        { claim_text: "Claim 1", timestamp: "1:00", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } },
        { claim_text: "Claim 2", timestamp: "1:02", truth_profile: { overall_assessment: "Mixed", perspectives: {}, bias_indicators: { deception_score: 0.5 } } }
      ];
      const clusters = clusterClaims(claims, 100);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].claims[0].claim_text).toBe("Claim 1");
      expect(clusters[0].claims[2].claim_text).toBe("Claim 3");
    });

    it("should select aggregate severity correctly (Suspicious/Deceptive > Likely False > Mixed > Likely True)", () => {
      const claims = [
        { claim_text: "C1", timestamp: "1:00", truth_profile: { overall_assessment: "Likely True", perspectives: {}, bias_indicators: { deception_score: 0.1 } } },
        { claim_text: "C2", timestamp: "1:02", truth_profile: { overall_assessment: "Suspicious/Deceptive", perspectives: {}, bias_indicators: { deception_score: 0.9 } } },
        { claim_text: "C3", timestamp: "1:04", truth_profile: { overall_assessment: "Likely False", perspectives: {}, bias_indicators: { deception_score: 0.7 } } }
      ];
      const clusters = clusterClaims(claims, 100);
      expect(clusters[0].severity).toBe("Suspicious/Deceptive");
    });
  });
});

// ---------------------------------------------------------------------------
// Script-injection variant: timeline-utils-script.js attaches functions to
// window. Run the same core cases through the window.* APIs to confirm parity.
// ---------------------------------------------------------------------------
describe("Timeline Utilities (script-injection / window API)", () => {
  beforeAll(() => {
    // Evaluate the IIFE in the current JSDOM window so window.clusterClaims
    // and window.parseTimestampToSeconds are available.
    const scriptPath = resolve(__dirname, "../../timeline-utils-script.js");
    const code = readFileSync(scriptPath, "utf-8");
    // eslint-disable-next-line no-new-func
    new Function("window", code)(globalThis);
  });

  describe("window.parseTimestampToSeconds", () => {
    it("should parse MM:SS correctly", () => {
      expect(window.parseTimestampToSeconds("1:00")).toBe(60);
      expect(window.parseTimestampToSeconds("01:05")).toBe(65);
    });

    it("should return 0 for invalid inputs", () => {
      expect(window.parseTimestampToSeconds(null)).toBe(0);
      expect(window.parseTimestampToSeconds("")).toBe(0);
      expect(window.parseTimestampToSeconds("bad")).toBe(0);
    });
  });

  describe("window.clusterClaims", () => {
    it("should cluster and compute aggregate severity via window API", () => {
      const claims = [
        { claim_text: "A", timestamp: "1:00", truth_profile: { overall_assessment: "Likely True" } },
        { claim_text: "B", timestamp: "1:02", truth_profile: { overall_assessment: "Mixed" } },
        { claim_text: "C", timestamp: "1:04", truth_profile: { overall_assessment: "Likely False" } },
        { claim_text: "D", timestamp: "2:00", truth_profile: { overall_assessment: "Likely True" } },
      ];
      const clusters = window.clusterClaims(claims, 200);
      expect(clusters).toHaveLength(2);
      expect(clusters[0].severity).toBe("Likely False");
      expect(clusters[1].severity).toBe("Likely True");
    });

    it("should return null severity for all-unknown assessments", () => {
      const claims = [
        { claim_text: "X", timestamp: "0:30", truth_profile: { overall_assessment: "Unknown" } },
      ];
      const clusters = window.clusterClaims(claims, 200);
      expect(clusters[0].severity).toBeNull();
    });

    it("should filter out malformed (null/non-object) claims", () => {
      const claims = [
        null,
        { claim_text: "Valid", timestamp: "0:10", truth_profile: { overall_assessment: "Likely True" } },
        undefined,
      ];
      const clusters = window.clusterClaims(claims, 200);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].claims[0].claim_text).toBe("Valid");
    });

    it("should return empty array for empty input", () => {
      expect(window.clusterClaims([], 100)).toEqual([]);
    });
  });
});
