/**
 * Parses a timestamp string (e.g. "1:00", "01:02:03") to seconds.
 * Returns 0 for invalid inputs.
 * 
 * @param {string} timestamp 
 * @returns {number}
 */
export function parseTimestampToSeconds(timestamp) {
  if (typeof timestamp !== "string" || !timestamp.trim()) {
    return 0;
  }

  const parts = timestamp.trim().split(":");
  if (parts.length < 2 || parts.length > 3) {
    return 0;
  }

  // Check if all parts are positive integers
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return 0;
    }
  }

  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    return minutes * 60 + seconds;
  } else {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }
}

/**
 * Severity mapping for truth profiles.
 * Suspicious/Deceptive > Likely False > Mixed > Likely True.
 */
const SEVERITY_ORDER = {
  "Suspicious/Deceptive": 4,
  "Likely False": 3,
  "Mixed": 2,
  "Likely True": 1
};

const SEVERITY_REVERSE = {
  4: "Suspicious/Deceptive",
  3: "Likely False",
  2: "Mixed",
  1: "Likely True"
};

/**
 * Clusters claims based on chronological order and a 5-second inclusive threshold.
 * Clamps timestamps between 0 and duration if duration is provided.
 * 
 * @param {Array} claims 
 * @param {number|null} duration 
 * @param {number} threshold 
 * @returns {Array} Array of clusters
 */
export function clusterClaims(claims, duration = null, threshold = 5) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return [];
  }

  // Filter out malformed claims, then parse and map to include seconds
  const mappedClaims = claims
    .filter(claim => claim != null && typeof claim === "object")
    .map(claim => {
      let seconds = parseTimestampToSeconds(claim.timestamp);
      seconds = Math.max(0, seconds);
      if (typeof duration === "number" && duration > 0) {
        seconds = Math.min(seconds, duration);
      }
      return {
        ...claim,
        seconds
      };
    });

  // Sort chronologically by seconds
  mappedClaims.sort((a, b) => a.seconds - b.seconds);

  const clusters = [];
  
  for (const claim of mappedClaims) {
    if (clusters.length === 0) {
      clusters.push({
        timestampSeconds: claim.seconds,
        claims: [claim]
      });
    } else {
      const lastCluster = clusters[clusters.length - 1];
      const lastClaim = lastCluster.claims[lastCluster.claims.length - 1];
      
      if (claim.seconds - lastClaim.seconds <= threshold) {
        lastCluster.claims.push(claim);
      } else {
        clusters.push({
          timestampSeconds: claim.seconds,
          claims: [claim]
        });
      }
    }
  }

  // Calculate aggregate severity for each cluster
  for (const cluster of clusters) {
    let maxScore = 0;
    for (const claim of cluster.claims) {
      const assessment = claim.truth_profile?.overall_assessment;
      const score = SEVERITY_ORDER[assessment] || 0;
      if (score > maxScore) {
        maxScore = score;
      }
    }
    cluster.severity = SEVERITY_REVERSE[maxScore] || null;
  }

  return clusters;
}
