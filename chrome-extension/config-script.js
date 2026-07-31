// Default configuration
const DEFAULT_CONFIG = {
  backendUrl: "http://localhost:8000",
  cacheEnabled: true,
  cacheDuration: 168,
  allowInsecureUrls: false, // Never enable in production
  privacyPolicyUrl: undefined, // Use built-in policy by default
};

// Configuration validator
class ConfigValidator {
  // Validates configuration object against schema
  static validate(config) {
    const errors = [];

    // Validate backendUrl
    if (config.backendUrl !== undefined) {
      if (typeof config.backendUrl !== "string") {
        errors.push("backendUrl must be a string");
      } else if (
        !this.isValidUrl(config.backendUrl, config.allowInsecureUrls)
      ) {
        errors.push("backendUrl must be a valid HTTP/HTTPS URL");
      }
    }

    // Validate cacheEnabled
    if (
      config.cacheEnabled !== undefined &&
      typeof config.cacheEnabled !== "boolean"
    ) {
      errors.push("cacheEnabled must be a boolean");
    }

    // Validate cacheDuration
    if (config.cacheDuration !== undefined) {
      if (typeof config.cacheDuration !== "number") {
        errors.push("cacheDuration must be a number");
      } else if (config.cacheDuration < 1 || config.cacheDuration > 168) {
        errors.push("cacheDuration must be between 1 and 168 hours");
      }
    }

    // Validate allowInsecureUrls
    if (config.allowInsecureUrls !== undefined) {
      if (typeof config.allowInsecureUrls !== "boolean") {
        errors.push("allowInsecureUrls must be a boolean");
      } else if (config.allowInsecureUrls === true) {
        console.warn(
          "SECURITY WARNING: allowInsecureUrls is enabled. This should only be used for local development.",
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate URL with optional developer flag for insecure URLs
   *
   * @param {string} url - URL to validate
   * @param {boolean} allowInsecureUrls - Developer flag to permit HTTP URLs (default: false)
   * @returns {boolean} true if URL is valid
   */
  static isValidUrl(url, allowInsecureUrls = false) {
    try {
      const parsed = new URL(url);

      // Only allow HTTP/HTTPS protocols
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
      }

      // Enforce HTTPS except for localhost or when developer flag is enabled
      if (parsed.protocol === "http:") {
        const isLocalhost =
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "::1";

        if (!isLocalhost && !allowInsecureUrls) {
          return false;
        }

        if (!isLocalhost && allowInsecureUrls) {
          console.warn(
            "[ConfigValidator] allowInsecureUrls is enabled. " +
              "HTTP URLs are permitted for development/staging. " +
              "NEVER enable this in production!",
          );
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  // Get user-friendly error message for invalid URL
  static getUrlError(url) {
    try {
      const parsed = new URL(url);

      if (
        parsed.protocol === "http:" &&
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1" &&
        parsed.hostname !== "::1"
      ) {
        return "HTTPS is required for non-localhost addresses. Please use https:// instead of http://";
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Only HTTP and HTTPS protocols are supported";
      }

      return "Invalid URL format";
    } catch {
      return "Invalid URL format";
    }
  }
}

// Configuration manager with validation and fallbacks
class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  // Load configuration with validation and fallbacks
  async load() {
    try {
      const stored = await chrome.storage.local.get("config");

      if (!stored.config) {
        // No config found, use defaults
        await this.save(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }

      // Validate stored config
      const validation = ConfigValidator.validate(stored.config);

      if (!validation.valid) {
        console.warn(
          "Invalid config found, using defaults:",
          validation.errors,
        );
        await this.notifyInvalidConfig(validation.errors);
        await this.save(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }

      this.config = { ...DEFAULT_CONFIG, ...stored.config };
      return this.config;
    } catch (error) {
      console.error("Failed to load config from chrome.storage.local:", error);
      return { ...DEFAULT_CONFIG };
    }
  }

  // Save configuration with validation
  async save(config) {
    const validation = ConfigValidator.validate(config);

    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(", ")}`);
    }

    try {
      await chrome.storage.local.set({ config });
      this.config = config;
    } catch (error) {
      console.error("Failed to save config to chrome.storage.local:", error);
      throw error;
    }
  }

  async loadFromLocal() {
    return this.load();
  }

  async notifyInvalidConfig(_errors) {
    if (chrome.notifications) {
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Perspective Prism: Invalid Configuration",
        message: "Your settings were invalid and have been reset to defaults.",
      });
    } else {
      console.warn("Notifications API not available, skipping notification");
    }
  }

  get() {
    return { ...this.config };
  }
}

// Global assignments for content scripts and non-module environments
if (typeof window !== "undefined") {
  window.DEFAULT_CONFIG = DEFAULT_CONFIG;
  window.ConfigValidator = ConfigValidator;
  window.ConfigManager = ConfigManager;
}
