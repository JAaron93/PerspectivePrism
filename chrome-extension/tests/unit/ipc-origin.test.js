import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("IPC Sender Origin Validation (FR-2)", () => {
  let messageListener;

  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.id = "mock-extension-id-12345";
    chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
      messageListener = listener;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
