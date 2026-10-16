import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { PerspectivePrismClient } from "../../client.js";

const BASE_URL = "https://api.example.com";
const VIDEO_ID = "Sc1enceNws1";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const PENDING_KEY = `pending_request_${VIDEO_ID}`;
const API_KEY = "test-supadata-private-key";
const LATEST_KEY = "test-supadata-rotated-key";
const RESULT = {
  video_id: VIDEO_ID,
  metadata: { analyzed_at: "2026-10-01T00:00:00Z" },
  claims: [],
  content_hash: "science-report",
};
const FAILURE_CASES = [
  ["SUPADATA_KEY_REQUIRED", "A transcript API key is required"],
  ["SUPADATA_KEY_INVALID", "The transcript API key is invalid"],
  ["SUPADATA_QUOTA_EXHAUSTED", "Transcript quota exhausted"],
  ["FUTURE_PROVIDER_CODE", "An unknown provider failure"],
  [undefined, "Legacy backend failure"],
];
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

describe("PerspectivePrismClient Supadata credentials", () => {
  let client;
  let storage;
  let consoleSpies;

  beforeEach(async () => {
    storage = {};
    chrome.storage.local.get.mockImplementation(async (keys) => {
      if (keys === null) return { ...storage };
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.filter((key) => key in storage).map((key) => [key, storage[key]]));
    });
    chrome.storage.local.set.mockImplementation(async (items) => {
      Object.assign(storage, globalThis.structuredClone(items));
    });
    chrome.storage.local.remove.mockImplementation(async (key) => {
      delete storage[key];
    });
    chrome.alarms.create.mockResolvedValue(undefined);
    chrome.alarms.getAll.mockResolvedValue([]);
    consoleSpies = ["log", "info", "warn", "error", "debug"].map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    client = new PerspectivePrismClient(BASE_URL);
    await vi.waitFor(() => expect(client.recoveryComplete).toBe(true));
    chrome.storage.local.get.mockClear();
  });

  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function expectNoSecretWritesOrLogs() {
    const payloads = [
      chrome.storage.local.set.mock.calls,
      chrome.storage.session.set.mock.calls,
      chrome.storage.sync.set.mock.calls,
      chrome.runtime.sendMessage.mock.calls,
      chrome.tabs.sendMessage.mock.calls,
      consoleSpies.map((spy) => spy.mock.calls),
    ];
    const serialized = JSON.stringify(payloads);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(LATEST_KEY);
    expect(serialized).not.toContain("supadataApiKey");
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  }

  function mockSuccessfulAnalysis() {
    vi.spyOn(client, "saveToCache").mockResolvedValue(undefined);
    return vi.spyOn(client, "makeAnalysisRequest").mockResolvedValue(RESULT);
  }

  describe("createAnalysisJob", () => {
    it.each([
      ["missing", {}, null],
      ["empty", { supadataApiKey: "" }, null],
      ["present", { supadataApiKey: API_KEY }, API_KEY],
      ["undefined", { supadataApiKey: undefined }, null],
      ["null", { supadataApiKey: null }, null],
      ["number", { supadataApiKey: 123 }, null],
      ["boolean", { supadataApiKey: true }, null],
      ["object", { supadataApiKey: { value: API_KEY } }, null],
      ["array", { supadataApiKey: [API_KEY] }, null],
    ])("sends the header only for a nonempty string: %s", async (_label, keyOptions, expectedKey) => {
      storage.config = { supadataApiKey: LATEST_KEY };
      const metadata = { title: "Science reporting", channel_name: "Science News" };
      const requests = [];
      server.use(http.post(`${BASE_URL}/analyze/jobs`, async ({ request }) => {
        requests.push({ headers: request.headers, body: await request.json() });
        return HttpResponse.json({ job_id: "science-job" }, { status: 202 });
      }));

      await expect(client.createAnalysisJob(VIDEO_URL, {
        ...keyOptions,
        forceOverride: true,
        metadata,
      })).resolves.toEqual({ job_id: "science-job" });

      expect(requests).toHaveLength(1);
      expect(requests[0].headers.get("X-Supadata-Key")).toBe(expectedKey);
      expect(requests[0].headers.get("Content-Type")).toBe("application/json");
      expect(requests[0].body).toEqual({ url: VIDEO_URL, force_override: true, metadata });
      expect(JSON.stringify(requests[0].body)).not.toContain(API_KEY);
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
      expectNoSecretWritesOrLogs();
    });
  });

  describe("persistRequestState", () => {
    it.each(["new options", "existing options"])("sanitizes %s after merging without mutation", async (source) => {
      const oldOptions = Object.freeze({ supadataApiKey: API_KEY, forceOverride: true, requestId: "old-owner" });
      const newOptions = Object.freeze({ supadataApiKey: LATEST_KEY, metadata: { title: "Science reporting" }, requestId: "new-owner" });
      const existingState = Object.freeze({ videoId: VIDEO_ID, startTime: 100, options: oldOptions, attemptCount: 1 });
      storage[PENDING_KEY] = existingState;
      const state = Object.freeze({
        videoId: VIDEO_ID,
        startTime: 200,
        status: "retrying",
        ...(source === "new options" ? { options: newOptions } : {}),
      });
      const before = JSON.stringify({ existingState, state });

      await client.persistRequestState(state);

      const safeOptions = source === "new options"
        ? { metadata: { title: "Science reporting" }, requestId: "new-owner" }
        : { forceOverride: true, requestId: "old-owner" };
      expect(storage[PENDING_KEY]).toEqual({
        ...existingState,
        ...state,
        startTime: 100,
        options: safeOptions,
      });
      expect(JSON.stringify({ existingState, state })).toBe(before);
      expect(storage[PENDING_KEY].options).not.toBe(oldOptions);
      expect(storage[PENDING_KEY].options).not.toBe(newOptions);
      expectNoSecretWritesOrLogs();
    });

    it("preserves noncredential options in a fresh state", async () => {
      const options = Object.freeze({ supadataApiKey: API_KEY, force_override: true, requestId: "owner" });
      await client.persistRequestState({ videoId: VIDEO_ID, options });
      expect(storage[PENDING_KEY].options).toEqual({ force_override: true, requestId: "owner" });
      expect(options.supadataApiKey).toBe(API_KEY);
      expectNoSecretWritesOrLogs();
    });

    it("does not add options to a state without options", async () => {
      await client.persistRequestState({ videoId: VIDEO_ID, status: "pending" });
      expect(storage[PENDING_KEY]).toEqual({ videoId: VIDEO_ID, status: "pending" });
    });
  });

  describe("executeAnalysisRequest credential hydration", () => {
    it.each([
      ["explicit key", { supadataApiKey: API_KEY }, API_KEY, false],
      ["explicit empty", { supadataApiKey: "" }, "", false],
      ["explicit undefined", { supadataApiKey: undefined }, undefined, false],
      ["explicit nonstring", { supadataApiKey: 123 }, 123, false],
      ["absent", {}, LATEST_KEY, true],
    ])("respects %s and preserves other options", async (_label, keyOptions, expected, loadsConfig) => {
      storage.config = { supadataApiKey: LATEST_KEY };
      const options = Object.freeze({ ...keyOptions, forceOverride: true, requestId: "owner", metadata: { title: "Science reporting" } });
      const before = { ...options };
      const makeRequest = mockSuccessfulAnalysis();

      await expect(client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL, 0, options)).resolves.toEqual({ success: true, data: RESULT });

      expect(makeRequest).toHaveBeenCalledWith(VIDEO_URL, VIDEO_ID, { ...options, supadataApiKey: expected });
      expect(options).toEqual(before);
      expect(chrome.storage.local.get.mock.calls.some(([key]) => key === "config")).toBe(loadsConfig);
      expectNoSecretWritesOrLogs();
    });

    it.each([undefined, {}, { supadataApiKey: "" }])("works without a configured key: %j", async (config) => {
      storage.config = config;
      const makeRequest = mockSuccessfulAnalysis();
      await expect(client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL)).resolves.toMatchObject({ success: true });
      expect(makeRequest.mock.calls[0][2].supadataApiKey).toBe(config?.supadataApiKey);
      expectNoSecretWritesOrLogs();
    });

    it("hydrates when a key is inherited rather than owned", async () => {
      storage.config = { supadataApiKey: LATEST_KEY };
      const options = Object.create({ supadataApiKey: API_KEY });
      options.requestId = "owner";
      const makeRequest = mockSuccessfulAnalysis();
      await client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL, 0, options);
      expect(makeRequest).toHaveBeenCalledWith(VIDEO_URL, VIDEO_ID, { requestId: "owner", supadataApiKey: LATEST_KEY });
      expect(options.supadataApiKey).toBe(API_KEY);
      expectNoSecretWritesOrLogs();
    });

    it.each(["abort", "override"])("does not dispatch if %s occurs while config is loading", async (reason) => {
      const makeRequest = mockSuccessfulAnalysis();
      const get = chrome.storage.local.get.getMockImplementation();
      chrome.storage.local.get.mockImplementation(async (key) => {
        if (key === "config") {
          if (reason === "abort") client.abortControllers.get(VIDEO_ID).abort();
          else client.activeOverrideVideoIds.add(VIDEO_ID);
          return { config: { supadataApiKey: API_KEY } };
        }
        return get(key);
      });

      await expect(client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL)).resolves.toMatchObject({ success: false, isCancelled: true });
      expect(makeRequest).not.toHaveBeenCalled();
      expect(storage[PENDING_KEY]).toBeUndefined();
      expect(chrome.alarms.create).not.toHaveBeenCalled();
      expectNoSecretWritesOrLogs();
    });

    it("does not hydrate or dispatch if aborted during persistence", async () => {
      const makeRequest = mockSuccessfulAnalysis();
      chrome.storage.local.set.mockImplementation(async (items) => {
        Object.assign(storage, items);
        client.abortControllers.get(VIDEO_ID).abort();
      });
      await expect(client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL)).resolves.toMatchObject({ isCancelled: true });
      expect(chrome.storage.local.get).not.toHaveBeenCalledWith("config");
      expect(makeRequest).not.toHaveBeenCalled();
      expect(storage[PENDING_KEY]).toBeUndefined();
    });

    it("allows the owning force override through hydration", async () => {
      storage.config = { supadataApiKey: LATEST_KEY };
      client.activeOverrideVideoIds.add(VIDEO_ID);
      const makeRequest = mockSuccessfulAnalysis();
      await expect(client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL, 0, { force_override: true })).resolves.toMatchObject({ success: true });
      expect(makeRequest).toHaveBeenCalledWith(VIDEO_URL, VIDEO_ID, { force_override: true, supadataApiKey: LATEST_KEY });
    });

    it("handles config load failure through the existing retry path", async () => {
      const makeRequest = mockSuccessfulAnalysis();
      const get = chrome.storage.local.get.getMockImplementation();
      chrome.storage.local.get.mockImplementation((key) => key === "config" ? Promise.reject(new Error("Storage unavailable")) : get(key));
      await expect(client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL)).resolves.toMatchObject({ isRetry: true });
      expect(makeRequest).not.toHaveBeenCalled();
      expect(storage[PENDING_KEY]).toMatchObject({ status: "retrying", attemptCount: 1 });
      expect(chrome.alarms.create).toHaveBeenCalledWith(`retry::${VIDEO_ID}::1`, expect.any(Object));
    });

    it.each(["worker", "alarm"])("reloads the latest config for %s recovery, not the persisted key", async (mode) => {
      storage.config = { supadataApiKey: API_KEY };
      await client.persistRequestState({
        videoId: VIDEO_ID,
        videoUrl: VIDEO_URL,
        startTime: Date.now(),
        attemptCount: 1,
        status: mode === "worker" ? "pending" : "retrying",
        options: { supadataApiKey: API_KEY, requestId: "recovered-owner", metadata: { title: "Science reporting" } },
      });
      storage.config = { supadataApiKey: LATEST_KEY };
      const makeRequest = mockSuccessfulAnalysis();
      if (mode === "worker") {
        vi.useFakeTimers();
        const recovery = client.recoverPersistedRequests();
        await vi.advanceTimersByTimeAsync(500);
        await recovery;
      } else {
        const listener = chrome.alarms.onAlarm.addListener.mock.calls[0][0];
        await listener({ name: `retry::${VIDEO_ID}::1` });
      }
      expect(makeRequest).toHaveBeenCalledWith(VIDEO_URL, VIDEO_ID, {
        supadataApiKey: LATEST_KEY,
        requestId: "recovered-owner",
        metadata: { title: "Science reporting" },
      });
      expect(client.pendingRequests.has(VIDEO_ID)).toBe(false);
      expect(client.pendingRequestOptions.has(VIDEO_ID)).toBe(false);
      expect(storage[PENDING_KEY]).toBeUndefined();
      expectNoSecretWritesOrLogs();
    });

    it("keeps a rehydrated credential out of request bodies, cache, results and logs", async () => {
      storage.config = { supadataApiKey: API_KEY };
      vi.spyOn(client, "enforceCacheLimits").mockResolvedValue(undefined);
      const requests = [];
      server.use(
        http.post(`${BASE_URL}/analyze/jobs`, async ({ request }) => {
          requests.push({ key: request.headers.get("X-Supadata-Key"), body: await request.json() });
          return HttpResponse.json({ job_id: "science-job" });
        }),
        http.get(`${BASE_URL}/analyze/jobs/science-job`, () => HttpResponse.json({ status: "completed", result: RESULT })),
      );
      const result = await client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL);
      expect(result).toEqual({ success: true, data: RESULT });
      expect(requests).toEqual([{ key: API_KEY, body: { url: VIDEO_URL, force_override: false } }]);
      expect(storage[`cache_${VIDEO_ID}_${RESULT.content_hash}`].data).toEqual(RESULT);
      expect(storage[PENDING_KEY]).toBeUndefined();
      expectNoSecretWritesOrLogs();
    });
  });

  describe("failed job error codes", () => {
    it.each([
      ...FAILURE_CASES,
      ["SUPADATA_KEY_REQUIRED", undefined],
      ["SUPADATA_KEY_INVALID", ""],
    ])("preserves code %s and message %s in pollJobStatus", async (code, message) => {
      server.use(http.get(`${BASE_URL}/analyze/jobs/science-job`, () => HttpResponse.json({ status: "failed", error_code: code, error: message, code: "NOT_THE_JOB_ERROR_FIELD" })));
      const error = await client.pollJobStatus("science-job", new AbortController().signal).catch((failure) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(message || "Job failed without error message");
      expect(error.code).toBe(code);
    });

    it.each(FAILURE_CASES)("propagates %s through terminal execution without changing retry policy", async (code, message) => {
      server.use(
        http.post(`${BASE_URL}/analyze/jobs`, () => HttpResponse.json({ job_id: "science-job" })),
        http.get(`${BASE_URL}/analyze/jobs/science-job`, () => HttpResponse.json({ status: "failed", error_code: code, error: message, code: "NOT_THE_JOB_ERROR_FIELD" })),
      );
      const result = await client.executeAnalysisRequest(VIDEO_ID, VIDEO_URL, client.MAX_RETRIES, { supadataApiKey: API_KEY });
      expect(result).toMatchObject({ success: false, originalError: message, code });
      expect(chrome.alarms.create).not.toHaveBeenCalled();
      expect(storage[PENDING_KEY]).toBeUndefined();
      expectNoSecretWritesOrLogs();
    });
  });
});
