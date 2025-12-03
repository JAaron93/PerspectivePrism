/**
 * Consent Manager for Perspective Prism
 * Handles user consent flow, storage, and UI dialogs.
 */

class ConsentManager {
  constructor() {
    this.STORAGE_KEY = "consent";
    this.POLICY_VERSION = "1.0.0";
  }

  /**
   * Check if valid consent exists.
   * @returns {Promise<Object>} Object with hasConsent, reason, and version info.
   */
  async checkConsent() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([this.STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Perspective Prism] Failed to check consent:",
            chrome.runtime.lastError,
          );
          resolve({ hasConsent: false, reason: "error" });
          return;
        }
        const consent = result[this.STORAGE_KEY];

        if (!consent || !consent.given) {
          resolve({ hasConsent: false, reason: "missing" });
        } else if (consent.policyVersion !== this.POLICY_VERSION) {
          console.log(
            `[Perspective Prism] Privacy policy version mismatch: stored=${consent.policyVersion}, current=${this.POLICY_VERSION}`,
          );
          resolve({
            hasConsent: false,
            reason: "version_mismatch",
            currentVersion: this.POLICY_VERSION,
            storedVersion: consent.policyVersion,
          });
        } else {
          resolve({ hasConsent: true, reason: "valid" });
        }
      });
    });
  }

  /**
   * Log policy version change for audit trail.
   * @param {string} oldVersion - Previous policy version.
   * @param {string} newVersion - New policy version.
   * @param {boolean} accepted - Whether user accepted the new version.
   */
  async logVersionChange(oldVersion, newVersion, accepted) {
    const logEntry = {
      timestamp: Date.now(),
      oldVersion: oldVersion,
      newVersion: newVersion,
      accepted: accepted,
    };

    try {
      // Get existing logs
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(["policy_version_logs"], (result) => {
          resolve(result.policy_version_logs || []);
        });
      });

      const logs = result;
      logs.push(logEntry);

      // Keep only last 50 logs
      const trimmedLogs = logs.slice(-50);

      // Save logs
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ policy_version_logs: trimmedLogs }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      console.log(
        `[Perspective Prism] Policy version change logged: ${oldVersion} -> ${newVersion} (accepted: ${accepted})`,
      );
    } catch (error) {
      console.error(
        "[Perspective Prism] Failed to log version change:",
        error,
      );
    }
  }

  /**
   * Save consent status.
   * @param {boolean} given - Whether consent was given.
   * @param {string} oldVersion - Previous policy version (for logging).
   * @returns {Promise<void>}
   */
  async saveConsent(given, oldVersion = null) {
    return new Promise((resolve, reject) => {
      const data = {
        [this.STORAGE_KEY]: {
          given: given,
          timestamp: Date.now(),
          policyVersion: this.POLICY_VERSION,
        },
      };

      chrome.storage.sync.set(data, async () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Perspective Prism] Failed to save consent:",
            chrome.runtime.lastError,
          );
          reject(chrome.runtime.lastError);
        } else {
          console.log(`[Perspective Prism] Consent saved: ${given}`);

          // Log version change if applicable
          if (oldVersion && oldVersion !== this.POLICY_VERSION) {
            await this.logVersionChange(
              oldVersion,
              this.POLICY_VERSION,
              given,
            );
          }

          resolve();
        }
      });
    });
  }

  /**
   * Show the consent dialog.
   * @param {Function} callback - Called with true (allowed) or false (denied).
   */
  showConsentDialog(callback, options = {}) {
    // Prevent duplicate dialogs
    if (document.getElementById("pp-consent-dialog-host")) {
      return;
    }

    const isUpdate = options.reason === "version_mismatch";
    const newVersion = this.POLICY_VERSION;

    const host = document.createElement("div");
    host.id = "pp-consent-dialog-host";
    host.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 2147483647; /* Max z-index */
            pointer-events: none; /* Let clicks pass through background */
        `;

    const shadow = host.attachShadow({ mode: "open" });

    // Dialog HTML
    const container = document.createElement("div");
    container.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.2);
            width: 400px;
            max-width: 90vw;
            font-family: Roboto, Arial, sans-serif;
            pointer-events: auto; /* Re-enable clicks for dialog */
            animation: fadeIn 0.3s ease-out;
        `;

    const title = isUpdate ? "Privacy Policy Updated" : "Privacy & Consent";
    const message = isUpdate
      ? `<p>Our privacy policy has been updated to version ${newVersion}. Please review the changes to continue using Perspective Prism.</p>`
      : `<p>To analyze this video, Perspective Prism needs to send the video ID to our backend server. We do not collect your browsing history or personal information.</p>
         <p>Analysis results are cached locally in your browser for 24 hours.</p>`;

    const denyText = isUpdate ? "Decline" : "Deny";
    const allowText = isUpdate ? "Accept" : "Allow and Continue";

    container.innerHTML = `
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; transform: translate(-50%, -48%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                h2 {
                    margin: 0 0 16px 0;
                    color: #0f0f0f;
                    font-size: 20px;
                    font-weight: 500;
                }
                p {
                    margin: 0 0 16px 0;
                    color: #606060;
                    font-size: 14px;
                    line-height: 1.5;
                }
                .buttons {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 24px;
                }
                button {
                    padding: 8px 16px;
                    border-radius: 18px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    transition: background 0.2s;
                }
                .btn-secondary {
                    background: transparent;
                    color: #606060;
                }
                .btn-secondary:hover {
                    background: #f2f2f2;
                }
                .btn-primary {
                    background: #065fd4;
                    color: white;
                }
                .btn-primary:hover {
                    background: #0556bf;
                }
                .learn-more {
                    color: #065fd4;
                    text-decoration: none;
                    font-size: 14px;
                    margin-right: auto;
                    align-self: center;
                    cursor: pointer;
                }
                .learn-more:hover {
                    text-decoration: underline;
                }
            </style>
            <h2>${title}</h2>
            ${message}
            <div class="buttons">
                <a class="learn-more" id="learn-more-link">${isUpdate ? "View Changes" : "Learn More"}</a>
                <button class="btn-secondary" id="deny-btn">${denyText}</button>
                <button class="btn-primary" id="allow-btn">${allowText}</button>
            </div>
        `;

    shadow.appendChild(container); // Append container to shadow DOM
    document.body.appendChild(host); // Append host to document body

    const learnMoreLink = shadow.getElementById("learn-more-link");
    const denyBtn = shadow.getElementById("deny-btn");
    const allowBtn = shadow.getElementById("allow-btn");

    learnMoreLink.onclick = async () => {
    try {
      // Use ConfigManager from config.js to check for custom policy URL
      let privacyPolicyUrl = null;
      
      // Try to use ConfigManager if available (it should be from config-script.js)
      if (typeof ConfigManager !== 'undefined') {
        try {
          const configManager = new ConfigManager();
          const config = await configManager.load();
          privacyPolicyUrl = config.privacyPolicyUrl;
        } catch (configError) {
          console.warn('[Perspective Prism] Could not load config for privacy URL:', configError);
        }
      }

      if (privacyPolicyUrl) {
        window.open(privacyPolicyUrl, "_blank");
      } else {
        chrome.runtime.sendMessage({ type: "OPEN_PRIVACY_POLICY" }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Perspective Prism] Failed to open privacy policy:",
              chrome.runtime.lastError,
            );
          }
        });
      }
    } catch (error) {
      console.error(
        "[Perspective Prism] Failed to handle privacy link:",
        error,
      );
      // Fallback to default
      chrome.runtime.sendMessage({ type: "OPEN_PRIVACY_POLICY" });
    }
  };

    denyBtn.onclick = async () => {
      try {
        if (isUpdate) {
          // If declining update, revoke consent entirely
          // Log the version change as declined
          if (options.storedVersion) {
            await this.logVersionChange(
              options.storedVersion,
              this.POLICY_VERSION,
              false,
            );
          }

          try {
            await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(
                { type: "REVOKE_CONSENT" },
                (response) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (response && response.error) {
                    reject(new Error(response.error));
                  } else {
                    resolve(response);
                  }
                },
              );
            });
          } catch (revokeError) {
            console.error(
              "[Perspective Prism] Failed to revoke consent via background:",
              revokeError,
            );
            // Fallback: try to save local consent as false at least
            await this.saveConsent(false, options.storedVersion);
          }
        } else {
          await this.saveConsent(false);
        }
        host.remove();
        callback(false);
      } catch (error) {
        console.error(
          "[Perspective Prism] Failed to save deny consent:",
          error,
        );
        alert("Failed to save your consent preference. Please try again.");
        // Keep dialog open for retry
      }
    };

    allowBtn.onclick = async () => {
      try {
        // Pass old version for logging if this is an update
        const oldVersion = isUpdate ? options.storedVersion : null;
        await this.saveConsent(true, oldVersion);
        host.remove();
        callback(true);
      } catch (error) {
        console.error(
          "[Perspective Prism] Failed to save allow consent:",
          error,
        );
        alert("Failed to save your consent preference. Please try again.");
        host.remove();
        callback(false);
      }
    };
  }
}

// Export for use in content.js
window.ConsentManager = ConsentManager;
