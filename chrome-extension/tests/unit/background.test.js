import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VIDEO_ID = "pbsNews0001";
const STORED_KEY = "test-stored-supadata-key";

// Exercise the real client initialization; only analysis itself is stubbed.
describe("Background Supadata configuration (T2.3)", () => {
  let background;
  let client;
  let analyze;
  let storedConfig;
  let session;

  beforeEach(() => {
    vi.resetModules();
    storedConfig = {
      backendUrl: "http://localhost:8000",
      supadataApiKey: STORED_KEY,
    };
    session = {};
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      const data = keys === "config" ? { config: storedConfig } : {};
      if (callback) callback(data);
      return Promise.resolve(data);
    });
    chrome.storage.session.get.mockImplementation(async (key) =>
      key === null ? { ...session } : { [key]: session[key] },
    );
    chrome.storage.session.set.mockImplementation(async (items) => {
      Object.assign(session, items);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function initialize() {
    background = await import("../../background.js");
    client = await background.getClient();
    analyze = vi.spyOn(client, "analyzeVideo").mockResolvedValue({
      success: true,
      data: { claims: [] },
    });
  }

  function changeStorage(change, area = "local") {
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
    chrome.storage.onChanged.addListener.mock.calls[0][0](change, area);
  }

  async function request(extra = {}) {
    return background.handleAnalysisRequest({ videoId: VIDEO_ID, ...extra });
  }

  it("loads the stored key during initialization", async () => {
    await initialize();
    await request();

    expect(chrome.storage.local.get).toHaveBeenCalledWith("config");
    expect(analyze).toHaveBeenCalledWith(VIDEO_ID, {
      forceOverride: false,
      metadata: undefined,
      supadataApiKey: STORED_KEY,
    });
  });

  it("lets an explicit message key win without changing the stored fallback", async () => {
    await initialize();
    const metadata = { title: "PBS NewsHour policy analysis" };
    await request({
      supadataApiKey: "test-message-key",
      force_override: true,
      metadata,
    });
    expect(analyze).toHaveBeenLastCalledWith(VIDEO_ID, {
      forceOverride: true,
      metadata,
      supadataApiKey: "test-message-key",
    });

    await request();
    expect(analyze).toHaveBeenLastCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: STORED_KEY }),
    );
  });

  it.each([undefined, ""])("falls back for message key %j", async (key) => {
    await initialize();
    await request({ supadataApiKey: key });
    expect(analyze).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: STORED_KEY }),
    );
  });

  it.each([undefined, "", null, 42])("uses an empty initial key for %j", async (key) => {
    storedConfig.supadataApiKey = key;
    await initialize();
    await request();
    expect(analyze).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: "" }),
    );
  });

  it("preserves the optional string key without imposing a format", async () => {
    storedConfig.supadataApiKey = `  ${STORED_KEY}  `;
    await initialize();
    await request();
    expect(analyze).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: `  ${STORED_KEY}  ` }),
    );
  });

  it("refreshes the key immediately on the same client without reloading storage", async () => {
    await initialize();
    await request();
    expect(analyze).toHaveBeenLastCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: STORED_KEY }),
    );
    chrome.storage.local.get.mockClear();

    changeStorage({
      config: { oldValue: storedConfig, newValue: { supadataApiKey: "  test-new-key  " } },
    });
    await request();

    expect(analyze).toHaveBeenLastCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: "  test-new-key  " }),
    );
    expect(await background.getClient()).toBe(client);
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it.each([
    ["cleared", { supadataApiKey: "" }],
    ["missing", {}],
    ["non-string", { supadataApiKey: 42 }],
    ["null key", { supadataApiKey: null }],
    ["null config", null],
    ["deleted", undefined],
  ])("never reuses the old key after config is %s", async (_label, newValue) => {
    await initialize();
    changeStorage({ config: { oldValue: storedConfig, newValue } });
    await request();
    expect(analyze).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: "" }),
    );
  });

  it("ignores non-local storage areas and unrelated local keys", async () => {
    await initialize();
    for (const area of ["sync", "session", "managed"]) {
      changeStorage({ config: { newValue: { supadataApiKey: "test-ignored-key" } } }, area);
    }
    changeStorage({ other: { newValue: { supadataApiKey: "test-ignored-key" } } });
    changeStorage({ supadataApiKey: { newValue: "test-ignored-key" } });
    await request();
    expect(analyze).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: STORED_KEY }),
    );
  });

  it.each([
    ["updated", { supadataApiKey: "test-new-key" }, "test-new-key"],
    ["deleted", undefined, ""],
  ])("does not let a delayed startup load overwrite an %s config event", async (_label, newValue, key) => {
    let finishLoad;
    const delayed = new Promise((resolve) => { finishLoad = resolve; });
    chrome.storage.local.get.mockImplementation((keys) =>
      keys === "config" ? delayed : Promise.resolve({}),
    );
    background = await import("../../background.js");
    const startupPromise = background.getClient();

    // Deliver an event before allowing the stale local.get snapshot to resolve.
    try {
      changeStorage({ config: { oldValue: storedConfig, newValue } });
    } finally {
      finishLoad({ config: storedConfig });
      await initialize();
    }
    expect(background.getClient()).toBe(startupPromise);
    await request();
    expect(analyze).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({ supadataApiKey: key }),
    );
  });

  it("preserves the cached getClient promise across key updates and deletion", async () => {
    await initialize();
    const promise = background.getClient();
    changeStorage({ config: { newValue: { supadataApiKey: "test-new-key" } } });
    expect(background.getClient()).toBe(promise);
    changeStorage({ config: { oldValue: storedConfig } });
    expect(background.getClient()).toBe(promise);
    expect(await promise).toBe(client);
  });

  it("keeps keys out of session state, broadcasts, and state responses", async () => {
    await initialize();
    await request({ requestId: "request-news-1", supadataApiKey: "test-message-key" });

    const states = chrome.storage.session.set.mock.calls.map(([items]) => items[`state_${VIDEO_ID}`]);
    expect(states).toEqual([
      { status: "in_progress", progress: 0, requestId: "request-news-1", forceOverride: false },
      {
        status: "complete", claimCount: 0, isCached: false,
        analyzedAt: expect.any(Number), eligibility: null, requestId: "request-news-1",
      },
    ]);
    expect(chrome.runtime.sendMessage.mock.calls.map(([message]) => message)).toEqual(
      states.map((state) => ({ type: "ANALYSIS_STATE_CHANGED", videoId: VIDEO_ID, state })),
    );
    expect(await background.handleGetAnalysisState({ videoId: VIDEO_ID })).toEqual({
      success: true, state: states[1],
    });
  });

  it.each([{}, { id: "foreign-extension" }])("rejects an unauthorized IPC sender %j before analysis", async (sender) => {
    await initialize();
    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    expect(listener({ type: "ANALYZE_VIDEO", videoId: VIDEO_ID, supadataApiKey: "test-foreign-key" }, sender, sendResponse)).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({
      success: false, error: "Unauthorized sender origin", code: "UNAUTHORIZED",
    });
    expect(analyze).not.toHaveBeenCalled();
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  it("propagates an analysis result code through IPC and the existing error state", async () => {
    await initialize();
    const result = { success: false, error: "Supadata key required", code: "SUPADATA_KEY_REQUIRED" };
    analyze.mockResolvedValue(result);
    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const response = await new Promise((resolve) => {
      expect(listener(
        { type: "ANALYZE_VIDEO", videoId: VIDEO_ID, requestId: "request-error-1" },
        { id: chrome.runtime.id },
        resolve,
      )).toBe(true);
    });
    expect(response).toEqual(result);
    expect(session[`state_${VIDEO_ID}`]).toEqual({
      status: "error", errorMessage: result.error, errorDetails: "",
      requestId: "request-error-1", code: result.code, isExhaustion: false,
    });
  });
});
