// Options page script for Perspective Prism extension
// Handles settings UI, validation, and persistence

const logger = new window.Logger("[Options]");

// DOM elements
let backendUrlInput;
let testConnectionBtn;
let backendUrlError;
let backendUrlSuccess;
let cacheEnabledCheckbox;
let cacheDurationInput;
let cacheDurationError;
let allowAnalysisCheckbox;
let clearAllDataBtn;
let viewPrivacyPolicyBtn;
let saveSettingsBtn;
let resetDefaultsBtn;
let saveSuccess;
let saveError;

// Configuration manager instance
let configManager;

// Validation state
let isBackendUrlValid = false;
let isCacheDurationValid = true;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
  // Get DOM elements
  backendUrlInput = document.getElementById("backend-url");
  testConnectionBtn = document.getElementById("test-connection");
  backendUrlError = document.getElementById("backend-url-error");
  backendUrlSuccess = document.getElementById("backend-url-success");
  cacheEnabledCheckbox = document.getElementById("cache-enabled");
  cacheDurationInput = document.getElementById("cache-duration");
  cacheDurationError = document.getElementById("cache-duration-error");
  allowAnalysisCheckbox = document.getElementById("allow-analysis");
  clearAllDataBtn = document.getElementById("clear-all-data");
  viewPrivacyPolicyBtn = document.getElementById("view-privacy-policy");
  saveSettingsBtn = document.getElementById("save-settings");
  resetDefaultsBtn = document.getElementById("reset-defaults");
  saveSuccess = document.getElementById("save-success");
  saveError = document.getElementById("save-error");

  // Initialize config manager
  configManager = new ConfigManager();

  // Load current settings
  await loadSettings();

  // Setup event listeners
  setupEventListeners();

  // Perform initial validation
  validateBackendUrl();
  validateCacheDuration();

  // Check for privacy policy version updates
  await checkPrivacyPolicyVersion();
});

/**
 * Load settings from storage and populate form
 */
async function loadSettings() {
  try {
    const config = await configManager.load();

    // Populate form fields
    backendUrlInput.value = config.backendUrl || "";
    cacheEnabledCheckbox.checked = config.cacheEnabled !== false;
    cacheDurationInput.value = config.cacheDuration || 24;
    allowAnalysisCheckbox.checked = config.allowAnalysis !== false;

    logger.info("Settings loaded:", config);
  } catch (error) {
    logger.error("Failed to load settings:", error);
    showSaveError("Failed to load settings. Using defaults.");
  }
}

/**
 * Setup event listeners for form elements
 */
function setupEventListeners() {
  // Backend URL validation on input
  backendUrlInput.addEventListener("input", () => {
    validateBackendUrl();
    clearMessages();
  });

  // Backend URL validation on blur (when user leaves field)
  backendUrlInput.addEventListener("blur", () => {
    validateBackendUrl();
  });

  // Test connection button
  testConnectionBtn.addEventListener("click", testConnection);

  // Cache duration validation
  cacheDurationInput.addEventListener("input", () => {
    validateCacheDuration();
    clearMessages();
  });

  // Save settings button
  saveSettingsBtn.addEventListener("click", saveSettings);

  // Reset to defaults button
  resetDefaultsBtn.addEventListener("click", resetToDefaults);

  // Clear all data button
  clearAllDataBtn.addEventListener("click", clearAllData);

  // View privacy policy button
  viewPrivacyPolicyBtn.addEventListener("click", viewPrivacyPolicy);

  // Revoke consent button
  const revokeConsentBtn = document.getElementById("revoke-consent");
  if (revokeConsentBtn) {
    revokeConsentBtn.addEventListener("click", revokeConsent);
  }

  // Enable/disable cache duration input based on cache enabled checkbox
  cacheEnabledCheckbox.addEventListener("change", () => {
    cacheDurationInput.disabled = !cacheEnabledCheckbox.checked;
  });
}

/**
 * Validate backend URL in real-time
 * Shows inline error messages and disables Test/Save buttons when invalid
 */
