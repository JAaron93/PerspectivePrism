/**
 * Timeline Marker DOM Injection Utility
 */

/**
 * Maps severity strings to CSS classes
 */
const SEVERITY_CLASS_MAP = {
  "Likely True": "pp-marker-green",
  "Mixed": "pp-marker-yellow",
  "Likely False": "pp-marker-red",
  "Suspicious/Deceptive": "pp-marker-dark-red"
};

/**
 * Renders clustered timeline markers on the YouTube progress bar.
 * 
 * @param {Array} clusters - Clustered claims from clusterClaims
 * @param {number} duration - Video duration in seconds
 */
export function renderTimelineMarkers(clusters, duration) {
  const progressList = document.querySelector(".ytp-progress-list");
  if (!progressList) {
    return;
  }

  // Clear existing markers
  const existingMarkers = progressList.querySelectorAll(".pp-timeline-marker");
  existingMarkers.forEach(marker => marker.remove());

  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    return;
  }

  clusters.forEach(cluster => {
    const percentage = Math.max(0, Math.min(100, (cluster.timestampSeconds / duration) * 100));
    
    const marker = document.createElement("div");
    marker.className = "pp-timeline-marker";
    marker.setAttribute("role", "button");
    marker.setAttribute("tabindex", "0");
    const claimCount = cluster.claims.length;
    const firstClaim = cluster.claims[0];
    const timestampStr = firstClaim ? (firstClaim.timestamp || "0:00") : "0:00";
    const severityLabel = cluster.severity || "Unknown severity";
    marker.setAttribute("aria-label", `Timeline marker: ${claimCount} claim${claimCount === 1 ? "" : "s"} at ${timestampStr}, severity: ${severityLabel}`);
    const colorClass = SEVERITY_CLASS_MAP[cluster.severity] || "pp-marker-neutral";
    marker.classList.add(colorClass);
    marker.style.left = `${percentage}%`;
    marker.dataset.timestamp = cluster.timestampSeconds;
    marker.dataset.severity = cluster.severity;

    const seekAndHighlight = (e) => {
      e.stopPropagation(); // Avoid triggering progress bar clicks
      
      const video = document.querySelector("#movie_player-video") || document.querySelector("video");
      if (video) {
        video.currentTime = cluster.timestampSeconds;
      }

      // Dispatch seek and highlight event/message
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "HIGHLIGHT_CLAIMS",
          timestampSeconds: cluster.timestampSeconds,
          claims: cluster.claims
        });
      }
    };

    // Add click event listener to seek and highlight
    marker.addEventListener("click", seekAndHighlight);

    // Add keyboard handler for Enter and Space
    marker.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        seekAndHighlight(e);
      }
    });

    progressList.appendChild(marker);
  });
}
