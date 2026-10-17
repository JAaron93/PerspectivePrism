import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../../App';

// Mock localStorage for Node test environment
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

test('T7.1: App renders BYOK settings toggle and inputs', () => {
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = new MockLocalStorage() as unknown as Storage;

  try {
    const html = renderToStaticMarkup(<App />);
    assert.match(html, /Configure Supadata API Key \(BYOK\)/);
    assert.match(html, /id="byok-toggle-btn"/);
    assert.match(html, /YouTube URL/);
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('T7.1: App loads stored Supadata key from localStorage', () => {
  const originalLocalStorage = globalThis.localStorage;
  const mockStorage = new MockLocalStorage();
  mockStorage.setItem('perspective_prism_supadata_key', 'test-stored-key');
  globalThis.localStorage = mockStorage as unknown as Storage;

  try {
    const html = renderToStaticMarkup(<App />);
    assert.match(html, /Supadata API Key \(Configured\)/);
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('T7.1: Outbound analysis request exercises submit through App and forwards X-Supadata-Key', async () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;

  const mockStorage = new MockLocalStorage();
  mockStorage.setItem('perspective_prism_supadata_key', 'web-client-test-key');
  globalThis.localStorage = mockStorage as unknown as Storage;

  let capturedHeaders: HeadersInit | undefined;
  let capturedBody: string | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    if (urlStr.includes('/analyze/jobs')) {
      if (init?.method === 'POST') {
        capturedHeaders = init?.headers;
        capturedBody = init?.body as string;
        return {
          ok: true,
          status: 200,
          json: async () => ({ job_id: 'mock-web-job-123' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          job_id: 'mock-web-job-123',
          status: 'completed',
          result: { video_id: 'mock_vid', metadata: { analyzed_at: '' }, claims: [] },
        }),
      } as Response;
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    } as Response;
  }) as typeof fetch;

  try {
    let appActions: { startAnalysis: (url: string, force?: boolean) => Promise<void> } | undefined;
    renderToStaticMarkup(
      <App
        onInit={(actions) => {
          appActions = actions;
        }}
      />
    );

    assert.ok(appActions, 'App component must expose startAnalysis through onInit hook');
    await appActions.startAnalysis('https://www.youtube.com/watch?v=mock_video');

    assert.ok(capturedHeaders, 'Expected headers to be captured from outbound submit request in App');
    const headersMap = new Headers(capturedHeaders);
    assert.equal(headersMap.get('X-Supadata-Key'), 'web-client-test-key');
    assert.match(capturedBody || '', /mock_video/);
  } finally {
    globalThis.localStorage = originalLocalStorage;
    globalThis.fetch = originalFetch;
  }
});

test('T7.1: App polling handles failed job states and renders actionable error guidance for SUPADATA_KEY_REQUIRED and SUPADATA_QUOTA_EXHAUSTED', async () => {
  const originalFetch = globalThis.fetch;

  // 1. Verify SUPADATA_KEY_REQUIRED failed job handling through App submit & polling
  let keyRequiredError: string | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    if (urlStr.includes('/analyze/jobs')) {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ job_id: 'job-key-required' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          job_id: 'job-key-required',
          status: 'failed',
          error_code: 'SUPADATA_KEY_REQUIRED',
          error: 'A Supadata API key is required to retrieve transcripts.',
        }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as typeof fetch;

  try {
    let appActions: { startAnalysis: (url: string, force?: boolean) => Promise<void> } | undefined;
    renderToStaticMarkup(
      <App
        onInit={(actions) => {
          appActions = actions;
        }}
        onErrorChange={(err) => {
          keyRequiredError = err;
        }}
      />
    );

    assert.ok(appActions);
    await appActions.startAnalysis('https://www.youtube.com/watch?v=mock_video');

    assert.ok(keyRequiredError, 'App must update error state on failed job with SUPADATA_KEY_REQUIRED');
    assert.match(keyRequiredError, /supadata\.ai/);
    assert.match(keyRequiredError, /100 free fetches\/month/);

    // Verify rendered guidance in App
    const renderedKeyRequired = renderToStaticMarkup(
      <App initialError={keyRequiredError} initialShowKeyInput={true} />
    );
    assert.match(renderedKeyRequired, /role="alert"/);
    assert.match(renderedKeyRequired, /Get Free Key at Supadata\.ai ↗/);
    assert.match(renderedKeyRequired, /href="https:\/\/supadata\.ai"/);
    assert.match(renderedKeyRequired, /Enter API Key/);

    // 2. Verify SUPADATA_QUOTA_EXHAUSTED failed job handling through App submit & polling
    let quotaExhaustedError: string | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes('/analyze/jobs')) {
        if (init?.method === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ job_id: 'job-quota-exhausted' }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            job_id: 'job-quota-exhausted',
            status: 'failed',
            error_code: 'SUPADATA_QUOTA_EXHAUSTED',
            error: 'Transcript quota exhausted',
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof fetch;

    renderToStaticMarkup(
      <App
        onInit={(actions) => {
          appActions = actions;
        }}
        onErrorChange={(err) => {
          quotaExhaustedError = err;
        }}
      />
    );

    assert.ok(appActions);
    await appActions.startAnalysis('https://www.youtube.com/watch?v=mock_video');

    assert.ok(quotaExhaustedError, 'App must update error state on failed job with SUPADATA_QUOTA_EXHAUSTED');
    assert.match(quotaExhaustedError, /supadata\.ai\/pricing/);
    assert.match(quotaExhaustedError, /quota has been reached/);

    // Verify rendered guidance in App
    const renderedQuotaExhausted = renderToStaticMarkup(
      <App initialError={quotaExhaustedError} />
    );
    assert.match(renderedQuotaExhausted, /role="alert"/);
    assert.match(renderedQuotaExhausted, /Upgrade Plan at Supadata ↗/);
    assert.match(renderedQuotaExhausted, /href="https:\/\/supadata\.ai\/pricing"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
