import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("IPC Sender Origin Validation (FR-2)", () => {
  let originalChrome;
  let messageListener;

  beforeEach(() => {
    originalChrome = global.chrome;
    
    global.chrome = {
      ...originalChrome,
      runtime: {
        id: "mock-extension-id-12345",
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn((listener) => {
            messageListener = listener;
          }),
        },
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        getManifest: vi.fn().mockReturnValue({ version: "0.2.0" }),
        getURL: vi.fn((path) => `chrome-extension://mock-extension-id-12345/${path}`),
      },
      storage: {
        sync: {
          get: vi.fn().mockImplementation((keys, callback) => {
            const data = { consent: { given: true, policyVersion: "1.0.0" } };
            if (callback) callback(data);
            return Promise.resolve(data);
          }),
          set: vi.fn().mockResolvedValue({}),
        },
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue({}),
          remove: vi.fn().mockResolvedValue({}),
        },
        session: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue({}),
          remove: vi.fn().mockResolvedValue({}),
        },
      },
      tabs: {
        create: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.chrome = originalChrome;
    vi.resetModules();
  });

  it("should reject IPC messages when sender.id is missing or undefined", async () => {
    await import("../../background.js");
    expect(messageListener).toBeDefined();

    const mockMessage = { type: "ANALYZE_VIDEO", videoId: "abcdefghijk" };
    const mockSender = {}; // Missing id
    const sendResponseSpy = vi.fn();

    const result = messageListener(mockMessage, mockSender, sendResponseSpy);

    expect(result).toBe(false);
    expect(sendResponseSpy).toHaveBeenCalledWith({
      success: false,
      error: "Unauthorized sender origin",
      code: "UNAUTHORIZED",
    });
  });

  it("should reject IPC messages when sender.id does not match chrome.runtime.id", async () => {
    await import("../../background.js");
    expect(messageListener).toBeDefined();

    const mockMessage = { type: "CHECK_CACHE", videoId: "abcdefghijk" };
    const mockSender = { id: "attacker-extension-id" }; // Mismatched id
    const sendResponseSpy = vi.fn();

    const result = messageListener(mockMessage, mockSender, sendResponseSpy);

    expect(result).toBe(false);
    expect(sendResponseSpy).toHaveBeenCalledWith({
      success: false,
      error: "Unauthorized sender origin",
      code: "UNAUTHORIZED",
    });
  });

  it("should accept IPC messages when sender.id matches chrome.runtime.id", async () => {
    await import("../../background.js");
    expect(messageListener).toBeDefined();

    const mockMessage = { type: "CHECK_POLICY_VERSION" };
    const mockSender = { id: "mock-extension-id-12345" }; // Valid matching id
    const sendResponseSpy = vi.fn();

    const result = messageListener(mockMessage, mockSender, sendResponseSpy);

    // Returned true for async response channel or passed validation
    expect(result).toBe(true);
    expect(sendResponseSpy).not.toHaveBeenCalledWith({
      success: false,
      error: "Unauthorized sender origin",
      code: "UNAUTHORIZED",
    });
  });
});