function validateBackendUrl() {
  const url = backendUrlInput.value.trim();

  // Clear previous validation state
  backendUrlError.textContent = "";
  backendUrlError.classList.remove("visible");
  backendUrlInput.classList.remove("error");

  // Empty URL is invalid
  if (!url) {
    showBackendUrlError("Backend URL is required");
    isBackendUrlValid = false;
    updateButtonStates();
    return;
  }

  // Validate URL format and HTTPS requirement
  if (!ConfigValidator.isValidUrl(url, false)) {
    const errorMessage = ConfigValidator.getUrlError(url);
    showBackendUrlError(errorMessage);
    isBackendUrlValid = false;
    updateButtonStates();
    return;
  }

  // URL is valid
  isBackendUrlValid = true;
  backendUrlInput.classList.remove("error");
  updateButtonStates();
}

/**
 * Validate cache duration
 */
function validateCacheDuration() {
  const duration = parseInt(cacheDurationInput.value, 10);

  // Clear previous validation state
  cacheDurationError.textContent = "";
  cacheDurationError.classList.remove("visible");
  cacheDurationInput.classList.remove("error");

  // Validate range (1-168 hours)
  if (isNaN(duration) || duration < 1 || duration > 168) {
    cacheDurationError.textContent =
      "Cache duration must be between 1 and 168 hours";
    cacheDurationError.classList.add("visible");
    cacheDurationInput.classList.add("error");
    isCacheDurationValid = false;
    updateButtonStates();
    return;
  }

  // Duration is valid
  isCacheDurationValid = true;
  updateButtonStates();
}

/**
 * Show backend URL error message
 */
function showBackendUrlError(message) {
  backendUrlError.textContent = message;
  backendUrlError.classList.add("visible");
  backendUrlInput.classList.add("error");
}

/**
 * Update button states based on validation
 * Disable Test/Save buttons when URL is invalid
 */
function updateButtonStates() {
  const isFormValid = isBackendUrlValid && isCacheDurationValid;

  testConnectionBtn.disabled = !isBackendUrlValid;
  saveSettingsBtn.disabled = !isFormValid;
}

/**
 * Test connection to backend server
 */
async function testConnection() {
  const url = backendUrlInput.value.trim();

  if (!isBackendUrlValid) {
    return;
  }

  // Clear previous messages
  clearMessages();

  // Show loading state
  testConnectionBtn.disabled = true;
  testConnectionBtn.innerHTML = '<span class="spinner"></span> Testing...';

  try {
    // Test connection with 10-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${url}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      // Connection successful
      showBackendUrlSuccess("✓ Connected successfully");
      logger.info("Connection test successful");
    } else {
      // Server responded but with error
      showBackendUrlError(
        `Connection failed: Server returned ${response.status}`,
      );
      logger.error("Connection test failed:", response.status);
    }
  } catch (error) {
    // Network error or timeout
    if (error.name === "AbortError") {
      showBackendUrlError(
        "Connection timeout: Server did not respond within 10 seconds",
      );
    } else if (error.name === "TypeError") {
      showBackendUrlError(
        "Cannot connect to server. Check the URL and try again.",
      );
    } else {
      showBackendUrlError(`Connection failed: ${error.message}`);
    }
    logger.error("Connection test error:", error);
  } finally {
    // Restore button state
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = "Test Connection";
  }
}

/**
 * Show backend URL success message
 */
function showBackendUrlSuccess(message) {
  backendUrlSuccess.textContent = message;
  backendUrlSuccess.classList.add("visible");

  // Auto-hide after 5 seconds
  setTimeout(() => {
    backendUrlSuccess.classList.remove("visible");
  }, 5000);
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  if (!isBackendUrlValid || !isCacheDurationValid) {
    return;
  }

  // Clear previous messages
  clearMessages();

  // Disable save button during save
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.innerHTML = '<span class="spinner"></span> Saving...';

  try {
    // Build config object
    const config = {
      backendUrl: backendUrlInput.value.trim(),
      cacheEnabled: cacheEnabledCheckbox.checked,
      cacheDuration: parseInt(cacheDurationInput.value, 10),
      allowAnalysis: allowAnalysisCheckbox.checked,
      allowInsecureUrls: false, // Never enable in production
    };

    // Save config
    await configManager.save(config);

    // Show success message
    showSaveSuccess("✓ Settings saved successfully");
    logger.info("Settings saved:", config);
  } catch (error) {
    // Show error message
    showSaveError(`Failed to save settings: ${error.message}`);
    logger.error("Failed to save settings:", error);
  } finally {
    // Restore button state
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = "Save Settings";
  }
}

/**
 * Reset settings to defaults
 */
