/**
 * Test Setup File
 *
 * This file runs before all tests to set up the test environment.
 * It mocks Chrome extension APIs and provides global test utilities.
 */

import { vi } from "vitest";

// Create Chrome API mock object
const createChromeMock = () => {
  return {
    storage: {
      sync: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      lastError: null,
    },
    tabs: {
      create: vi.fn(),
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      getAll: vi.fn(),
      onAlarm: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    notifications: {
      create: vi.fn(),
      clear: vi.fn(),
    },
  };
};

// Create and assign chrome mock globally
const chrome = createChromeMock();
global.chrome = chrome;

// Mock fetch API for tests
global.fetch = vi.fn();

// Setup mock implementations and reset before each test
beforeEach(() => {
  // Clear all mock call history
  vi.clearAllMocks();

  // Re-apply mock implementations for chrome.storage.sync
  chrome.storage.sync.get.mockImplementation((keys, callback) => {
    if (callback) {
      callback({});
    }
    return Promise.resolve({});
  });

  chrome.storage.sync.set.mockImplementation((items, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

  // Re-apply mock implementations for chrome.storage.local
  chrome.storage.local.get.mockImplementation((keys, callback) => {
    if (callback) {
      callback({});
    }
    return Promise.resolve({});
  });

  chrome.storage.local.set.mockImplementation((items, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

  chrome.storage.local.remove.mockImplementation((keys, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

  chrome.storage.local.clear.mockImplementation((callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

  // Re-apply mock implementations for chrome.runtime
  chrome.runtime.sendMessage.mockImplementation((message, callback) => {
    const response = { success: true };
    if (callback) {
      callback(response);
    }
    return Promise.resolve(response);
  });

  chrome.runtime.onMessage.addListener.mockImplementation(() => {});

  // Re-apply mock implementations for chrome.tabs
  chrome.tabs.create.mockImplementation((createProperties, callback) => {
    const tab = { id: 1, url: createProperties.url };
    if (callback) {
      callback(tab);
    }
    return Promise.resolve(tab);
  });

  chrome.tabs.query.mockImplementation((queryInfo, callback) => {
    const tabs = [];
    if (callback) {
      callback(tabs);
    }
    return Promise.resolve(tabs);
  });

  // Re-apply mock implementations for chrome.alarms
  chrome.alarms.create.mockImplementation(() => {});

  chrome.alarms.clear.mockImplementation((name, callback) => {
    if (callback) {
      callback(true);
    }
    return Promise.resolve(true);
  });

  chrome.alarms.getAll.mockImplementation((callback) => {
    if (callback) {
      callback([]);
    }
    return Promise.resolve([]);
  });

  chrome.alarms.onAlarm.addListener.mockImplementation(() => {});

  // Re-apply mock implementations for chrome.notifications
  chrome.notifications.create.mockImplementation(
    (notificationId, options, callback) => {
      const id = notificationId || "notification-id";
      if (callback) {
        callback(id);
      }
      return Promise.resolve(id);
    },
  );

  // Reset fetch mock
  if (global.fetch.mockClear) {
    global.fetch.mockClear();
  }
});

// Clean up after each test
afterEach(() => {
  // Do NOT use vi.restoreAllMocks() as it would remove our implementations
  // vi.clearAllMocks() in beforeEach is sufficient
});
