import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import DefaultConfigManager, * as moduleConfig from "../../config.js";

const olderConfig = {
  backendUrl: "https://api.example.com",
  cacheEnabled: false,
  cacheDuration: 24,
  allowInsecureUrls: false,
  privacyPolicyUrl: "https://example.com/privacy",
};

const invalidKeys = [
  ["null", null],
  ["zero", 0],
  ["number", 123],
  ["false", false],
  ["true", true],
  ["array", ["test-secret"]],
  ["object", { key: "test-secret" }],
  ["function", () => "test-secret"],
  ["symbol", Symbol("test-secret")],
  ["bigint", 1n],
];

describe.each(["module", "classic"])("Supadata config (%s)", (variant) => {
  let configApi;
  let storedConfig;

  beforeEach(() => {
    if (variant === "classic") {
      const source = readFileSync(
        resolve(__dirname, "../../config-script.js"),
        "utf-8",
      );
      configApi = {};
      new Function("window", source)(configApi);
    } else {
      configApi = moduleConfig;
    }

    storedConfig = undefined;
    chrome.storage.local.get.mockImplementation(async () =>
      storedConfig === undefined ? {} : { config: { ...storedConfig } },
    );
    chrome.storage.local.set.mockImplementation(async ({ config }) => {
      storedConfig = { ...config };
    });
  });

  it("exposes matching defaults through the existing exports and window globals", () => {
    expect(DefaultConfigManager).toBe(moduleConfig.ConfigManager);
    expect(window.ConfigManager).toBe(moduleConfig.ConfigManager);
    expect(window.ConfigValidator).toBe(moduleConfig.ConfigValidator);
    expect(window.DEFAULT_CONFIG).toBe(moduleConfig.DEFAULT_CONFIG);
    expect(configApi.DEFAULT_CONFIG).toEqual(moduleConfig.DEFAULT_CONFIG);
    expect(configApi.DEFAULT_CONFIG).toEqual({
      backendUrl: "http://localhost:8000",
      cacheEnabled: true,
      cacheDuration: 168,
      allowInsecureUrls: false,
      privacyPolicyUrl: undefined,
      supadataApiKey: "",
    });
    expect(new configApi.ConfigManager().get()).toEqual(configApi.DEFAULT_CONFIG);
  });

  it("accepts older configuration without the optional key", () => {
    expect(configApi.ConfigValidator.validate(olderConfig)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["string", "test-supadata-key"],
    ["whitespace", "   "],
    ["untrimmed string", "  test-supadata-key  "],
  ])("accepts an %s key", (_label, supadataApiKey) => {
    expect(
      configApi.ConfigValidator.validate({ ...olderConfig, supadataApiKey }),
    ).toEqual({ valid: true, errors: [] });
  });

  it.each(invalidKeys)(
    "rejects a %s key with a field-only error and no storage writes",
    async (_label, supadataApiKey) => {
      const config = { ...olderConfig, supadataApiKey };
      expect(configApi.ConfigValidator.validate(config)).toEqual({
        valid: false,
        errors: ["supadataApiKey must be a string"],
      });
      await expect(new configApi.ConfigManager().save(config)).rejects.toThrow(
        new Error("Invalid configuration: supadataApiKey must be a string"),
      );
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    },
  );

  it("loads older local configuration with the new default without rewriting storage", async () => {
    storedConfig = { ...olderConfig };
    const manager = new configApi.ConfigManager();

    expect(await manager.load()).toEqual({ ...olderConfig, supadataApiKey: "" });
    expect(manager.get()).toEqual({ ...olderConfig, supadataApiKey: "" });
    expect(chrome.storage.local.get).toHaveBeenCalledWith("config");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
  });

  it("saves older configuration unchanged and adds the default only on load", async () => {
    const manager = new configApi.ConfigManager();
    await manager.save({ ...olderConfig });

    expect(chrome.storage.local.set).toHaveBeenCalledExactlyOnceWith({
      config: olderConfig,
    });
    expect(manager.get()).toEqual(olderConfig);
    expect(await new configApi.ConfigManager().loadFromLocal()).toEqual({
      ...olderConfig,
      supadataApiKey: "",
    });
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
  });

  it.each(["", "test-supadata-key", "  test-supadata-key  "])(
    "round-trips repeated identical saves of %j through local storage only",
    async (supadataApiKey) => {
      const config = { ...olderConfig, supadataApiKey };
      const manager = new configApi.ConfigManager();
      await manager.save({ ...config });
      await manager.save({ ...config });

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);
      expect(chrome.storage.local.set).toHaveBeenNthCalledWith(1, { config });
      expect(chrome.storage.local.set).toHaveBeenNthCalledWith(2, { config });
      expect(manager.get()).toEqual(config);
      expect(await new configApi.ConfigManager().load()).toEqual(config);
      expect(chrome.storage.local.get).toHaveBeenCalledWith("config");
      expect(chrome.storage.sync.get).not.toHaveBeenCalled();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
    },
  );
});
