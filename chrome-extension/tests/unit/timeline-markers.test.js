import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderTimelineMarkers } from "../../content-markers.js"; // We'll implement this function/file or export from content.js

describe("Timeline Marker DOM Injection", () => {
  let progressList;
  let videoElement;
  let originalChrome;

  beforeEach(() => {
    // Set up a mock DOM environment
    document.body.innerHTML = `
      <div class="ytp-progress-list"></div>
      <video id="movie_player-video" src="test.mp4"></video>
    `;
    progressList = document.querySelector(".ytp-progress-list");
    videoElement = document.querySelector("#movie_player-video");
    
    // Mock chrome extension APIs
    originalChrome = global.chrome;
    global.chrome = {
      runtime: {
        sendMessage: vi.fn()
      }
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    global.chrome = originalChrome;
  });

  it("should inject div markers into .ytp-progress-list with correct styles and classes", () => {
    const clusters = [
      {
        timestampSeconds: 10,
        severity: "Likely True",
        claims: [{ claim_text: "Claim 1", timestamp: "0:10" }]
      },
      {
        timestampSeconds: 50,
        severity: "Suspicious/Deceptive",
        claims: [{ claim_text: "Claim 2", timestamp: "0:50" }]
      }
    ];

    renderTimelineMarkers(clusters, 100);

    const markers = progressList.querySelectorAll(".pp-timeline-marker");
    expect(markers).toHaveLength(2);

    // Verify first marker
    const marker1 = markers[0];
    expect(marker1.style.left).toBe("10%");
    expect(marker1.classList.contains("pp-marker-green")).toBe(true);

    // Verify second marker
    const marker2 = markers[1];
    expect(marker2.style.left).toBe("50%");
    expect(marker2.classList.contains("pp-marker-dark-red")).toBe(true);
  });

  it("should map severity to correct color classes", () => {
    const severities = ["Likely True", "Mixed", "Likely False", "Suspicious/Deceptive"];
    const expectedClasses = ["pp-marker-green", "pp-marker-yellow", "pp-marker-red", "pp-marker-dark-red"];

    severities.forEach((severity, idx) => {
      progressList.innerHTML = "";
      const clusters = [{
        timestampSeconds: 30,
        severity,
        claims: [{ claim_text: "Claim Text", timestamp: "0:30" }]
      }];

      renderTimelineMarkers(clusters, 100);

      const marker = progressList.querySelector(".pp-timeline-marker");
      expect(marker.classList.contains(expectedClasses[idx])).toBe(true);
    });
  });

  it("should seek video on marker click", () => {
    const clusters = [{
      timestampSeconds: 45,
      severity: "Mixed",
      claims: [{ claim_text: "Claim Text", timestamp: "0:45" }]
    }];

    renderTimelineMarkers(clusters, 100);
    const marker = progressList.querySelector(".pp-timeline-marker");
    
    // Trigger click on marker
    marker.click();

    expect(videoElement.currentTime).toBe(45);
  });

  it("should dispatch a message on marker click", () => {
    const clusters = [{
      timestampSeconds: 45,
      severity: "Mixed",
      claims: [{ claim_text: "Claim Text", timestamp: "0:45" }]
    }];

    renderTimelineMarkers(clusters, 100);
    const marker = progressList.querySelector(".pp-timeline-marker");
    
    marker.click();

    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "HIGHLIGHT_CLAIMS",
        timestampSeconds: 45,
        claims: clusters[0].claims
      })
    );
  });

  it("should not render any markers if duration is zero or negative or invalid", () => {
    const clusters = [{
      timestampSeconds: 45,
      severity: "Mixed",
      claims: [{ claim_text: "Claim Text", timestamp: "0:45" }]
    }];

    renderTimelineMarkers(clusters, 0);
    expect(progressList.querySelectorAll(".pp-timeline-marker")).toHaveLength(0);

    renderTimelineMarkers(clusters, -10);
    expect(progressList.querySelectorAll(".pp-timeline-marker")).toHaveLength(0);

    renderTimelineMarkers(clusters, null);
    expect(progressList.querySelectorAll(".pp-timeline-marker")).toHaveLength(0);
  });
});
