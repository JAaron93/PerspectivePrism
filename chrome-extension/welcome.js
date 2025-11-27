/**
 * Welcome Page Script
 * 
 * Handles user interactions on the welcome page:
 * - "Get Started" button opens the options page
 * - "View Privacy Policy" button opens the privacy policy page
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  initializeWelcomePage();
});

/**
 * Initialize welcome page functionality
 */
function initializeWelcomePage() {
  // Get Started button - opens options page
  const getStartedButton = document.getElementById('get-started');
  if (getStartedButton) {
    getStartedButton.addEventListener('click', openOptionsPage);
  }

  // View Privacy Policy button - opens privacy policy page
  const viewPrivacyButton = document.getElementById('view-privacy');
  if (viewPrivacyButton) {
    viewPrivacyButton.addEventListener('click', openPrivacyPolicy);
  }

  // Log welcome page view for analytics (optional)
  logWelcomePageView();
}

/**
 * Open the options page in a new tab
 */
function openOptionsPage() {
  try {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        console.error('Failed to open options page:', chrome.runtime.lastError);
        // Fallback: try to open directly
        chrome.tabs.create({ url: 'options.html' });
      }
    });
  } catch (error) {
    console.error('Error opening options page:', error);
    // Fallback: try to open directly
    chrome.tabs.create({ url: 'options.html' });
  }
}

/**
 * Open the privacy policy page in a new tab
 */
function openPrivacyPolicy() {
  try {
    chrome.tabs.create({ url: 'privacy.html' }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to open privacy policy:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('Error opening privacy policy:', error);
  }
}

/**
 * Log welcome page view for analytics
 * This helps track first-time user onboarding
 */
async function logWelcomePageView() {
  try {
    const result = await chrome.storage.local.get('welcome_page_views');
    const views = (result.welcome_page_views || 0) + 1;
    
    await chrome.storage.local.set({
      welcome_page_views: views,
      last_welcome_view: Date.now()
    });
    
    console.log(`[Welcome] Page view #${views}`);
  } catch (error) {
    console.error('Failed to log welcome page view:', error);
  }
}

/**
 * Check if user has completed setup
 * This can be used to show different messaging for returning users
 */
async function checkSetupStatus() {
  try {
    const result = await chrome.storage.sync.get('config');
    const config = result.config;
    
    if (config && config.backendUrl) {
      // User has configured backend URL
      return {
        configured: true,
        backendUrl: config.backendUrl
      };
    }
    
    return {
      configured: false
    };
  } catch (error) {
    console.error('Failed to check setup status:', error);
    return {
      configured: false
    };
  }
}

// Keyboard shortcuts for accessibility
document.addEventListener('keydown', (event) => {
  // Alt+S: Get Started (open settings)
  if (event.altKey && event.key === 's') {
    event.preventDefault();
    openOptionsPage();
  }
  
  // Alt+P: View Privacy Policy
  if (event.altKey && event.key === 'p') {
    event.preventDefault();
    openPrivacyPolicy();
  }
});