async function resetToDefaults() {
  if (!confirm("Are you sure you want to reset all settings to defaults?")) {
    return;
  }

  try {
    // Save default config
    await configManager.save(DEFAULT_CONFIG);

    // Reload settings in form
    await loadSettings();

    // Revalidate
    validateBackendUrl();
    validateCacheDuration();

    // Show success message
    showSaveSuccess("✓ Settings reset to defaults");
    logger.info("Settings reset to defaults");
  } catch (error) {
    showSaveError(`Failed to reset settings: ${error.message}`);
    logger.error("Failed to reset settings:", error);
  }
}

/**
 * Clear all cached data
 */
async function clearAllData() {
  if (
    !confirm(
      "Are you sure you want to clear all cached analysis data? This cannot be undone.",
    )
  ) {
    return;
  }

  try {
    // Clear all cache entries
    const allKeys = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(allKeys).filter(
      (key) => key.startsWith("cache_") || key === "cache_metadata",
    );

    if (cacheKeys.length > 0) {
      await chrome.storage.local.remove(cacheKeys);
      showSaveSuccess(`✓ Cleared ${cacheKeys.length} cached entries`);
      logger.info("Cleared cache:", cacheKeys.length, "entries");
    } else {
      showSaveSuccess("✓ No cached data to clear");
    }
  } catch (error) {
    showSaveError(`Failed to clear cache: ${error.message}`);
    logger.error("Failed to clear cache:", error);
  }
}

/**
 * View privacy policy
 */
function viewPrivacyPolicy() {
  // Open local privacy policy page
  chrome.tabs.create({
    url: chrome.runtime.getURL("privacy.html"),
  });
}

/**
 * Revoke consent
 */
async function revokeConsent() {
  if (
    !confirm(
      "Are you sure you want to revoke your consent? This will cancel any pending analysis, clear all cached data, and disable analysis functionality until you consent again.",
    )
  ) {
    return;
  }

  try {
    // Send revocation message to background script
    await Promise.race([
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "REVOKE_CONSENT" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 10000),
      ),
    ]);

    // Update UI to reflect revocation
    await loadSettings();
    showSaveSuccess("✓ Consent revoked and data cleared");
    logger.info("Consent revoked");
  } catch (error) {
    showSaveError(`Failed to revoke consent: ${error.message}`);
    logger.error("Failed to revoke consent:", error);
  }
}

/**
 * Show save success message
 */
function showSaveSuccess(message) {
  saveSuccess.textContent = message;
  saveSuccess.classList.add("visible");
  saveError.classList.remove("visible");

  // Auto-hide after 5 seconds
  setTimeout(() => {
    saveSuccess.classList.remove("visible");
  }, 5000);
}

/**
 * Show save error message
 */
function showSaveError(message) {
  saveError.textContent = message;
  saveError.classList.add("visible");
  saveSuccess.classList.remove("visible");
}

/**
 * Clear all messages
 */
function clearMessages() {
  backendUrlSuccess.classList.remove("visible");
  saveSuccess.classList.remove("visible");
  saveError.classList.remove("visible");
}


/**
 * Check for privacy policy version updates and show dialog if needed.
 * This runs on settings page load to ensure users are aware of policy changes.
 */
async function checkPrivacyPolicyVersion() {
  try {
    // Check if ConsentManager is available
    if (typeof ConsentManager === "undefined") {
      logger.warn("ConsentManager not available, skipping policy version check");
      return;
    }

    const consentManager = new ConsentManager();
    const consent = await consentManager.checkConsent();

    // If there's a version mismatch, show the consent dialog
    if (
      !consent.hasConsent &&
      consent.reason === "version_mismatch"
    ) {
      logger.info(
        `Privacy policy version mismatch detected: ${consent.storedVersion} -> ${consent.currentVersion}`,
      );

      // Show consent dialog with version update message
      consentManager.showConsentDialog(
        async (allowed) => {
          if (allowed) {
            logger.info("User accepted updated privacy policy");
            // Show success message
            showSaveSuccess(
              "Privacy policy accepted. You can now use the extension.",
            );
          } else {
            logger.info("User declined updated privacy policy");
            // Show warning message
            showSaveError(
              "Privacy policy declined. Analysis features are disabled until you accept the updated policy.",
            );
          }
        },
        consent, // Pass consent object with version info
      );
    }
  } catch (error) {
    logger.error(
      "Failed to check privacy policy version:",
      error,
    );
  }
}
