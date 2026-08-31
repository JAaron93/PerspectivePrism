/**
 * Test Setup File
 *
 * This file runs before all tests to set up the test environment.
 * It mocks Chrome extension APIs and provides global test utilities.
 */

import { vi } from "vitest";

// Node 24+ exposes an experimental global localStorage/sessionStorage that is
// unusable (undefined) unless --localstorage-file is provided. Because the
// globals already exist, Vitest's jsdom environment does not override them
// with jsdom's working storage, so install an in-memory shim when needed.
const installStorageShim = (name) => {
  const existing = globalThis[name];
  if (existing && typeof existing.getItem === "function") {
    return;
  }
  const store = new Map();
  Object.defineProperty(globalThis, name, {
    value: {
      getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
      setItem: (key, value) => store.set(String(key), String(value)),
      removeItem: (key) => store.delete(String(key)),
      clear: () => store.clear(),
      key: (index) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
    configurable: true,
    writable: true,
  });
};
installStorageShim("localStorage");
installStorageShim("sessionStorage");

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
      session: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
    },
    runtime: {
      id: "test-extension-id",
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onInstalled: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onStartup: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
      getManifest: vi.fn(() => ({ version: "0.2.0" })),
      lastError: null,
    },
    tabs: {
      create: vi.fn(),
      query: vi.fn(),
      sendMessage: vi.fn(),
      onActivated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
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
    sidePanel: {
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
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

  chrome.storage.sync.remove.mockImplementation((keys, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

  chrome.storage.sync.clear.mockImplementation((callback) => {
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

  // Re-apply mock implementations for chrome.storage.session
  chrome.storage.session.get.mockImplementation((keys, callback) => {
    if (callback) {
      callback({});
    }
    return Promise.resolve({});
  });

  chrome.storage.session.set.mockImplementation((items, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

  chrome.storage.session.remove.mockImplementation((keys, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

  chrome.storage.session.clear.mockImplementation((callback) => {
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
  if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener.mockImplementation(() => {});
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener.mockImplementation(() => {});

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

  chrome.tabs.onActivated.addListener.mockImplementation(() => {});
  chrome.tabs.onUpdated.addListener.mockImplementation(() => {});

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

  // Re-apply mock implementations for chrome.sidePanel
  if (!chrome.sidePanel) {
    chrome.sidePanel = {
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
    };
  }

  chrome.sidePanel.open.mockImplementation((options, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

  chrome.sidePanel.setPanelBehavior.mockImplementation((behavior, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });

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
