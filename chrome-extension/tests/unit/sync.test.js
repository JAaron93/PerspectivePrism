import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Playback Synchronization Engine", () => {
  let originalChrome;
  
  beforeEach(() => {
    vi.useFakeTimers();
    originalChrome = global.chrome;
    
    // Merge custom mock with setup.js mock to preserve all required APIs
    global.chrome = {
      ...originalChrome,
      runtime: {
        ...originalChrome.runtime,
        sendMessage: vi.fn().mockImplementation(() => Promise.resolve({ success: true })),
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      },
      storage: {
        ...originalChrome.storage,
        session: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue({}),
          remove: vi.fn().mockResolvedValue({}),
          clear: vi.fn().mockResolvedValue({})
        }
      },
      tabs: {
        ...originalChrome.tabs,
        query: vi.fn(),
        sendMessage: vi.fn()
      }
    };

    // Mock video utility for content script video ID extraction
    window.extractVideoIdFromUrl = () => "abcdefghijk";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.chrome = originalChrome;
    document.body.innerHTML = "";
    vi.resetModules();
    delete window.extractVideoIdFromUrl;
  });

  describe("Content Script - timeupdate Broadcast Throttling", () => {
    it("should throttle broadcasts to max 4 updates per second (250ms)", async () => {
      // Set up mock DOM with a video element
      document.body.innerHTML = `<video id="movie_player-video" src="test.mp4"></video>`;
      const video = document.querySelector("#movie_player-video");

      // Set up class-based Logger mock since it is used as a constructor
      window.Logger = class {
        constructor() {
          return {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
          };
        }
      };

      // Mock chrome.runtime.sendMessage to verify throttling
      const sendMessageSpy = vi.fn().mockResolvedValue({ success: true });
      global.chrome.runtime.sendMessage = sendMessageSpy;

      chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        const tabs = [{ id: 123, url: "https://www.youtube.com/watch?v=abcdefghijk" }];
        if (callback) callback(tabs);
        return Promise.resolve(tabs);
      });
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "GET_ANALYSIS_STATE") {
          return Promise.resolve({
            success: true,
            state: { status: "idle" }
          });
        }
        return Promise.resolve({ success: true });
      });

      // Load content.js
      await import("../../content.js");
      vi.advanceTimersByTime(1100);

      // Verify the handler throttles
      sendMessageSpy.mockClear();

      // Trigger timeupdate on video element
      video.dispatchEvent(new Event("timeupdate"));
      video.dispatchEvent(new Event("timeupdate"));
      video.dispatchEvent(new Event("timeupdate"));

      const syncMessages = sendMessageSpy.mock.calls
        .map(c => c[0])
        .filter(msg => msg.type === "SYNC_PLAYBACK");

      expect(syncMessages.length).toBe(1);

      // Advance timer by 100ms and fire again -> still throttled
      vi.advanceTimersByTime(100);
      video.dispatchEvent(new Event("timeupdate"));
      
      const syncMessagesAfter100ms = sendMessageSpy.mock.calls
        .map(c => c[0])
        .filter(msg => msg.type === "SYNC_PLAYBACK");
      expect(syncMessagesAfter100ms.length).toBe(1);

      // Advance by 151ms (total 251ms) and fire again -> should broadcast
      vi.advanceTimersByTime(151);
      video.dispatchEvent(new Event("timeupdate"));
      
      const syncMessagesAfter250ms = sendMessageSpy.mock.calls
        .map(c => c[0])
        .filter(msg => msg.type === "SYNC_PLAYBACK");
      expect(syncMessagesAfter250ms.length).toBe(2);
    });

    it("should include videoId, generationId, sequence, and currentTime in SYNC_PLAYBACK broadcasts", async () => {
      document.body.innerHTML = `<video id="movie_player-video" src="test.mp4"></video>`;
      const video = document.querySelector("#movie_player-video");
      video.currentTime = 42.5;

      window.Logger = class {
        constructor() {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
        }
      };

      const sendMessageSpy = vi.fn().mockResolvedValue({ success: true });
      global.chrome.runtime.sendMessage = sendMessageSpy;

      await import("../../content.js");
      vi.advanceTimersByTime(1100);

      sendMessageSpy.mockClear();
      video.dispatchEvent(new Event("timeupdate"));

      const syncMsg = sendMessageSpy.mock.calls
        .map(c => c[0])
        .find(msg => msg.type === "SYNC_PLAYBACK");

      expect(syncMsg).toBeDefined();
      expect(syncMsg.videoId).toBe("abcdefghijk");
      expect(syncMsg.generationId).toBeDefined();
      expect(syncMsg.sequence).toBe(1);
      expect(syncMsg.currentTime).toBe(42.5);
    });

    it("should increment sequence monotonically with every message", async () => {
      document.body.innerHTML = `<video id="movie_player-video" src="test.mp4"></video>`;
      const video = document.querySelector("#movie_player-video");

      window.Logger = class {
        constructor() {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
        }
      };

      const sendMessageSpy = vi.fn().mockResolvedValue({ success: true });
      global.chrome.runtime.sendMessage = sendMessageSpy;

      await import("../../content.js");
      vi.advanceTimersByTime(1100);

      sendMessageSpy.mockClear();
      
      video.dispatchEvent(new Event("timeupdate"));
      
      vi.advanceTimersByTime(251);
      video.dispatchEvent(new Event("timeupdate"));

      const syncMsgs = sendMessageSpy.mock.calls
        .map(c => c[0])
        .filter(msg => msg.type === "SYNC_PLAYBACK");

      expect(syncMsgs.length).toBe(2);
      expect(syncMsgs[0].sequence).toBe(1);
      expect(syncMsgs[1].sequence).toBe(2);
    });
  });

  describe("Background Worker - Routing & Tab-Scoping", () => {
    it("should append sender.tab.id to SYNC_PLAYBACK messages and route to runtime", async () => {
      let messageListener;
      global.chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
        messageListener = listener;
      });

      await import("../../background.js");

      const sendMessageSpy = vi.spyOn(global.chrome.runtime, "sendMessage");
      
      const mockSender = { tab: { id: 987 } };
      const mockMessage = {
        type: "SYNC_PLAYBACK",
        videoId: "abc",
        generationId: 1,
        sequence: 5,
        currentTime: 10.5
      };

      messageListener(mockMessage, mockSender, () => {});

      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SYNC_PLAYBACK",
          videoId: "abc",
          generationId: 1,
          sequence: 5,
          currentTime: 10.5,
          tabId: 987
        })
      );
    });
  });

  describe("Side Panel - Synchronization & Active Claim Boundaries", () => {
    let messageListener;

    beforeEach(async () => {
      global.chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
        messageListener = listener;
      });

      document.body.innerHTML = `
        <div id="state-idle" style="display: none;"></div>
        <div id="state-loading" style="display: none;"></div>
        <div id="state-error" style="display: none;"></div>
        <div id="state-results" style="display: flex;">
          <div id="claims-list-container">
            <div class="claim-card" data-timestamp-seconds="10">
              <div class="claim-card-header">Claim 1</div>
            </div>
            <div class="claim-card" data-timestamp-seconds="30">
              <div class="claim-card-header">Claim 2</div>
            </div>
            <div class="claim-card" data-timestamp-seconds="60">
              <div class="claim-card-header">Claim 3</div>
            </div>
          </div>
        </div>
      `;

      chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        const tabs = [{ id: 123, url: "https://www.youtube.com/watch?v=abcdefghijk" }];
        if (callback) callback(tabs);
        return Promise.resolve(tabs);
      });

      await import("../../sidepanel.js");
    });

    it("should reject sync messages with a mismatching tabId", () => {
      const activeCard = document.querySelector(".claim-card");
      activeCard.classList.add("pp-claim-active");

      messageListener({
        type: "SYNC_PLAYBACK",
        videoId: "abcdefghijk",
        tabId: 999,
        generationId: 1,
        sequence: 1,
        currentTime: 15
      }, {}, () => {});

      expect(activeCard.classList.contains("pp-claim-active")).toBe(true);
    });

    it("should reject sync messages with sequence <= lastSequence", () => {
      // First message
      messageListener({
        type: "SYNC_PLAYBACK",
        videoId: "abcdefghijk",
        tabId: 123,
        generationId: 1,
        sequence: 5,
        currentTime: 35
      }, {}, () => {});

      const cards = document.querySelectorAll(".claim-card");
      expect(cards[1].classList.contains("pp-claim-active")).toBe(true);

      cards.forEach(c => c.classList.remove("pp-claim-active"));

      // Send message with older sequence: 4
      messageListener({
        type: "SYNC_PLAYBACK",
        videoId: "abcdefghijk",
        tabId: 123,
        generationId: 1,
        sequence: 4,
        currentTime: 15
      }, {}, () => {});

      expect(document.querySelector(".pp-claim-active")).toBeNull();
    });

    it("should clear highlights when playback currentTime is before the first claim", () => {
      const cards = document.querySelectorAll(".claim-card");
      cards[0].classList.add("pp-claim-active");

      messageListener({
        type: "SYNC_PLAYBACK",
        videoId: "abcdefghijk",
        tabId: 123,
        generationId: 1,
        sequence: 1,
        currentTime: 5
      }, {}, () => {});

      expect(document.querySelector(".pp-claim-active")).toBeNull();
    });

    it("should highlight the correct active claim when currentTime is between claims", () => {
      const cards = document.querySelectorAll(".claim-card");

      messageListener({
        type: "SYNC_PLAYBACK",
        videoId: "abcdefghijk",
        tabId: 123,
        generationId: 1,
        sequence: 1,
        currentTime: 35
      }, {}, () => {});

      expect(cards[0].classList.contains("pp-claim-active")).toBe(false);
      expect(cards[1].classList.contains("pp-claim-active")).toBe(true);
      expect(cards[2].classList.contains("pp-claim-active")).toBe(false);
    });

    it("should keep the final claim highlighted when currentTime is after the final claim", () => {
      const cards = document.querySelectorAll(".claim-card");

      messageListener({
        type: "SYNC_PLAYBACK",
        videoId: "abcdefghijk",
        tabId: 123,
        generationId: 1,
        sequence: 1,
        currentTime: 80
      }, {}, () => {});

      expect(cards[0].classList.contains("pp-claim-active")).toBe(false);
      expect(cards[1].classList.contains("pp-claim-active")).toBe(false);
      expect(cards[2].classList.contains("pp-claim-active")).toBe(true);
    });
  });
});
