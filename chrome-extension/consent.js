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
   * @returns {Promise<boolean>} True if consent is given and version matches.
   */
  async checkConsent() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([this.STORAGE_KEY], (result) => {
        const consent = result[this.STORAGE_KEY];
        if (
          consent &&
          consent.given &&
          consent.policyVersion === this.POLICY_VERSION
        ) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Save consent status.
   * @param {boolean} given - Whether consent was given.
   * @returns {Promise<void>}
   */
  async saveConsent(given) {
    return new Promise((resolve, reject) => {
      const data = {
        [this.STORAGE_KEY]: {
          given: given,
          timestamp: Date.now(),
          policyVersion: this.POLICY_VERSION,
        },
      };

      chrome.storage.sync.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Perspective Prism] Failed to save consent:",
            chrome.runtime.lastError,
          );
          reject(chrome.runtime.lastError);
        } else {
          console.log(`[Perspective Prism] Consent saved: ${given}`);
          resolve();
        }
      });
    });
  }

  /**
   * Show the consent dialog.
   * @param {Function} callback - Called with true (allowed) or false (denied).
   */
  showConsentDialog(callback) {
    // Prevent duplicate dialogs
    if (document.getElementById("pp-consent-dialog-host")) {
      return;
    }

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
            <h2>Privacy & Consent</h2>
            <p>
                To analyze this video, Perspective Prism needs to send the video ID to our backend server. 
                We do not collect your browsing history or personal information.
            </p>
            <p>
                Analysis results are cached locally in your browser for 24 hours.
            </p>
            <div class="buttons">
                <a class="learn-more" id="learn-more-link">Learn More</a>
                <button class="btn-secondary" id="deny-btn">Deny</button>
                <button class="btn-primary" id="allow-btn">Allow and Continue</button>
            </div>
        `;

    shadow.appendChild(container);
    document.body.appendChild(host);

    // Event Listeners
    const learnMoreLink = shadow.getElementById("learn-more-link");
    const denyBtn = shadow.getElementById("deny-btn");
    const allowBtn = shadow.getElementById("allow-btn");

    learnMoreLink.onclick = () => {
      chrome.runtime.sendMessage({ type: "OPEN_PRIVACY_POLICY" });
    };

    denyBtn.onclick = async () => {
      await this.saveConsent(false);
      host.remove();
      callback(false);
    };

    allowBtn.onclick = async () => {
      await this.saveConsent(true);
      host.remove();
      callback(true);
    };
  }
}

// Export for use in content.js
window.ConsentManager = ConsentManager;
