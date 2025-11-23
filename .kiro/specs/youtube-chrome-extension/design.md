# Design Document: YouTube Chrome Extension

## Overview

The YouTube Chrome Extension is a Manifest V3 browser extension that integrates Perspective Prism's video analysis capabilities directly into the YouTube browsing experience. The extension uses a content script to inject UI elements into YouTube pages, a background service worker to handle API communication with the Perspective Prism backend, and Chrome's storage API for caching and configuration management.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     YouTube Web Page                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Content Script (content.js)                   │ │
│  │  - Detects video page                                   │ │
│  │  - Injects Analysis Button                              │ │
│  │  - Renders Analysis Panel                               │ │
│  │  - Handles user interactions                            │ │
│  └─────────────────┬───────────────────────────────────────┘ │
└────────────────────┼─────────────────────────────────────────┘
                     │ Chrome Runtime Messages
                     │
┌────────────────────▼─────────────────────────────────────────┐
│        Background Service Worker (background.js)             │
│  - Manages API requests to Perspective Prism Backend         │
│  - Handles caching logic                                     │
│  - Manages extension state                                   │
└────────────────────┬─────────────────────────────────────────┘
                     │ HTTP/HTTPS
                     │
┌────────────────────▼─────────────────────────────────────────┐
│           Perspective Prism Backend (FastAPI)                │
│  - Existing /analyze endpoint                                │
│  - Claim extraction and analysis services                    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              Chrome Storage API                              │
│  - Extension configuration (backend URL)                     │
│  - Cached analysis results (indexed by video ID)             │
│  - User preferences                                          │
└──────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

1. User navigates to YouTube video page
2. Content script detects video page and extracts video ID
3. Content script checks cache via background service worker
4. If cached, display results immediately
5. If not cached, inject Analysis Button
6. User clicks Analysis Button
7. Content script sends message to background service worker
8. Background service worker makes API request to Perspective Prism Backend
9. Backend returns analysis results
10. Background service worker caches results and sends to content script
11. Content script renders Analysis Panel with results

## Components and Interfaces

### 1. Manifest File (manifest.json)

**Purpose:** Defines extension metadata, permissions, and entry points.

**Structure:**
```json
{
  "manifest_version": 3,
  "name": "Perspective Prism - YouTube Analyzer",
  "version": "1.0.0",
  "description": "Analyze YouTube videos for claims and perspectives",
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://*.youtube.com/*",
    "https://youtu.be/*",
    "https://*.youtube-nocookie.com/*",
    "https://m.youtube.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/watch*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "options_page": "options.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Key Decisions:**
- Manifest V3 for future compatibility and better security
- Minimal permissions (storage, activeTab) for user trust
- Content script runs at `document_idle` to avoid interfering with YouTube's initial load

### 2. Content Script (content.js)

**Purpose:** Interacts with YouTube DOM, injects UI elements, handles user interactions.

**Key Responsibilities:**
- Detect YouTube video pages and extract video ID
- Inject Analysis Button into YouTube UI
- Create and manage Analysis Panel
- Handle user clicks and interactions
- Communicate with background service worker via Chrome runtime messaging

**Interface:**

```typescript
// Message types sent to background service worker
interface AnalysisRequest {
  type: 'ANALYZE_VIDEO';
  videoId: string;
}

interface CacheCheckRequest {
  type: 'CHECK_CACHE';
  videoId: string;
}

// Message types received from background service worker
interface AnalysisResponse {
  type: 'ANALYSIS_RESULT';
  videoId: string;
  data: AnalysisData | null;
  error?: string;
}

interface CacheCheckResponse {
  type: 'CACHE_RESULT';
  videoId: string;
  data: AnalysisData | null;
}

// Analysis data structure (matches backend response)
interface AnalysisData {
  video_id: string;
  claims: Claim[];
  metadata: {
    analyzed_at: string;
    video_title?: string;
  };
}

interface Claim {
  claim_text: string;
  timestamp?: string;
  truth_profile: TruthProfile;
}

interface TruthProfile {
  perspectives: {
    scientific?: PerspectiveAnalysis;
    journalistic?: PerspectiveAnalysis;
    partisan_left?: PerspectiveAnalysis;
    partisan_right?: PerspectiveAnalysis;
  };
  bias_indicators: BiasIndicators;
  overall_assessment: string;
}

interface PerspectiveAnalysis {
  assessment: string;
  confidence: number;
  supporting_evidence: string[];
}

interface BiasIndicators {
  logical_fallacies: string[];
  emotional_manipulation: string[];
  deception_score: number;
}
```

**DOM Injection Strategy:**

The extension uses a multi-layered selector strategy with fallbacks to handle YouTube's evolving DOM structure:

1. **Primary Selector Strategy:**
   - Target: `#top-level-buttons-computed` (YouTube's action button container)
   - Fallback 1: `#menu-container` (alternative button container)
   - Fallback 2: `#info-contents` (video metadata area, more stable)
   - Fallback 3: Create floating button if no container found

2. **Injection Process:**
   - Attempt injection using primary selector
   - If no match, try fallback selectors in order
   - If all selectors fail, skip injection and set up retry mechanism
   - Use MutationObserver to detect when target containers appear
   - Implement exponential backoff for retries (1s, 2s, 4s, max 3 attempts)

3. **Duplication Prevention:**
   - Before injecting, check for existing button using unique attribute
   - Button element has `data-pp-analysis-button="true"` attribute
   - Query: `document.querySelector('[data-pp-analysis-button="true"]')`
   - If button exists, skip injection and update state only
   - Prevents duplicate buttons on YouTube's SPA navigation

4. **MutationObserver Configuration:**

   **For Specific Container (Preferred):**
   ```typescript
   // Observe the control bar container directly
   const targetNode = document.querySelector('#top-level-buttons-computed');
   
   if (targetNode) {
     const observer = new MutationObserver(handleMutations);
     observer.observe(targetNode, {
       childList: true,    // Watch for added/removed children
       subtree: false,     // Don't watch descendants (performance)
       attributes: false   // Don't watch attribute changes
     });
   }
   ```

   **For Document Body (Fallback):**
   ```typescript
   // If no reliable container, observe document.body
   // Use subtree: true to catch dynamic container creation
   const observer = new MutationObserver(handleMutations);
   observer.observe(document.body, {
     childList: true,    // Watch for added/removed children
     subtree: true,      // Watch all descendants (necessary for fallback)
     attributes: false   // Don't watch attribute changes
   });
   ```

   **Performance Considerations:**
   - Prefer observing specific container (subtree: false) for better performance
   - Only use subtree: true when no reliable container selector exists
   - Disconnect observer when button successfully injected (if no SPA navigation)
   - Throttle mutation handler to max 1 execution per 500ms

5. **Graceful Degradation:**
   - If injection fails after all retries, show notification in extension popup
   - Log selector failure details for monitoring
   - Continue monitoring for DOM changes (YouTube's SPA navigation)

6. **Selector Monitoring:**
   - Track selector success/failure rates in chrome.storage.local
   - Include metadata: selector used, timestamp, YouTube layout variant
   - Periodically report metrics (can be used for future selector updates)
   - Clear metrics older than 30 days

7. **Style Isolation:**
   - Use Shadow DOM for Analysis Panel to prevent style conflicts
   - Inject button with scoped CSS classes (prefixed with `pp-ext-`)
   - Create Analysis Panel as a fixed overlay with z-index: 9999

**Video ID Extraction:**

The extension implements a comprehensive video ID extraction strategy that handles multiple YouTube URL formats:

```typescript
function extractVideoId(): string | null {
  // Strategy 1: Standard watch URL parameter (?v=VIDEO_ID)
  const urlParams = new URLSearchParams(window.location.search);
  const watchParam = urlParams.get('v');
  if (watchParam && isValidVideoId(watchParam)) {
    return watchParam;
  }
  
  // Strategy 2: Path-based patterns
  const pathname = window.location.pathname;
  
  // Shorts format: /shorts/VIDEO_ID
  const shortsMatch = pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
  if (shortsMatch && isValidVideoId(shortsMatch[1])) {
    return shortsMatch[1];
  }
  
  // Embed format: /embed/VIDEO_ID
  const embedMatch = pathname.match(/\/embed\/([A-Za-z0-9_-]+)/);
  if (embedMatch && isValidVideoId(embedMatch[1])) {
    return embedMatch[1];
  }
  
  // Legacy format: /v/VIDEO_ID
  const legacyMatch = pathname.match(/\/v\/([A-Za-z0-9_-]+)/);
  if (legacyMatch && isValidVideoId(legacyMatch[1])) {
    return legacyMatch[1];
  }
  
  // Strategy 3: Check for video ID in hash fragment (rare but possible)
  const hashMatch = window.location.hash.match(/[?&]v=([A-Za-z0-9_-]+)/);
  if (hashMatch && isValidVideoId(hashMatch[1])) {
    return hashMatch[1];
  }
  
  // No valid video ID found
  return null;
}

function isValidVideoId(id: string): boolean {
  // YouTube video IDs are exactly 11 characters
  // Valid characters: A-Z, a-z, 0-9, underscore, hyphen
  const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  return videoIdRegex.test(id);
}
```

**Extraction Strategy Details:**
- Try standard watch parameter first (most common)
- Fall back to path-based patterns for Shorts, embeds, and legacy URLs
- Check hash fragment as last resort
- Validate all candidate IDs with permissive regex
- Return null if no valid ID found (triggers appropriate error handling)
- Log extraction method used for monitoring and debugging

### 3. Background Service Worker (background.js)

**Purpose:** Manages API communication, caching, and extension state.

**Key Responsibilities:**
- Handle messages from content scripts
- Make HTTP requests to Perspective Prism Backend
- Manage cache storage and retrieval
- Handle configuration management
- Implement retry logic for failed requests

**Interface:**

```typescript
// Configuration stored in chrome.storage.sync
interface ExtensionConfig {
  backendUrl: string;
  cacheEnabled: boolean;
  cacheDuration: number; // hours
  allowInsecureUrls?: boolean; // Developer flag for HTTP URLs (default: false)
  privacyPolicyUrl?: string; // Optional external privacy policy URL
}

// Default configuration values
const DEFAULT_CONFIG: ExtensionConfig = {
  backendUrl: 'http://localhost:8000',
  cacheEnabled: true,
  cacheDuration: 24,
  allowInsecureUrls: false, // Never enable in production
  privacyPolicyUrl: undefined // Use built-in policy by default
};

// Configuration validator
class ConfigValidator {
  // Validates configuration object against schema
  static validate(config: Partial<ExtensionConfig>): ValidationResult {
    const errors: string[] = [];
    
    // Validate backendUrl
    if (config.backendUrl !== undefined) {
      if (typeof config.backendUrl !== 'string') {
        errors.push('backendUrl must be a string');
      } else if (!this.isValidUrl(config.backendUrl)) {
        errors.push('backendUrl must be a valid HTTP/HTTPS URL');
      }
    }
    
    // Validate cacheEnabled
    if (config.cacheEnabled !== undefined && typeof config.cacheEnabled !== 'boolean') {
      errors.push('cacheEnabled must be a boolean');
    }
    
    // Validate cacheDuration
    if (config.cacheDuration !== undefined) {
      if (typeof config.cacheDuration !== 'number') {
        errors.push('cacheDuration must be a number');
      } else if (config.cacheDuration < 1 || config.cacheDuration > 168) {
        errors.push('cacheDuration must be between 1 and 168 hours');
      }
    }

    // Validate allowInsecureUrls
    if (config.allowInsecureUrls !== undefined) {
      if (typeof config.allowInsecureUrls !== 'boolean') {
        errors.push('allowInsecureUrls must be a boolean');
      } else if (config.allowInsecureUrls === true) {
        // Production Safeguard: Prevent enabling in production builds
        // Note: process.env.NODE_ENV is replaced at build time
        if (process.env.NODE_ENV === 'production') {
          errors.push('allowInsecureUrls cannot be enabled in production');
        } else {
          // Development Warning
          console.warn('SECURITY WARNING: allowInsecureUrls is enabled. This should only be used for local development.');
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate URL with optional developer flag for insecure URLs
   * 
   * @param url - URL to validate
   * @param allowInsecureUrls - Developer flag to permit HTTP URLs (default: false)
   * @returns true if URL is valid
   */
  private static isValidUrl(url: string, allowInsecureUrls: boolean = false): boolean {
    try {
      const parsed = new URL(url);
      
      // Only allow HTTP/HTTPS protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      
      // Enforce HTTPS except for localhost or when developer flag is enabled
      if (parsed.protocol === 'http:') {
        const isLocalhost = parsed.hostname === 'localhost' || 
                           parsed.hostname === '127.0.0.1' ||
                           parsed.hostname === '::1';
        
        if (!isLocalhost && !allowInsecureUrls) {
          // HTTP not allowed for non-localhost addresses unless developer flag is set
          return false;
        }
        
        // Log warning if developer flag is used
        if (!isLocalhost && allowInsecureUrls) {
          console.warn(
            '[ConfigValidator] allowInsecureUrls is enabled. ' +
            'HTTP URLs are permitted for development/staging. ' +
            'NEVER enable this in production!'
          );
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  // Get user-friendly error message for invalid URL
  static getUrlError(url: string): string {
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol === 'http:' && 
          parsed.hostname !== 'localhost' && 
          parsed.hostname !== '127.0.0.1' &&
          parsed.hostname !== '::1') {
        return 'HTTPS is required for non-localhost addresses. Please use https:// instead of http://';
      }
      
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Only HTTP and HTTPS protocols are supported';
      }
      
      return 'Invalid URL format';
    } catch {
      return 'Invalid URL format';
    }
  }
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Configuration manager with validation and fallbacks
class ConfigManager {
  private config: ExtensionConfig;
  
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }
  
  // Load configuration with validation and fallbacks
  async load(): Promise<ExtensionConfig> {
    try {
      const stored = await chrome.storage.sync.get('config');
      
      if (!stored.config) {
        // No config found, use defaults
        await this.save(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }
      
      // Validate stored config
      const validation = ConfigValidator.validate(stored.config);
      
      if (!validation.valid) {
        console.warn('Invalid config found, using defaults:', validation.errors);
        // Notify user of invalid config
        await this.notifyInvalidConfig(validation.errors);
        // Fall back to defaults
        await this.save(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }
      
      // Merge with defaults (in case new fields were added)
      this.config = { ...DEFAULT_CONFIG, ...stored.config };
      return this.config;
      
    } catch (error) {
      console.error('Failed to load config from chrome.storage.sync:', error);
      // Fall back to chrome.storage.local if sync is unavailable
      return this.loadFromLocal();
    }
  }
  
  // Save configuration with validation
  async save(config: ExtensionConfig): Promise<void> {
    const validation = ConfigValidator.validate(config);
    
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }
    
    try {
      await chrome.storage.sync.set({ config });
      this.config = config;
    } catch (error) {
      console.error('Failed to save config to chrome.storage.sync:', error);
      // Fall back to local storage
      await chrome.storage.local.set({ config });
      this.config = config;
    }
  }
  
  private async loadFromLocal(): Promise<ExtensionConfig> {
    try {
      const stored = await chrome.storage.local.get('config');
      return stored.config || DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  
  private async notifyInvalidConfig(errors: string[]): Promise<void> {
    // Show notification to user
    await chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Perspective Prism: Invalid Configuration',
      message: 'Your settings were invalid and have been reset to defaults.'
    });
  }
  
  get(): ExtensionConfig {
    return { ...this.config };
  }
}

// Cache entry structure
interface CacheEntry {
  videoId: string;
  data: AnalysisData;
  timestamp: number;
  expiresAt: number;
}

// API client with comprehensive error handling and retry logic
// Persistent request state for MV3 service worker recovery
interface PersistentRequestState {
  videoId: string;
  videoUrl: string;
  startTime: number;
  attemptCount: number;
  lastError?: string;
  status: 'pending' | 'retrying' | 'failed';
}

class PerspectivePrismClient {
  private baseUrl: string;
  private readonly TIMEOUT_MS = 120000; // 120 seconds
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAYS = [2000, 4000]; // Exponential backoff: 2s, 4s
  private readonly MAX_REQUEST_AGE = 300000; // 5 minutes - max time for request recovery
  private readonly API_VERSION = 'v1'; // Track API version for compatibility
  private pendingRequests: Map<string, Promise<AnalysisResult>>; // Request deduplication
  private recoveryComplete: boolean = false;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.pendingRequests = new Map();
    
    // Recover persisted requests on startup (MV3 service worker lifecycle)
    this.recoverPersistedRequests();
    
    // Setup alarm listener for retries
    this.setupAlarmListener();
  }
  
  /**
   * Setup listener for retry alarms
   * Handles resumption of analysis when alarm fires
   */
  private setupAlarmListener(): void {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (!alarm.name.startsWith('retry_')) return;
      
      try {
        // Parse alarm name: retry_{videoId}_{attemptCount}
        const parts = alarm.name.split('_');
        if (parts.length !== 3) return;
        
        const videoId = parts[1];
        const attemptCount = parseInt(parts[2], 10);
        
        console.log(`[PerspectivePrismClient] Retry alarm fired for ${videoId} (attempt ${attemptCount})`);
        
        // Get persisted state
        const state = await this.getPersistedRequestState(videoId);
        if (!state) {
          console.warn(`[PerspectivePrismClient] No persisted state found for ${videoId}, aborting retry`);
          return;
        }
        
        // Resume analysis
        // Note: executeAnalysisRequest handles the actual retry logic and state updates
        const result = await this.executeAnalysisRequest(videoId, state.videoUrl);
        
        // Send result to tabs
        // We use sendMessageWithRetry to ensure content scripts receive the update
        await sendMessageWithRetry({
          type: 'ANALYSIS_COMPLETE',
          payload: result
        }).catch(err => console.warn('Failed to notify tabs of retry result:', err));
        
        // Cleanup on success
        if (result.success) {
          await this.cleanupPersistedRequest(videoId);
        } else {
          // If failed, executeAnalysisRequest already logged it
          // If max retries reached, it returns success=false
          // We should cleanup if we're done retrying
          if (attemptCount >= this.MAX_RETRIES) {
            await this.cleanupPersistedRequest(videoId);
          }
        }
        
      } catch (error) {
        console.error('[PerspectivePrismClient] Error in alarm handler:', error);
      }
    });
  }
  
  /**
   * Recover persisted requests from chrome.storage.local
   * Called on service worker startup to resume in-flight requests
   * 
   * MV3 service workers can be terminated at any time, losing in-memory state.
   * This method restores requests that were in progress when the worker was terminated.
   */
  private async recoverPersistedRequests(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(null);
      const persistedKeys = Object.keys(storage).filter(key => key.startsWith('pending_request_'));
      
      console.log(`[PerspectivePrismClient] Recovering ${persistedKeys.length} persisted requests`);
      
      for (const key of persistedKeys) {
        const state: PersistentRequestState = storage[key];
        const age = Date.now() - state.startTime;
        
        // Clean up stale requests (older than 5 minutes)
        if (age > this.MAX_REQUEST_AGE) {
          console.log(`[PerspectivePrismClient] Cleaning up stale request: ${state.videoId}`);
          await this.cleanupPersistedRequest(state.videoId);
          continue;
        }
        
        // Resume request if not too old
        console.log(`[PerspectivePrismClient] Resuming request: ${state.videoId} (attempt ${state.attemptCount})`);
        
        // Schedule retry using chrome.alarms (survives worker termination)
        const delay = this.RETRY_DELAYS[Math.min(state.attemptCount, this.RETRY_DELAYS.length - 1)];
        await chrome.alarms.create(`retry_${state.videoId}_${state.attemptCount}`, {
          delayInMinutes: delay / 60000
        });
      }
      
      this.recoveryComplete = true;
      console.log('[PerspectivePrismClient] Recovery complete');
      
    } catch (error) {
      console.error('[PerspectivePrismClient] Recovery failed:', error);
      this.recoveryComplete = true; // Continue anyway
    }
  }
  
  /**
   * Persist request state to chrome.storage.local
   * Allows recovery if service worker is terminated
   */
  private async persistRequestState(state: PersistentRequestState): Promise<void> {
    try {
      await chrome.storage.local.set({
        [`pending_request_${state.videoId}`]: state
      });
    } catch (error) {
      console.error(`[PerspectivePrismClient] Failed to persist request state: ${state.videoId}`, error);
    }
  }
  
  /**
   * Clean up persisted request state
   * Called on success or terminal failure
   */
  private async cleanupPersistedRequest(videoId: string): Promise<void> {
    try {
      await chrome.storage.local.remove(`pending_request_${videoId}`);
      
      // Clear any associated alarms
      const alarms = await chrome.alarms.getAll();
      for (const alarm of alarms) {
        if (alarm.name.startsWith(`retry_${videoId}_`)) {
          await chrome.alarms.clear(alarm.name);
        }
      }
    } catch (error) {
      console.error(`[PerspectivePrismClient] Failed to cleanup request: ${videoId}`, error);
    }
  }
  
  /**
   * Analyze video with retry logic and request deduplication
   * 
   * API Contract:
   * - Endpoint: POST /analyze
   * - Request: { "video_url": "https://www.youtube.com/watch?v={videoId}" }
   * - Response: AnalysisData (validated against schema)
   * - API Version: v1 (current)
   * 
   * MV3 Lifecycle:
   * - Persists request state to chrome.storage.local
   * - Uses chrome.alarms for retry scheduling (survives worker termination)
   * - Recovers in-flight requests on worker startup
   * - Cleans up persisted state on completion
   * 
   * @param videoId - YouTube video ID (11 characters, alphanumeric with - and _)
   * @returns Promise<AnalysisResult> - Success with data or failure with error message
   */
  async analyzeVideo(videoId: string): Promise<AnalysisResult> {
    // Validate video ID format
    if (!this.isValidVideoId(videoId)) {
      return {
        success: false,
        error: 'Invalid video ID format',
        videoId
      };
    }
    
    // Check for pending request (deduplication - in-memory)
    const pending = this.pendingRequests.get(videoId);
    if (pending) {
      console.log(`[PerspectivePrismClient] Returning existing request for ${videoId}`);
      return pending;
    }
    
    // Check for persisted pending request (deduplication - persistent)
    const persistedState = await this.getPersistedRequestState(videoId);
    if (persistedState) {
      console.log(`[PerspectivePrismClient] Found persisted request for ${videoId}, waiting for completion`);
      // Return a promise that will resolve when the persisted request completes
      // This is handled by the alarm-based retry system
      return {
        success: false,
        error: 'Analysis in progress (recovering from service worker restart)',
        videoId
      };
    }
    
    // Convert video ID to full YouTube URL (API contract requirement)
    const videoUrl = this.buildVideoUrl(videoId);
    
    // Persist initial request state
    await this.persistRequestState({
      videoId,
      videoUrl,
      startTime: Date.now(),
      attemptCount: 0,
      status: 'pending'
    });
    
    // Create new request promise
    const requestPromise = this.executeAnalysisRequest(videoId, videoUrl);
    
    // Store in pending requests for deduplication
    this.pendingRequests.set(videoId, requestPromise);
    
    // Clean up on completion (success or failure)
    requestPromise.finally(async () => {
      this.pendingRequests.delete(videoId);
      await this.cleanupPersistedRequest(videoId);
    });
    
    return requestPromise;
  }
  
  /**
   * Get persisted request state from chrome.storage.local
   */
  private async getPersistedRequestState(videoId: string): Promise<PersistentRequestState | null> {
    try {
      const result = await chrome.storage.local.get(`pending_request_${videoId}`);
      return result[`pending_request_${videoId}`] || null;
    } catch (error) {
      console.error(`[PerspectivePrismClient] Failed to get persisted state: ${videoId}`, error);
      return null;
    }
  }
  
  // Execute analysis request with retry logic
  private async executeAnalysisRequest(videoId: string, videoUrl: string): Promise<AnalysisResult> {
    let lastError: Error | null = null;
    
    // Attempt request with retries
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await this.makeAnalysisRequest(videoUrl);
        
        // Log success metrics
        this.logMetrics({
          videoId,
          success: true,
          attempt,
          timestamp: Date.now()
        });
        
        return {
          success: true,
          data: result,
          videoId
        };
        
      } catch (error) {
        lastError = error as Error;
        
        // Determine if we should retry
        const shouldRetry = this.shouldRetryError(error, attempt);
        
        if (!shouldRetry) {
          // Don't retry on 4xx errors or after max retries
          break;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.MAX_RETRIES) {
          await this.delay(this.RETRY_DELAYS[attempt]);
        }
      }
    }
    
    // All attempts failed, log and return error
    this.logMetrics({
      videoId,
      success: false,
      error: lastError?.message || 'Unknown error',
      attempts: this.MAX_RETRIES + 1,
      timestamp: Date.now()
    });
    
    return {
      success: false,
      error: this.formatUserError(lastError),
      videoId
    };
  }
  
  // Make HTTP request with timeout and validation
  private async makeAnalysisRequest(videoUrl: string): Promise<AnalysisData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    
    try {
      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ video_url: videoUrl }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle HTTP errors
      if (!response.ok) {
        throw new HttpError(response.status, response.statusText);
      }
      
      // Parse and validate response
      const data = await response.json();
      const validatedData = this.validateAnalysisData(data);
      
      return validatedData;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError('Request timeout after 120 seconds');
      }
      
      throw error;
    }
  }
  
  /**
   * Validate response data against AnalysisData schema
   * 
   * This validation ensures data integrity before caching and display.
   * Invalid responses are rejected and logged, preventing corrupted data
   * from being stored or shown to users.
   * 
   * @param data - Raw response data from backend
   * @returns Validated AnalysisData object
   * @throws ValidationError if data doesn't match schema
   */
  private validateAnalysisData(data: any): AnalysisData {
    // Basic schema validation
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Response is not a valid object');
    }
    
    // Validate video_id (required, must be string)
    if (!data.video_id || typeof data.video_id !== 'string') {
      throw new ValidationError('Missing or invalid video_id');
    }
    
    // Validate video_id format (exactly 11 characters)
    if (!this.isValidVideoId(data.video_id)) {
      throw new ValidationError(`Invalid video_id format: ${data.video_id}`);
    }
    
    // Validate claims array (required)
    if (!Array.isArray(data.claims)) {
      throw new ValidationError('Missing or invalid claims array');
    }
    
    // Validate each claim structure
    for (let i = 0; i < data.claims.length; i++) {
      const claim = data.claims[i];
      
      // Validate claim_text (required)
      if (!claim.claim_text || typeof claim.claim_text !== 'string') {
        throw new ValidationError(`Invalid claim[${i}]: missing or invalid claim_text`);
      }
      
      // Validate truth_profile (required)
      if (!claim.truth_profile || typeof claim.truth_profile !== 'object') {
        throw new ValidationError(`Invalid claim[${i}]: missing or invalid truth_profile`);
      }
      
      // Validate truth_profile structure
      const profile = claim.truth_profile;
      
      // Validate perspectives object (required)
      if (!profile.perspectives || typeof profile.perspectives !== 'object') {
        throw new ValidationError(`Invalid claim[${i}]: missing or invalid perspectives`);
      }
      
      // Validate bias_indicators (required)
      if (!profile.bias_indicators || typeof profile.bias_indicators !== 'object') {
        throw new ValidationError(`Invalid claim[${i}]: missing or invalid bias_indicators`);
      }
      
      // Validate bias_indicators structure
      if (!Array.isArray(profile.bias_indicators.logical_fallacies)) {
        throw new ValidationError(`Invalid claim[${i}]: bias_indicators.logical_fallacies must be array`);
      }
      
      if (!Array.isArray(profile.bias_indicators.emotional_manipulation)) {
        throw new ValidationError(`Invalid claim[${i}]: bias_indicators.emotional_manipulation must be array`);
      }
      
      if (typeof profile.bias_indicators.deception_score !== 'number') {
        throw new ValidationError(`Invalid claim[${i}]: bias_indicators.deception_score must be number`);
      }
      
      // Validate overall_assessment (required)
      if (!profile.overall_assessment || typeof profile.overall_assessment !== 'string') {
        throw new ValidationError(`Invalid claim[${i}]: missing or invalid overall_assessment`);
      }
      
      // Validate perspective analyses (at least one required)
      const perspectives = profile.perspectives;
      const hasValidPerspective = ['scientific', 'journalistic', 'partisan_left', 'partisan_right']
        .some(key => {
          const perspective = perspectives[key];
          return perspective && 
                 typeof perspective === 'object' &&
                 typeof perspective.assessment === 'string' &&
                 typeof perspective.confidence === 'number' &&
                 Array.isArray(perspective.supporting_evidence);
        });
      
      if (!hasValidPerspective) {
        throw new ValidationError(`Invalid claim[${i}]: no valid perspective analysis found`);
      }
    }
    
    // Validate metadata (optional but if present, must be valid)
    if (data.metadata) {
      if (typeof data.metadata !== 'object') {
        throw new ValidationError('Invalid metadata: must be object');
      }
      
      if (data.metadata.analyzed_at && typeof data.metadata.analyzed_at !== 'string') {
        throw new ValidationError('Invalid metadata.analyzed_at: must be string');
      }
    }
    
    // All validations passed
    return data as AnalysisData;
  }
  
  // Determine if error is retryable
  private shouldRetryError(error: any, attempt: number): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= this.MAX_RETRIES) {
      return false;
    }
    
    // Don't retry on 4xx client errors
    if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
      return false;
    }
    
    // Don't retry on validation errors
    if (error instanceof ValidationError) {
      return false;
    }
    
    // Retry on network errors, timeouts, and 5xx server errors
    return true;
  }
  
  // Format error for user display
  private formatUserError(error: Error | null): string {
    if (!error) {
      return 'Unknown error occurred';
    }
    
    if (error instanceof TimeoutError) {
      return 'Analysis is taking longer than expected. Please try again.';
    }
    
    if (error instanceof HttpError) {
      if (error.status >= 500) {
        return 'Server error. Please try again later.';
      }
      if (error.status === 404) {
        return 'Video not found or unavailable.';
      }
      if (error.status === 400) {
        return 'This video cannot be analyzed. It may not have a transcript available.';
      }
      return 'Request failed. Please try again.';
    }
    
    if (error instanceof ValidationError) {
      return 'Received invalid data from server. Please try again.';
    }
    
    if (error.message.includes('fetch')) {
      return 'Cannot connect to Perspective Prism. Check your backend URL in settings.';
    }
    
    return 'An error occurred. Please try again.';
  }
  
  // Log metrics for monitoring
  private logMetrics(metrics: RequestMetrics): void {
    console.log('[PerspectivePrismClient]', metrics);
    
    // Store metrics in chrome.storage.local for monitoring
    chrome.storage.local.get('api_metrics', (result) => {
      const existing = result.api_metrics || [];
      existing.push(metrics);
      
      // Keep only last 100 metrics
      const trimmed = existing.slice(-100);
      
      chrome.storage.local.set({ api_metrics: trimmed });
    });
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Validate video ID format (YouTube IDs are exactly 11 characters)
  private isValidVideoId(id: string): boolean {
    const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
    return videoIdRegex.test(id);
  }
  
  // Build full YouTube URL from video ID (API contract requirement)
  private buildVideoUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  /**
   * Sanitize analysis text for display
   * 
   * Strategy:
   * 1. Escape all HTML special characters to prevent XSS
   * 2. Enforce textContent usage over innerHTML where possible
   * 3. If HTML formatting is absolutely required, use DOMPurify
   * 
   * @param text - Raw text from analysis result
   * @returns Sanitized text safe for display
   */
  private sanitizeAnalysisText(text: string): string {
    if (!text) return '';
    
    // Basic HTML escaping
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  // Get pending request count (for monitoring)
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }
}

// Custom error classes
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

    this.name = 'ValidationError';
  }
}

/**
 * Shared Messaging Utility
 * 
 * Provides robust message passing between content scripts and background service worker.
 * Handles connection failures, timeouts, and retries with exponential backoff.
 */
async function sendMessageWithRetry(message: any): Promise<any> {
  const MAX_ATTEMPTS = 4;
  const BACKOFF_DELAYS = [0, 500, 1000, 2000]; // ms
  
  let lastError: any;
  
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          // Check for runtime errors (e.g., receiver not found)
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          // Check for explicit error response from background
          if (response && response.error) {
            // Treat fatal/auth errors as non-retriable
            if (response.error.code === 'AUTH_ERROR' || response.error.fatal) {
              reject(new Error(response.error.message)); // Immediate failure
              return;
            }
            reject(new Error(response.error.message));
            return;
          }
          
          resolve(response);
        });
      });
    } catch (error: any) {
      lastError = error;
      
      // Stop retrying if error is non-retriable (e.g., fatal)
      if (error.message.includes('AUTH_ERROR') || error.message.includes('fatal')) {
        break;
      }
      
      // Wait before retry (if not last attempt)
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, BACKOFF_DELAYS[attempt]));
      }
    }
  }
  
  // Final failure: Surface clear error for UI
  throw new Error(`Communication error: ${lastError?.message || 'Unknown error'}. Please reload the page.`);
}

// Result types
interface AnalysisResult {
  success: boolean;
  data?: AnalysisData;
  error?: string;
  videoId: string;
}

interface RequestMetrics {
  videoId: string;
  success: boolean;
  error?: string;
  attempt?: number;
  attempts?: number;
  timestamp: number;
}

// Cache manager with statistics tracking
class CacheManager {
  private readonly CACHE_KEY_PREFIX = 'cache_';
  private readonly METADATA_KEY = 'cache_metadata';
  private cacheDuration: number; // hours
  
  constructor(cacheDuration: number = 24) {
    this.cacheDuration = cacheDuration;
  }
  
  // Get cached analysis data
  async get(videoId: string): Promise<AnalysisData | null> {
    const key = this.CACHE_KEY_PREFIX + videoId;
    
    try {
      const result = await chrome.storage.local.get(key);
      const entry: CacheEntry | undefined = result[key];
      
      if (!entry) {
        return null;
      }
      
      // Check if expired
      if (this.isExpired(entry)) {
        await this.remove(videoId);
        return null;
      }
      
      return entry.data;
      
    } catch (error) {
      console.error(`Failed to get cache for ${videoId}:`, error);
      return null;
    }
  }
  
  /**
   * Set cached analysis data with validation
   * 
   * Validates data structure before caching to ensure integrity.
   * Invalid data is rejected and not written to cache.
   * 
   * @param videoId - YouTube video ID
   * @param data - Analysis data to cache (must be valid AnalysisData)
   * @throws Error if data validation fails
   */
  async set(videoId: string, data: AnalysisData): Promise<void> {
    // Validate data before caching
    if (!this.validateDataForCache(data, videoId)) {
      throw new Error(`Invalid data structure for video ${videoId}, refusing to cache`);
    }
    
    const key = this.CACHE_KEY_PREFIX + videoId;
    const now = Date.now();
    const expiresAt = now + (this.cacheDuration * 60 * 60 * 1000);
    
    const entry: CacheEntry = {
      videoId,
      data,
      timestamp: now,
      expiresAt
    };
    
    try {
      await chrome.storage.local.set({ [key]: entry });
      await this.updateMetadata(1, this.estimateSize(entry));
      
    } catch (error) {
      console.error(`Failed to set cache for ${videoId}:`, error);
      
      // If quota exceeded, clear expired entries and retry
      if (error instanceof Error && error.message.includes('QUOTA')) {
        await this.clearExpired();
        await chrome.storage.local.set({ [key]: entry });
      }
    }
  }
  
  /**
   * Validate data structure before caching
   * 
   * Performs basic validation to ensure data integrity.
   * This is a secondary validation layer (primary validation happens in API client).
   * 
   * @param data - Data to validate
   * @param videoId - Expected video ID
   * @returns true if valid, false otherwise
   */
  private validateDataForCache(data: AnalysisData, videoId: string): boolean {
    try {
      // Check basic structure
      if (!data || typeof data !== 'object') {
        console.error('Cache validation failed: data is not an object');
        return false;
      }
      
      // Verify video_id matches
      if (data.video_id !== videoId) {
        console.error(`Cache validation failed: video_id mismatch (expected ${videoId}, got ${data.video_id})`);
        return false;
      }
      
      // Verify claims array exists
      if (!Array.isArray(data.claims)) {
        console.error('Cache validation failed: claims is not an array');
        return false;
      }
      
      // Verify each claim has required fields
      for (const claim of data.claims) {
        if (!claim.claim_text || !claim.truth_profile) {
          console.error('Cache validation failed: claim missing required fields');
          return false;
        }
      }
      
      return true;
      
    } catch (error) {
      console.error('Cache validation error:', error);
      return false;
    }
  }
  
  // Clear all cached data
  async clear(): Promise<void> {
    try {
      const allKeys = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(allKeys).filter(key => 
        key.startsWith(this.CACHE_KEY_PREFIX)
      );
      
      await chrome.storage.local.remove(cacheKeys);
      await this.resetMetadata();
      
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
  
  // Clear expired cache entries
  async clearExpired(): Promise<void> {
    try {
      const allKeys = await chrome.storage.local.get(null);
      const expiredKeys: string[] = [];
      let removedCount = 0;
      let removedSize = 0;
      
      for (const [key, value] of Object.entries(allKeys)) {
        if (key.startsWith(this.CACHE_KEY_PREFIX)) {
          const entry = value as CacheEntry;
          if (this.isExpired(entry)) {
            expiredKeys.push(key);
            removedCount++;
            removedSize += this.estimateSize(entry);
          }
        }
      }
      
      if (expiredKeys.length > 0) {
        await chrome.storage.local.remove(expiredKeys);
        await this.updateMetadata(-removedCount, -removedSize);
        console.log(`Cleared ${expiredKeys.length} expired cache entries`);
      }
      
    } catch (error) {
      console.error('Failed to clear expired cache:', error);
    }
  }
  
  // Get cache statistics for popup display
  async getStats(): Promise<CacheStats> {
    try {
      const result = await chrome.storage.local.get(this.METADATA_KEY);
      const metadata = result[this.METADATA_KEY] || {
        totalEntries: 0,
        totalSize: 0,
        lastCleanup: Date.now()
      };
      
      // Verify actual count (metadata might be out of sync)
      const allKeys = await chrome.storage.local.get(null);
      const actualCount = Object.keys(allKeys).filter(key => 
        key.startsWith(this.CACHE_KEY_PREFIX)
      ).length;
      
      return {
        totalEntries: actualCount,
        totalSize: metadata.totalSize,
        totalSizeMB: (metadata.totalSize / (1024 * 1024)).toFixed(2),
        lastCleanup: metadata.lastCleanup,
        cacheDuration: this.cacheDuration
      };
      
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
        totalSizeMB: '0.00',
        lastCleanup: Date.now(),
        cacheDuration: this.cacheDuration
      };
    }
  }
  
  // Remove specific cache entry
  private async remove(videoId: string): Promise<void> {
    const key = this.CACHE_KEY_PREFIX + videoId;
    
    try {
      const result = await chrome.storage.local.get(key);
      const entry: CacheEntry | undefined = result[key];
      
      if (entry) {
        await chrome.storage.local.remove(key);
        await this.updateMetadata(-1, -this.estimateSize(entry));
      }
      
    } catch (error) {
      console.error(`Failed to remove cache for ${videoId}:`, error);
    }
  }
  
  // Check if cache entry is expired
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }
  
  // Estimate size of cache entry in bytes
  private estimateSize(entry: CacheEntry): number {
    // Rough estimate: JSON string length * 2 (for UTF-16)
    return JSON.stringify(entry).length * 2;
  }
  
  // Update cache metadata
  private async updateMetadata(entryDelta: number, sizeDelta: number): Promise<void> {
    try {
      const result = await chrome.storage.local.get(this.METADATA_KEY);
      const metadata = result[this.METADATA_KEY] || {
        totalEntries: 0,
        totalSize: 0,
        lastCleanup: Date.now()
      };
      
      metadata.totalEntries = Math.max(0, metadata.totalEntries + entryDelta);
      metadata.totalSize = Math.max(0, metadata.totalSize + sizeDelta);
      
      await chrome.storage.local.set({ [this.METADATA_KEY]: metadata });
      
    } catch (error) {
      console.error('Failed to update cache metadata:', error);
    }
  }
  
  // Reset cache metadata
  private async resetMetadata(): Promise<void> {
    await chrome.storage.local.set({
      [this.METADATA_KEY]: {
        totalEntries: 0,
        totalSize: 0,
        lastCleanup: Date.now()
      }
    });
  }
  
  // Update cache duration
  setCacheDuration(hours: number): void {
    this.cacheDuration = hours;
  }
}

// Cache statistics interface
interface CacheStats {
  totalEntries: number;
  totalSize: number;
  totalSizeMB: string;
  lastCleanup: number;
  cacheDuration: number;
}
```

**API Communication:**
- Endpoint: `POST {backendUrl}/analyze`
- Request body: `{ "video_url": "https://www.youtube.com/watch?v={videoId}" }`
- Timeout: 120 seconds
- Retry logic: 2 retries with exponential backoff (2s, 4s)

**Caching Strategy:**
- Use `chrome.storage.local` for cache (unlimited storage)
- Key format: `cache_${videoId}`
- TTL: 24 hours (configurable)
- Automatic cleanup of expired entries on extension startup

### 4. Popup UI (popup.html, popup.js)

**Purpose:** Provides quick access to extension status and actions.

**Features:**
- Display current video analysis status
- Quick link to settings
- Cache statistics (number of cached videos)
- Clear cache button

**UI States:**

1. **Not on YouTube Video Page:**
   ```
   ┌─────────────────────────────────┐
   │  Perspective Prism              │
   │                                 │
   │  ℹ️ Navigate to a YouTube video │
   │     to analyze                  │
   │                                 │
   │  Cache: 15 videos (2.3 MB)     │
   │                                 │
   │  [Open Settings]                │
   │  [Clear Cache]                  │
   └─────────────────────────────────┘
   ```

2. **On YouTube Video - Idle:**
   ```
   ┌─────────────────────────────────┐
   │  Perspective Prism              │
   │                                 │
   │  ✓ Ready to analyze             │
   │  Video: dQw4w9WgXcQ             │
   │                                 │
   │  Cache: 15 videos (2.3 MB)     │
   │                                 │
   │  [Open Settings]                │
   │  [Clear Cache]                  │
   └─────────────────────────────────┘
   ```

3. **Analysis in Progress:**
   ```
   ┌─────────────────────────────────┐
   │  Perspective Prism              │
   │                                 │
   │  ⏳ Analyzing video...           │
   │  [████████░░] 80%               │
   │                                 │
   │  Cache: 15 videos (2.3 MB)     │
   │                                 │
   │  [Open Settings]                │
   │  [Clear Cache] (disabled)       │
   └─────────────────────────────────┘
   ```

4. **Analysis Complete (Fresh):**
   ```
   ┌─────────────────────────────────┐
   │  Perspective Prism              │
   │                                 │
   │  ✓ Analysis complete            │
   │  Found 3 claims                 │
   │  (Just analyzed)                │
   │                                 │
   │  Cache: 16 videos (2.5 MB)     │
   │                                 │
   │  [Open Settings]                │
   │  [Clear Cache]                  │
   └─────────────────────────────────┘
   ```

5. **Analysis Complete (Cached):**
   ```
   ┌─────────────────────────────────┐
   │  Perspective Prism              │
   │                                 │
   │  ✓ Showing cached results       │
   │  Found 3 claims                 │
   │  (Analyzed 2 hours ago)         │
   │                                 │
   │  Cache: 16 videos (2.5 MB)     │
   │                                 │
   │  [Open Settings]                │
   │  [Clear Cache]                  │
   └─────────────────────────────────┘
   ```

6. **Error State:**
   ```
   ┌─────────────────────────────────┐
   │  Perspective Prism              │
   │                                 │
   │  ⚠️ Analysis failed              │
   │  Cannot connect to backend.     │
   │  Check settings.                │
   │                                 │
   │  Cache: 15 videos (2.3 MB)     │
   │                                 │
   │  [Open Settings]                │
   │  [Clear Cache]                  │
   └─────────────────────────────────┘
   ```

7. **Not Configured:**
   ```
   ┌─────────────────────────────────┐
   │  Perspective Prism              │
   │                                 │
   │  ⚙️ Setup required               │
   │  Configure backend URL to       │
   │  start analyzing videos.        │
   │                                 │
   │  [Open Settings]                │
   └─────────────────────────────────┘
   ```

**Accessibility:**
- Tab order: Status info → Open Settings → Clear Cache
- Enter/Space activates buttons
- Clear Cache button has `aria-label="Clear all cached analysis results"`
- Status messages use `role="status"` with `aria-live="polite"`
- Progress bar has `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Disabled buttons have `aria-disabled="true"` and visual opacity change
- Focus visible indicator on all interactive elements
- Minimum touch target size: 44x44px for buttons

### 5. Options Page (options.html, options.js)

**Purpose:** Configuration interface for extension settings.

**Settings:**
- Backend URL (text input with validation)
- Enable/disable caching (checkbox)
- Cache duration (number input, hours)
- Test connection button

**UI States:**

1. **Initial/Idle State:**
   ```
   ┌─────────────────────────────────────────┐
   │  Perspective Prism Settings             │
   │                                         │
   │  Backend URL: *                         │
   │  [http://localhost:8000____________]    │
   │  [Test Connection]                      │
   │                                         │
   │  Cache Settings:                        │
   │  ☑ Enable caching                       │
   │  Cache duration: [24] hours             │
   │                                         │
   │  [Save Settings]                        │
   └─────────────────────────────────────────┘
   ```

2. **Testing Connection:**
   ```
   ┌─────────────────────────────────────────┐
   │  Perspective Prism Settings             │
   │                                         │
   │  Backend URL: *                         │
   │  [http://localhost:8000____________]    │
   │  [Testing...] (disabled, spinner)       │
   │                                         │
   │  Cache Settings:                        │
   │  ☑ Enable caching                       │
   │  Cache duration: [24] hours             │
   │                                         │
   │  [Save Settings] (disabled)             │
   └─────────────────────────────────────────┘
   ```

3. **Connection Success:**
   ```
   ┌─────────────────────────────────────────┐
   │  Perspective Prism Settings             │
   │                                         │
   │  Backend URL: *                         │
   │  [http://localhost:8000____________]    │
   │  [Test Connection]                      │
   │  ✓ Connected successfully               │
   │                                         │
   │  Cache Settings:                        │
   │  ☑ Enable caching                       │
   │  Cache duration: [24] hours             │
   │                                         │
   │  [Save Settings]                        │
   └─────────────────────────────────────────┘
   ```

4. **Connection Failed:**
   ```
   ┌─────────────────────────────────────────┐
   │  Perspective Prism Settings             │
   │                                         │
   │  Backend URL: *                         │
   │  [http://localhost:8000____________]    │
   │  [Test Connection]                      │
   │  ⚠️ Connection failed: Cannot reach     │
   │     server. Check URL and try again.    │
   │                                         │
   │  Cache Settings:                        │
   │  ☑ Enable caching                       │
   │  Cache duration: [24] hours             │
   │                                         │
   │  [Save Settings]                        │
   └─────────────────────────────────────────┘
   ```

5. **Validation Error:**
   ```
   ┌─────────────────────────────────────────┐
   │  Perspective Prism Settings             │
   │                                         │
   │  Backend URL: *                         │
   │  [not-a-valid-url__________________]    │
   │  [Test Connection] (disabled)           │
   │  ⚠️ Invalid URL format                  │
   │                                         │
   │  Cache Settings:                        │
   │  ☑ Enable caching                       │
   │  Cache duration: [24] hours             │
   │                                         │
   │  [Save Settings] (disabled)             │
   └─────────────────────────────────────────┘
   ```

6. **Saving Settings:**
   ```
   ┌─────────────────────────────────────────┐
   │  Perspective Prism Settings             │
   │                                         │
   │  Backend URL: *                         │
   │  [http://localhost:8000____________]    │
   │  [Test Connection] (disabled)           │
   │                                         │
   │  Cache Settings:                        │
   │  ☑ Enable caching                       │
   │  Cache duration: [24] hours             │
   │                                         │
   │  [Saving...] (disabled, spinner)        │
   └─────────────────────────────────────────┘
   ```

7. **Settings Saved:**
   ```
   ┌─────────────────────────────────────────┐
   │  Perspective Prism Settings             │
   │                                         │
   │  Backend URL: *                         │
   │  [http://localhost:8000____________]    │
   │  [Test Connection]                      │
   │  ✓ Settings saved successfully          │
   │                                         │
   │  Cache Settings:                        │
   │  ☑ Enable caching                       │
   │  Cache duration: [24] hours             │
   │                                         │
   │  [Save Settings]                        │
   └─────────────────────────────────────────┘
   ```

**Test Connection Button Behavior:**

- **Endpoint:** `GET {backendUrl}/health` (or `GET {backendUrl}/` if no health endpoint)
- **Timeout:** 10 seconds
- **Success Response:** HTTP 200 with any valid JSON response
- **Success Message:** "✓ Connected successfully"
- **Failure Scenarios:**
  - Network error: "⚠️ Connection failed: Cannot reach server. Check URL and try again."
  - Timeout: "⚠️ Connection failed: Request timed out after 10 seconds."
  - HTTP 4xx/5xx: "⚠️ Connection failed: Server returned error (status {code})."
  - Invalid response: "⚠️ Connection failed: Invalid response from server."
- **Button States:**
  - Idle: Enabled, text "Test Connection"
  - Testing: Disabled, text "Testing...", spinner icon
  - After test: Returns to idle state after 3 seconds (or immediately on user interaction)
- **Retry Behavior:** No automatic retry; user must click button again
- **Keyboard:** Enter key in URL field triggers test connection

**Accessibility:**
- Tab order: Backend URL → Test Connection → Enable caching → Cache duration → Save Settings
- Backend URL field has `aria-label="Backend URL"` and `aria-required="true"`
- Validation errors use `aria-describedby` to link to error message
- Error messages have `role="alert"` for immediate announcement
- Success messages use `role="status"` with `aria-live="polite"`
- Test Connection button has `aria-label="Test connection to backend server"`
- Disabled state uses `aria-disabled="true"` and visual opacity
- Cache duration has `aria-label="Cache duration in hours"` with `min="1"` and `max="168"`
- Form has proper `<label>` elements for all inputs
- Focus visible indicators on all interactive elements
- Color contrast ratio minimum 4.5:1 for text
- Error states use both color and icons (not color alone)

### 6. Analysis Panel Component

**Purpose:** Display analysis results within YouTube interface.

**Visual Design:**
- Fixed position overlay on right side of video player
- Collapsible/expandable
- Scrollable content area
- Close button
- Refresh button for cached results

**UI States:**

1. **Loading State:**
   ```
   ┌─────────────────────────────────────┐
   │  Perspective Prism Analysis    [×]  │
   ├─────────────────────────────────────┤
   │                                     │
   │         ⏳ Analyzing video...        │
   │                                     │
   │     This may take up to 2 minutes   │
   │                                     │
   │         [████████░░] 80%            │
   │                                     │
   └─────────────────────────────────────┘
   ```

2. **Success - Fresh Analysis:**
   ```
   ┌─────────────────────────────────────┐
   │  Perspective Prism Analysis    [×]  │
   ├─────────────────────────────────────┤
   │  Video: {title}                     │
   │  ✓ Just analyzed                    │
   │  [↻ Refresh Analysis]               │
   ├─────────────────────────────────────┤
   │  Claim 1: {claim_text}              │
   │  ├─ Scientific: {assessment}        │
   │  │  Confidence: ████░ 80%           │
   │  │  (80 percent confidence)         │
   │  ├─ Journalistic: {assessment}      │
   │  │  Confidence: ███░░ 60%           │
   │  │  (60 percent confidence)         │
   │  ├─ Bias Indicators:                │
   │  │  • {fallacy}                     │
   │  │  • {manipulation}                │
   │  └─ Overall: {assessment}           │
   │                                     │
   │  Claim 2: ...                       │
   │  ...                                │
   └─────────────────────────────────────┘
   ```

3. **Success - Cached Results:**
   ```
   ┌─────────────────────────────────────┐
   │  Perspective Prism Analysis    [×]  │
   ├─────────────────────────────────────┤
   │  Video: {title}                     │
   │  📦 Cached (2 hours ago)            │
   │  [↻ Refresh Analysis]               │
   ├─────────────────────────────────────┤
   │  Claim 1: {claim_text}              │
   │  ├─ Scientific: {assessment}        │
   │  │  Confidence: ████░ 80%           │
   │  │  (80 percent confidence)         │
   │  ├─ Journalistic: {assessment}      │
   │  │  Confidence: ███░░ 60%           │
   │  │  (60 percent confidence)         │
   │  ├─ Bias Indicators:                │
   │  │  • {fallacy}                     │
   │  │  • {manipulation}                │
   │  └─ Overall: {assessment}           │
   │                                     │
   │  Claim 2: ...                       │
   │  ...                                │
   └─────────────────────────────────────┘
   ```

4. **Empty Results:**
   ```
   ┌─────────────────────────────────────┐
   │  Perspective Prism Analysis    [×]  │
   ├─────────────────────────────────────┤
   │  Video: {title}                     │
   │  ✓ Analysis complete                │
   │  [↻ Refresh Analysis]               │
   ├─────────────────────────────────────┤
   │                                     │
   │     ℹ️ No claims found              │
   │                                     │
   │     This video may not contain      │
   │     factual claims to analyze.      │
   │                                     │
   └─────────────────────────────────────┘
   ```

5. **Error State:**
   ```
   ┌─────────────────────────────────────┐
   │  Perspective Prism Analysis    [×]  │
   ├─────────────────────────────────────┤
   │                                     │
   │     ⚠️ Analysis Failed              │
   │                                     │
   │     Cannot connect to backend.      │
   │     Check your settings.            │
   │                                     │
   │     [Retry Analysis]                │
   │     [Open Settings]                 │
   │                                     │
   └─────────────────────────────────────┘
   ```

6. **Refreshing (from cache):**
   ```
   ┌─────────────────────────────────────┐
   │  Perspective Prism Analysis    [×]  │
   ├─────────────────────────────────────┤
   │  Video: {title}                     │
   │  ⏳ Refreshing analysis...          │
   │  [↻ Refreshing...] (disabled)       │
   ├─────────────────────────────────────┤
   │  [Previous results shown below]     │
   │                                     │
   │  Claim 1: {claim_text}              │
   │  ...                                │
   └─────────────────────────────────────┘
   ```

**Refresh Button Behavior:**

- **Purpose:** Force a new analysis, bypassing cache
- **Action:** 
  1. Sends new analysis request to backend (ignores cache)
  2. Updates cache with fresh results on success
  3. Replaces displayed results with new analysis
- **States:**
  - Idle: Enabled, text "↻ Refresh Analysis", `aria-label="Request fresh analysis, bypassing cache"`
  - Refreshing: Disabled, text "↻ Refreshing...", spinner animation
  - After refresh: Returns to idle state with updated results
- **Keyboard:** Enter/Space activates button
- **Visual Feedback:**
  - Button shows spinner during refresh
  - Previous results remain visible during refresh (not replaced with loading screen)
  - Success: Smooth transition to new results with brief highlight animation
  - Failure: Error message appears above results, previous results remain visible
- **Cache Behavior:**
  - Always bypasses cache and requests fresh analysis
  - Updates cache with new results on success
  - Does not clear cache on failure (keeps old results)

**Styling Approach:**
- Use Shadow DOM for style isolation
- CSS variables for theming
- Responsive design (adapts to different screen sizes)
- Dark mode support (matches YouTube's theme)
- Minimum width: 320px, maximum width: 480px
- Fixed position: right side of viewport, top: 80px
- Z-index: 9999 (above YouTube UI)
- Semi-transparent backdrop when panel is open
- Smooth transitions for state changes (300ms ease-in-out)

**Accessibility:**

- **Keyboard Navigation:**
  - **Escape key:** Closes panel and returns focus to Analysis Button
  - **Tab key:** Cycles through panel controls in order:
    1. Close button
    2. Refresh button
    3. First claim (if results present)
    4. Controls within expanded claim (if expanded)
    5. Next claim, etc.
  - **Arrow Up/Down:** Navigate between claims (when focus is on a claim)
  - **Arrow Right/Left:** Expand/collapse claim details (when focus is on a claim)
  - **Enter/Space:** Activates buttons or toggles claim expansion
  - **Home/End:** Jump to first/last claim
  
- **Focus Management:**
  - When panel opens, focus moves to Close button
  - Focus trapped within panel while open (tab cycles within panel)
  - When panel closes, focus returns to Analysis Button
  - Focus visible indicators on all interactive elements
  - When navigating claims with Arrow keys, focus moves programmatically
  - Expanding a claim does not automatically move focus into nested content
  - Tab from collapsed claim moves to next claim
  - Tab from expanded claim moves into first nested control (perspective, bias indicator)
  
- **ARIA Attributes:**
  
  **Panel Structure:**
  - Panel container: `role="dialog"` `aria-modal="true"` `aria-labelledby="panel-title"`
  - Title: `id="panel-title"` "Perspective Prism Analysis"
  - Close button: `aria-label="Close analysis panel"`
  - Refresh button: `aria-label="Request fresh analysis, bypassing cache"`
  
  **Dynamic Content:**
  - Loading state: `role="status"` `aria-live="polite"` `aria-busy="true"`
  - Error messages: `role="alert"` for immediate announcement
  - Success messages: `role="status"` `aria-live="polite"`
  - Empty state: `role="status"` with descriptive text
  
  **Claims List:**
  - Claims container: `role="region"` `aria-live="assertive"` `aria-label="Analysis results"`
  - Each claim: `role="article"` `aria-label="Claim {X} of {Y}: {first 50 chars of claim text}"`
  - Claim expansion state: `aria-expanded="true|false"` on claim container
  - Claim focus: `tabindex="0"` for first claim, `tabindex="-1"` for others (managed programmatically)
  - Claim count announcement: `aria-describedby` pointing to hidden element with "Found {N} claims"
  
  **Claim Details:**
  - Confidence bars: `role="img"` with `aria-label="80 percent confidence"`
  - Perspective sections: `role="region"` `aria-label="{Perspective name} analysis"`
  - Bias indicators list: `role="list"` with `role="listitem"` for each indicator
  - Supporting evidence: `role="list"` with `role="listitem"` for each evidence item
  
- **Screen Reader Support:**
  
  **Announcements:**
  - Confidence percentages: "80 percent confidence" (not just visual bar)
  - Claim numbers: "Claim 1 of 3" (announced when focus moves to claim)
  - Timestamps: "Analyzed 2 hours ago" (relative format)
  - State changes: "Analysis complete, found 3 claims", "Refreshing analysis"
  - Error messages: Announced immediately with `role="alert"`
  - Incremental results: When claims are added dynamically, `aria-live="assertive"` announces "Claim {N} added"
  
  **Navigation Feedback:**
  - Moving between claims: "Claim 2 of 3: {claim text}"
  - Expanding claim: "Expanded, showing {N} perspectives and bias indicators"
  - Collapsing claim: "Collapsed"
  - Reaching first/last claim: "First claim" / "Last claim"
  
  **Content Description:**
  - Each claim includes full text read by screen reader
  - Perspectives read as: "{Perspective name}: {assessment}, {confidence} percent confidence, {N} supporting evidence items"
  - Bias indicators read as: "Logical fallacies: {list}, Emotional manipulation: {list}, Deception score: {score} out of 1"
  - Overall assessment read last: "Overall assessment: {text}"
  
- **Focus Trap and Tab Key Management:**
  
  The Analysis Panel implements a focus trap to keep keyboard focus within the panel:
  
  ```typescript
  /**
   * FocusManager handles Tab key navigation and focus trapping within the panel
   * 
   * Tab Order:
   * 1. Close button
   * 2. Refresh button (if present)
   * 3. First claim
   * 4. Nested controls within expanded claim (perspectives, bias indicators)
   * 5. Next claim
   * 6. ... repeat for all claims
   * 
   * Focus Trap Behavior:
   * - Tab on last focusable element wraps to first element
   * - Shift+Tab on first focusable element wraps to last element
   * - Escape key closes panel and returns focus to trigger button
   * 
   * Expanded Claim Behavior:
   * - When a claim is expanded, Tab moves focus into the first nested control
   * - Nested controls include perspective sections and bias indicator lists
   * - Tab continues through nested controls before moving to next claim
   * - When a claim is collapsed, Tab skips nested controls and moves to next claim
   */
  class FocusManager {
    private panelContainer: HTMLElement;
    private triggerButton: HTMLElement;
    private focusableElements: HTMLElement[] = [];
    
    constructor(panelContainer: HTMLElement, triggerButton: HTMLElement) {
      this.panelContainer = panelContainer;
      this.triggerButton = triggerButton;
      this.setupFocusTrap();
    }
    
    private setupFocusTrap(): void {
      // Handle Tab and Shift+Tab
      this.panelContainer.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          this.handleTab(e);
        } else if (e.key === 'Escape') {
          this.closePanel();
        }
      });
    }
    
    private handleTab(e: KeyboardEvent): void {
      // Get all currently focusable elements (updates dynamically based on expanded claims)
      this.updateFocusableElements();
      
      if (this.focusableElements.length === 0) {
        return;
      }
      
      const currentIndex = this.focusableElements.indexOf(document.activeElement as HTMLElement);
      
      if (e.shiftKey) {
        // Shift+Tab: Move backward
        if (currentIndex <= 0) {
          // At first element, wrap to last
          e.preventDefault();
          this.focusableElements[this.focusableElements.length - 1].focus();
        }
        // Otherwise, let browser handle normal backward tab
      } else {
        // Tab: Move forward
        if (currentIndex === this.focusableElements.length - 1) {
          // At last element, wrap to first
          e.preventDefault();
          this.focusableElements[0].focus();
        }
        // Otherwise, let browser handle normal forward tab
      }
    }
    
    /**
     * Update list of focusable elements based on current panel state
     * 
     * Includes:
     * - Panel control buttons (Close, Refresh)
     * - Claim elements (role="article")
     * - Nested controls within expanded claims (perspectives, bias indicators)
     * 
     * Excludes:
     * - Nested controls within collapsed claims
     * - Hidden or disabled elements
     */
    private updateFocusableElements(): void {
      const selector = [
        'button:not([disabled])',
        'a[href]',
        '[role="article"][tabindex="0"]',
        '[role="article"][aria-expanded="true"] [role="region"]',
        '[role="article"][aria-expanded="true"] [role="list"]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(',');
      
      const elements = Array.from(
        this.panelContainer.querySelectorAll<HTMLElement>(selector)
      );
      
      // Filter out hidden elements
      this.focusableElements = elements.filter(el => {
        return el.offsetParent !== null && // Not hidden via display:none
               !el.hasAttribute('hidden') &&
               el.getAttribute('aria-hidden') !== 'true';
      });
    }
    
    /**
     * Move focus to first focusable element (called when panel opens)
     */
    public focusFirst(): void {
      this.updateFocusableElements();
      if (this.focusableElements.length > 0) {
        this.focusableElements[0].focus();
      }
    }
    
    /**
     * Close panel and return focus to trigger button
     */
    private closePanel(): void {
      // Panel close logic would be implemented here
      // Return focus to the button that opened the panel
      this.triggerButton.focus();
    }
    
    /**
     * Handle claim expansion/collapse to update focusable elements
     * 
     * When a claim is expanded:
     * - Nested controls become focusable
     * - Tab from claim moves into first nested control
     * 
     * When a claim is collapsed:
     * - Nested controls become non-focusable (tabindex="-1")
     * - Tab from claim skips to next claim
     */
    public onClaimExpandedChanged(claim: HTMLElement, expanded: boolean): void {
      const nestedControls = claim.querySelectorAll<HTMLElement>(
        '[role="region"], [role="list"], button, a[href]'
      );
      
      nestedControls.forEach(control => {
        if (expanded) {
          // Make nested controls focusable
          if (!control.hasAttribute('tabindex')) {
            control.setAttribute('tabindex', '0');
          }
        } else {
          // Make nested controls non-focusable
          control.setAttribute('tabindex', '-1');
        }
      });
      
      // Update focusable elements list
      this.updateFocusableElements();
    }
  }
  ```

- **Screen Reader Announcer Setup:**
  
  The Analysis Panel must create static announcer elements during initialization:
  
  ```typescript
  /**
   * Create announcer elements once during panel initialization
   * 
   * Creates two static announcer elements:
   * - Polite announcer (role="status", aria-live="polite") for non-critical updates
   * - Assertive announcer (role="alert", aria-live="assertive") for critical updates
   * 
   * These elements are positioned offscreen and never change their aria-live attribute.
   * 
   * @param panelContainer - The panel element to append announcers to
   * @throws Error if announcers with same IDs already exist
   */
  function createAnnouncers(panelContainer: HTMLElement): void {
    // Check if announcers already exist (prevent duplicates)
    if (document.getElementById('sr-announcer-polite')) {
      console.warn('[createAnnouncers] Polite announcer already exists, skipping creation');
      return;
    }
    if (document.getElementById('sr-announcer-assertive')) {
      console.warn('[createAnnouncers] Assertive announcer already exists, skipping creation');
      return;
    }
    
    // Polite announcer for non-critical updates
    const politeAnnouncer = document.createElement('div');
    politeAnnouncer.id = 'sr-announcer-polite';
    politeAnnouncer.setAttribute('role', 'status');
    politeAnnouncer.setAttribute('aria-live', 'polite');
    politeAnnouncer.setAttribute('aria-atomic', 'true');
    politeAnnouncer.style.position = 'absolute';
    politeAnnouncer.style.left = '-10000px';
    politeAnnouncer.style.width = '1px';
    politeAnnouncer.style.height = '1px';
    politeAnnouncer.style.overflow = 'hidden';
    panelContainer.appendChild(politeAnnouncer);
    
    // Assertive announcer for critical updates
    const assertiveAnnouncer = document.createElement('div');
    assertiveAnnouncer.id = 'sr-announcer-assertive';
    assertiveAnnouncer.setAttribute('role', 'alert');
    assertiveAnnouncer.setAttribute('aria-live', 'assertive');
    assertiveAnnouncer.setAttribute('aria-atomic', 'true');
    assertiveAnnouncer.style.position = 'absolute';
    assertiveAnnouncer.style.left = '-10000px';
    assertiveAnnouncer.style.width = '1px';
    assertiveAnnouncer.style.height = '1px';
    assertiveAnnouncer.style.overflow = 'hidden';
    panelContainer.appendChild(assertiveAnnouncer);
    
    console.log('[createAnnouncers] Screen reader announcers created');
  }
  ```

- **Claim Keyboard Navigation Implementation:**
  
  ```typescript
  class ClaimNavigator {
    private claims: HTMLElement[];
    private currentIndex: number = 0;
    private announcementQueue: Array<{message: string, priority: 'assertive' | 'polite'}> = [];
    private isAnnouncing: boolean = false;
    private focusManager: FocusManager;
    private claimsContainer: HTMLElement;
    private delegatedHandler: ((e: KeyboardEvent) => void) | null = null;
    private mutationObserver: MutationObserver | null = null;
    private announcementTimeouts: Set<number> = new Set();
    
    constructor(claimsContainer: HTMLElement, focusManager: FocusManager) {
      this.claimsContainer = claimsContainer;
      this.focusManager = focusManager;
      this.claims = Array.from(claimsContainer.querySelectorAll('[role="article"]'));
      
      // Validate claims exist
      if (this.claims.length === 0) {
        console.warn('[ClaimNavigator] No claims found in container');
        return;
      }
      
      // Initialize tabindex on claims (one active, rest inactive)
      this.initializeTabindex();
      
      // Set up delegated keyboard handler
      this.setupDelegatedHandler();
      
      // Observe for dynamic claim changes
      this.observeClaimChanges();
    }
    
    /**
     * Initialize tabindex on all claims
     * Ensures exactly one claim has tabindex="0" (focusable) and others have tabindex="-1"
     */
    private initializeTabindex(): void {
      this.claims.forEach((claim, index) => {
        if (!claim) return;
        
        if (index === this.currentIndex) {
          claim.setAttribute('tabindex', '0');
        } else {
          claim.setAttribute('tabindex', '-1');
        }
      });
    }
    
    /**
     * Set up single delegated keyboard handler on container
     * More efficient than per-claim handlers and automatically handles dynamic claims
     */
    private setupDelegatedHandler(): void {
      this.delegatedHandler = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        
        // Only handle events from claim elements
        if (!target || target.getAttribute('role') !== 'article') {
          return;
        }
        
        // Find which claim was the target
        const claimIndex = this.claims.indexOf(target);
        if (claimIndex === -1) {
          return;
        }
        
        // Handle keyboard navigation
        switch(e.key) {
          case 'ArrowDown':
            e.preventDefault();
            this.moveTo(claimIndex + 1);
            break;
            
          case 'ArrowUp':
            e.preventDefault();
            this.moveTo(claimIndex - 1);
            break;
            
          case 'ArrowRight':
            e.preventDefault();
            this.expandClaim(target);
            break;
            
          case 'ArrowLeft':
            e.preventDefault();
            this.collapseClaim(target);
            break;
            
          case 'Home':
            e.preventDefault();
            this.moveTo(0);
            break;
            
          case 'End':
            e.preventDefault();
            this.moveTo(this.claims.length - 1);
            break;
            
          case 'Tab':
            // Tab handling is managed by FocusManager
            // ClaimNavigator just ensures proper tabindex state
            break;
            
          case 'Enter':
          case ' ':
            // Toggle expansion on Enter/Space
            e.preventDefault();
            this.toggleClaim(target);
            break;
        }
      };
      
      // Add single delegated listener to container
      this.claimsContainer.addEventListener('keydown', this.delegatedHandler);
    }
    
    /**
     * Remove delegated keyboard handler
     */
    private removeDelegatedHandler(): void {
      if (this.delegatedHandler) {
        this.claimsContainer.removeEventListener('keydown', this.delegatedHandler);
        this.delegatedHandler = null;
      }
    }
    
    /**
     * Observe claims container for added/removed claims
     * Re-binds handlers when claims change
     */
    private observeClaimChanges(): void {
      this.mutationObserver = new MutationObserver((mutations) => {
        let claimsChanged = false;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            // Check if any added/removed nodes are claims
            const hasClaimChanges = 
              Array.from(mutation.addedNodes).some(node => 
                node instanceof HTMLElement && node.getAttribute('role') === 'article'
              ) ||
              Array.from(mutation.removedNodes).some(node => 
                node instanceof HTMLElement && node.getAttribute('role') === 'article'
              );
            
            if (hasClaimChanges) {
              claimsChanged = true;
              break;
            }
          }
        }
        
        if (claimsChanged) {
          this.refreshClaims();
        }
      });
      
      // Observe claims container for child changes
      this.mutationObserver.observe(this.claimsContainer, {
        childList: true,
        subtree: true
      });
    }
    
    /**
     * Refresh claims list when claims are added or removed
     * Called by MutationObserver
     */
    private refreshClaims(): void {
      // Update claims list
      this.claims = Array.from(this.claimsContainer.querySelectorAll('[role="article"]'));
      
      // Validate new claims
      if (this.claims.length === 0) {
        console.warn('[ClaimNavigator] All claims removed');
        this.currentIndex = 0;
        return;
      }
      
      // Clamp current index to valid range
      this.currentIndex = Math.max(0, Math.min(this.currentIndex, this.claims.length - 1));
      
      // Re-initialize tabindex
      this.initializeTabindex();
      
      console.log(`[ClaimNavigator] Refreshed: ${this.claims.length} claims`);
    }
    
    /**
     * Dispose of all resources and clean up
     * Call this when the panel is closed or destroyed
     * 
     * Cleans up:
     * - Delegated keyboard handler
     * - Mutation observer
     * - Announcement queue and timeouts
     */
    public dispose(): void {
      // Remove delegated handler
      this.removeDelegatedHandler();
      
      // Disconnect mutation observer
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
      
      // Clear all announcement timeouts
      this.announcementTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      this.announcementTimeouts.clear();
      
      // Clear announcement queue
      this.announcementQueue = [];
      this.isAnnouncing = false;
      
      console.log('[ClaimNavigator] Disposed');
    }
    
    private moveTo(index: number): void {
      // Validate claims exist
      if (this.claims.length === 0) {
        return;
      }
      
      // Clamp index to valid range
      index = Math.max(0, Math.min(index, this.claims.length - 1));
      
      // Validate current and target claims exist
      const currentClaim = this.claims[this.currentIndex];
      const targetClaim = this.claims[index];
      
      if (!currentClaim || !targetClaim) {
        console.warn('[ClaimNavigator] Invalid claim element in moveTo');
        return;
      }
      
      // Update tabindex
      currentClaim.setAttribute('tabindex', '-1');
      targetClaim.setAttribute('tabindex', '0');
      
      // Move focus
      targetClaim.focus();
      
      // Combine announcements for sequential navigation
      // Use fallback if aria-label is missing
      const claimText = targetClaim.getAttribute('aria-label') || 
                        `Claim ${index + 1} of ${this.claims.length}`;
      let combinedMessage = claimText;
      
      // Add position feedback to the same announcement
      if (index === 0) {
        combinedMessage += '. First claim';
      } else if (index === this.claims.length - 1) {
        combinedMessage += '. Last claim';
      }
      
      // Announce combined message
      this.announce(combinedMessage, 'assertive');
      
      this.currentIndex = index;
    }
    
    /**
     * Toggle claim expansion state
     */
    private toggleClaim(claim: HTMLElement): void {
      if (!claim) return;
      
      const isExpanded = claim.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        this.collapseClaim(claim);
      } else {
        this.expandClaim(claim);
      }
    }
    
    /**
     * Expand claim and make nested controls focusable
     * 
     * When expanded:
     * - Nested controls (perspectives, bias indicators) become focusable
     * - Tab from claim will move into first nested control
     * - FocusManager updates its focusable elements list
     */
    private expandClaim(claim: HTMLElement): void {
      if (!claim) return;
      
      const isExpanded = claim.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        return; // Already expanded
      }
      
      claim.setAttribute('aria-expanded', 'true');
      const details = claim.querySelector('.claim-details');
      
      if (details) {
        details.classList.remove('hidden');
        
        // Count perspectives and indicators (defensive)
        const perspectiveCount = details.querySelectorAll('[role="region"]').length || 0;
        this.announce(`Expanded, showing ${perspectiveCount} perspectives and bias indicators`, 'polite');
      } else {
        console.warn('[ClaimNavigator] No .claim-details found in claim');
        this.announce('Expanded', 'polite');
      }
      
      // Notify FocusManager to update focusable elements
      this.focusManager.onClaimExpandedChanged(claim, true);
    }
    
    /**
     * Collapse claim and make nested controls non-focusable
     * 
     * When collapsed:
     * - Nested controls become non-focusable (tabindex="-1")
     * - Tab from claim skips to next claim
     * - FocusManager updates its focusable elements list
     * - If focus is on a nested element, restore focus to claim or next logical item
     */
    private collapseClaim(claim: HTMLElement): void {
      if (!claim) return;
      
      const isExpanded = claim.getAttribute('aria-expanded') === 'true';
      if (!isExpanded) {
        return; // Already collapsed
      }
      
      claim.setAttribute('aria-expanded', 'false');
      const details = claim.querySelector('.claim-details');
      
      if (details) {
        details.classList.add('hidden');
      }
      
      // Restore focus if it was inside the collapsed content
      const activeElement = document.activeElement;
      if (activeElement && details?.contains(activeElement)) {
        // Find the claim index
        const claimIndex = this.claims.indexOf(claim);
        
        if (claimIndex !== -1) {
          // Move focus to the claim itself
          claim.focus();
          this.currentIndex = claimIndex;
          
          // Update tabindex
          this.claims.forEach((c, i) => {
            if (c) {
              c.setAttribute('tabindex', i === claimIndex ? '0' : '-1');
            }
          });
        } else {
          // Fallback: just focus the claim
          claim.focus();
        }
      }
      
      // Notify FocusManager to update focusable elements
      this.focusManager.onClaimExpandedChanged(claim, false);
      
      this.announce('Collapsed', 'polite');
    }
    
    /**
     * Announce message to screen reader with queuing to prevent lost announcements
     * 
     * Uses separate static announcer elements for polite and assertive priorities.
     * Queues messages to prevent overwriting announcements in progress.
     * 
     * If announcer elements don't exist, logs a warning and skips announcement.
     * This prevents silent failures if panel initialization is incomplete.
     * 
     * @param message - Text to announce
     * @param priority - 'assertive' for critical updates, 'polite' for non-critical
     */
    private announce(message: string, priority: 'assertive' | 'polite' = 'assertive'): void {
      // Validate message
      if (!message || message.trim().length === 0) {
        return;
      }
      
      // Add to queue
      this.announcementQueue.push({ message, priority });
      
      // Process queue if not already processing
      if (!this.isAnnouncing) {
        this.processAnnouncementQueue();
      }
    }
    
    private async processAnnouncementQueue(): Promise<void> {
      if (this.announcementQueue.length === 0) {
        this.isAnnouncing = false;
        return;
      }
      
      this.isAnnouncing = true;
      const { message, priority } = this.announcementQueue.shift()!;
      
      // Get appropriate announcer element (static, never changes aria-live)
      const announcerId = priority === 'assertive' 
        ? 'sr-announcer-assertive' 
        : 'sr-announcer-polite';
      const announcer = document.getElementById(announcerId);
      
      if (!announcer) {
        // Announcer element doesn't exist - log warning
        console.warn(
          `[ClaimNavigator] Announcer element '${announcerId}' not found. ` +
          `Ensure createAnnouncers() was called during panel initialization.`
        );
        
        // Continue processing queue (don't block on missing element)
        this.processAnnouncementQueue();
        return;
      }
      
      // Set message
      announcer.textContent = message;
      
      // Wait for announcement to be read (longer for assertive)
      const delay = priority === 'assertive' ? 1500 : 1000;
      
      // Create managed timeout that can be cancelled in dispose()
      const timeoutId = window.setTimeout(() => {
        // Clear only if message hasn't changed (prevents clearing queued message)
        if (announcer.textContent === message) {
          announcer.textContent = '';
        }
        
        // Remove from tracked timeouts
        this.announcementTimeouts.delete(timeoutId);
        
        // Process next announcement
        this.processAnnouncementQueue();
      }, delay);
      
      // Track timeout for cleanup
      this.announcementTimeouts.add(timeoutId);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Clear only if message hasn't changed (prevents clearing queued message)
      if (announcer.textContent === message) {
        announcer.textContent = '';
      }
      
      // Process next announcement
      this.processAnnouncementQueue();
    }
  }
  ```

- **Panel Initialization and Component Integration:**
  
  ```typescript
  /**
   * Initialize Analysis Panel with all accessibility components
   * 
   * This function sets up:
   * - Static announcer elements for screen reader feedback
   * - FocusManager for Tab key handling and focus trap
   * - ClaimNavigator for Arrow key navigation
   * 
   * @param panelContainer - The panel dialog element
   * @param triggerButton - The button that opened the panel (for focus return)
   * @returns Cleanup function to call when panel is closed
   */
  function initializeAnalysisPanel(
    panelContainer: HTMLElement, 
    triggerButton: HTMLElement
  ): () => void {
    // Create screen reader announcers
    createAnnouncers(panelContainer);
    
    // Initialize focus manager
    const focusManager = new FocusManager(panelContainer, triggerButton);
    
    // Move focus to first element (Close button)
    focusManager.focusFirst();
    
    // Initialize claim navigator (if claims are present)
    let claimNavigator: ClaimNavigator | null = null;
    const claimsContainer = panelContainer.querySelector('[role="region"][aria-label="Analysis results"]');
    if (claimsContainer) {
      claimNavigator = new ClaimNavigator(
        claimsContainer as HTMLElement, 
        focusManager
      );
    }
    
    // Return cleanup function
    return () => {
      // Clean up claim navigator
      if (claimNavigator) {
        claimNavigator.dispose();
      }
      
      // Clean up focus manager (if it has a dispose method)
      // focusManager.dispose();
      
      // Remove announcer elements
      document.getElementById('sr-announcer-polite')?.remove();
      document.getElementById('sr-announcer-assertive')?.remove();
      
      console.log('[AnalysisPanel] Cleaned up');
    };
  }
  
  /**
   * Example usage:
   * 
   * // When opening panel
   * const cleanup = initializeAnalysisPanel(panelElement, triggerButton);
   * 
   * // When closing panel
   * cleanup();
   */
  ```
  
  **Tab Key Behavior Summary:**
  
  1. **Panel Controls:** Tab moves through Close button → Refresh button
  2. **First Claim:** Tab moves to first claim (role="article")
  3. **Collapsed Claim:** Tab skips nested content, moves to next claim
  4. **Expanded Claim:** Tab moves into first nested control (perspective section)
  5. **Nested Controls:** Tab cycles through perspectives and bias indicators
  6. **Next Claim:** After last nested control, Tab moves to next claim
  7. **Last Element:** Tab on last focusable element wraps to first (Close button)
  8. **Shift+Tab:** Reverses the order, wraps from first to last
  
  **Arrow Key Behavior Summary:**
  
  1. **Arrow Up/Down:** Navigate between claims (focus moves programmatically)
  2. **Arrow Right:** Expand claim (makes nested controls focusable)
  3. **Arrow Left:** Collapse claim (makes nested controls non-focusable)
  4. **Home/End:** Jump to first/last claim
  5. **Arrow keys work only when focus is on a claim element**
  
- **Visual Accessibility:**
  - Color contrast ratio minimum 4.5:1 for text
  - Error/success states use both color and icons
  - Focus indicators visible with 2px outline
  - Minimum touch target size: 44x44px for buttons
  - Text size minimum 14px, line height 1.5
  - Confidence bars include percentage text (not color alone)
  - Expanded/collapsed state indicated by icon rotation (chevron) and text label

## States & Accessibility Summary

### UI State Management

All components implement a consistent state machine pattern:

**Common States:**
- **Idle:** Default state, all controls enabled
- **Loading/Processing:** Async operation in progress, controls disabled, spinner shown
- **Success:** Operation completed successfully, confirmation message shown
- **Error:** Operation failed, error message with recovery actions shown
- **Disabled:** Control unavailable (e.g., not configured, invalid input)

**State Transitions:**
- All state changes provide visual and non-visual feedback
- Loading states show progress indicators (spinner or progress bar)
- Success states show confirmation for 3 seconds before returning to idle
- Error states persist until user takes action (retry, dismiss, or fix issue)
- State changes announced to screen readers via ARIA live regions

### Keyboard Interactions

**Global:**
- Tab: Navigate forward through interactive elements
- Shift+Tab: Navigate backward through interactive elements
- Enter/Space: Activate buttons and controls
- Escape: Close dialogs/panels and return focus

**Analysis Panel Specific:**
- Escape: Close panel, return focus to Analysis Button
- Arrow keys: Scroll content area
- Tab: Cycle through panel controls (focus trapped)

**Options Page Specific:**
- Enter in URL field: Trigger Test Connection
- Tab order: URL → Test → Cache checkbox → Duration → Save

### ARIA Attributes Reference

**Dialogs/Panels:**
- `role="dialog"` with `aria-modal="true"`
- `aria-labelledby` pointing to title element
- `aria-describedby` for additional context

**Buttons:**
- `aria-label` for icon-only buttons
- `aria-disabled="true"` for disabled state (not just `disabled` attribute)
- `aria-pressed` for toggle buttons

**Status Messages:**
- `role="status"` with `aria-live="polite"` for non-critical updates
- `role="alert"` for critical errors requiring immediate attention
- `aria-busy="true"` during loading states

**Form Controls:**
- `aria-required="true"` for required fields
- `aria-invalid="true"` for validation errors
- `aria-describedby` linking to error messages
- Proper `<label>` elements for all inputs

**Progress Indicators:**
- `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Text alternative for percentage (e.g., "80 percent")

**Custom Visualizations:**
- `role="img"` with descriptive `aria-label`
- Text alternatives for confidence bars, icons, and visual indicators

### Focus Management

**Focus Trapping:**
- Analysis Panel traps focus while open
- Tab cycles through panel controls only
- Escape releases focus trap and returns to trigger element

**Focus Return:**
- Closing panel returns focus to Analysis Button
- Closing popup returns focus to browser chrome
- Form submission returns focus to first field or success message

**Focus Indicators:**
- Visible focus outline: 2px solid, high contrast color
- Minimum contrast ratio: 3:1 against background
- Never remove focus indicators (`:focus-visible` for mouse users)

### Screen Reader Behaviors

**Announcements:**
- State changes announced via `aria-live` regions
- Loading states: "Analyzing video, please wait"
- Success states: "Analysis complete, found 3 claims"
- Error states: "Analysis failed, cannot connect to backend"
- Cache indicators: "Showing cached results from 2 hours ago"

**Navigation:**
- Landmark roles for major sections (`main`, `navigation`, `complementary`)
- Heading hierarchy (h1 → h2 → h3) for structure
- Skip links for repetitive content (if applicable)

**Content Description:**
- Confidence percentages: "80 percent confidence" (not just visual bar)
- Timestamps: "Analyzed 2 hours ago" (relative format)
- Claim counts: "Claim 1 of 3"
- Empty states: Descriptive text explaining why no results

### Visual Accessibility

**Color Contrast:**
- Text: Minimum 4.5:1 ratio (WCAG AA)
- Large text (18pt+): Minimum 3:1 ratio
- UI components: Minimum 3:1 ratio
- Focus indicators: Minimum 3:1 ratio

**Color Independence:**
- Never use color alone to convey information
- Error states: Red color + icon + text
- Success states: Green color + icon + text
- Loading states: Animation + text + progress indicator

**Touch Targets:**
- Minimum size: 44x44px (WCAG AAA)
- Adequate spacing between targets (8px minimum)
- Larger targets for primary actions

**Text Sizing:**
- Minimum font size: 14px
- Line height: 1.5 for body text
- Paragraph spacing: 1.5x line height
- Supports browser zoom up to 200%

## Data Models

### Storage Schema

**chrome.storage.sync (Configuration):**
```typescript
{
  "config": {
    "backendUrl": "http://localhost:8000",
    "cacheEnabled": true,
    "cacheDuration": 24
  }
}
```

**chrome.storage.local (Cache):**
```typescript
{
  "cache_dQw4w9WgXcQ": {
    "videoId": "dQw4w9WgXcQ",
    "data": { /* AnalysisData */ },
    "timestamp": 1700000000000,
    "expiresAt": 1700086400000
  },
  "cache_metadata": {
    "totalEntries": 15,
    "lastCleanup": 1700000000000
  }
}
```

## Error Handling

### Error Categories and Recovery Policies

1. **Configuration Errors**
   - **Missing backend URL:**
     - Action: Show setup notification with "Open Settings" button
     - Recovery: User must configure backend URL
     - Retry: N/A (requires user action)
   
   - **Invalid backend URL format:**
     - Action: Show validation error in settings page
     - Recovery: User must correct URL format
     - Retry: N/A (requires user action)

2. **Network Errors**
   
   - **Backend unreachable (ECONNREFUSED, DNS failure):**
     - Message: "Cannot connect to Perspective Prism. [Open Settings]"
     - UI: Error message with clickable "Open Settings" link/button
     - Retry Policy: No automatic retry (likely configuration issue)
     - Recovery: User clicks "Open Settings" to verify/update backend URL
   
   - **Timeout (>120s):**
     - Message: "Analysis is taking longer than expected. Please try again."
     - Retry Policy: Automatic retry with exponential backoff
       - Attempt 1: Immediate
       - Attempt 2: After 2 seconds
       - Attempt 3: After 4 seconds
       - After 3 attempts: Show manual "Retry" button
     - Max Attempts: 3 automatic + unlimited manual
     - Recovery: User clicks "Retry" button or waits for auto-retry
   
   - **HTTP 5xx (Server Error):**
     - Message: "Server error. Please try again later."
     - Retry Policy: Automatic retry with exponential backoff
       - Attempt 1: Immediate
       - Attempt 2: After 2 seconds
       - Max Attempts: 2 automatic + unlimited manual
     - Recovery: Show "Retry" button after automatic attempts exhausted
   
   - **HTTP 4xx (Client Error):**
     - 400: "This video cannot be analyzed. It may not have a transcript available."
     - 404: "Video not found or unavailable."
     - 429: "Rate limit exceeded. Please wait a moment and try again."
     - Other 4xx: "Invalid request. Please try again or contact support."
     - Retry Policy: No automatic retry (client error, retry won't help)
     - Recovery: Show error message with manual "Retry" button (for user to fix issue)

3. **Content Errors**
   
   - **No transcript available:**
     - Message: "This video doesn't have a transcript available for analysis."
     - Retry Policy: No retry
     - Recovery: Inform user, no action available
   
   - **Video not found:**
     - Message: "Video not found or unavailable."
     - Retry Policy: No retry
     - Recovery: Inform user, no action available
   
   - **Empty analysis (no claims found):**
     - Message: "No claims found. This video may not contain factual claims to analyze."
     - Retry Policy: No retry (valid result)
     - Recovery: Show empty state, offer "Refresh" to re-analyze

4. **Extension Errors**
   
   - **Storage quota exceeded:**
     - Action: Automatically clear expired cache entries
     - If still over quota: Evict oldest entries (LRU)
     - If still over quota: Show error "Storage full. Please clear cache in settings."
     - Recovery: Automatic cleanup, then manual cache clear if needed
     - Monitoring: Track usage, warn at 80% of quota
   
   - **Message passing failure (content script ↔ background):**
     - Retry Policy: Exponential backoff
       - Attempt 1: Immediate
       - Attempt 2: After 500ms
       - Attempt 3: After 1000ms
       - Attempt 4: After 2000ms
       - Max Attempts: 4
     - After exhaustion: Show error message
       - "Communication error. Please reload the page or restart the extension."
       - Include "Reload Page" button and "Report Issue" link
     - Recovery: User reloads page or restarts extension
   
   - **Cache corruption (invalid data structure):**
     - Action: Delete corrupted entry, log error
     - Message: "Cached data was corrupted. Requesting fresh analysis."
     - Retry Policy: Automatic fresh analysis request
     - Recovery: Transparent to user (automatic)

### Error Logging and Privacy

**Logging Boundaries (Privacy Protection):**

All logs must be sanitized to protect user privacy. The following information is **BANNED** from logs:

- ❌ Full backend URLs (may contain tokens, credentials)
- ❌ Full video URLs (may contain tracking parameters)
- ❌ User identifiers (email, username, IP address)
- ❌ Authentication tokens or API keys
- ❌ Video titles or content (may be sensitive)
- ❌ Analysis results content (may be sensitive)

**Allowed Log Data (Sanitized):**

- ✅ Video ID (11-character identifier only)
- ✅ Error codes (HTTP status, error type)
- ✅ Endpoint paths (e.g., `/analyze`, not full URL)
- ✅ Timestamps (ISO 8601 format)
- ✅ Request/response sizes (bytes)
- ✅ Retry attempt numbers
- ✅ Cache hit/miss status
- ✅ Extension version
- ✅ Browser version (from user agent)

**Structured Log Format:**

```typescript
interface SanitizedLogEntry {
  timestamp: string;           // ISO 8601
  level: 'info' | 'warn' | 'error';
  component: string;           // 'content', 'background', 'popup', 'options'
  action: string;              // 'analyze_video', 'cache_hit', 'api_error'
  videoId?: string;            // 11-char ID only
  errorCode?: string;          // 'TIMEOUT', 'HTTP_500', 'NETWORK_ERROR'
  endpointPath?: string;       // '/analyze', '/health'
  attempt?: number;            // Retry attempt number
  duration?: number;           // Operation duration (ms)
  cacheStatus?: 'hit' | 'miss' | 'expired';
  extensionVersion: string;    // From manifest
}
```

**Sanitization Rules:**

```typescript
function sanitizeForLog(data: any): SanitizedLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: data.level,
    component: data.component,
    action: data.action,
    // Extract only video ID from full URL
    videoId: data.videoUrl ? extractVideoId(data.videoUrl) : data.videoId,
    errorCode: data.error?.code || data.errorCode,
    // Extract only path from full URL
    endpointPath: data.url ? new URL(data.url).pathname : undefined,
    attempt: data.attempt,
    duration: data.duration,
    cacheStatus: data.cacheStatus,
    extensionVersion: chrome.runtime.getManifest().version
  };
}

// Example usage
console.log('[PerspectivePrism]', sanitizeForLog({
  level: 'error',
  component: 'background',
  action: 'analyze_video',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
  url: 'http://localhost:8000/analyze?token=secret123',
  error: { code: 'TIMEOUT' },
  attempt: 2
}));
// Output: {
//   timestamp: '2024-01-15T10:30:00.000Z',
//   level: 'error',
//   component: 'background',
//   action: 'analyze_video',
//   videoId: 'dQw4w9WgXcQ',
//   errorCode: 'TIMEOUT',
//   endpointPath: '/analyze',
//   attempt: 2,
//   extensionVersion: '1.0.0'
// }
```

### Cache Versioning and Migration

**Schema Versioning:**

Each cache entry includes a schema version to handle breaking changes in the AnalysisData structure.

```typescript
interface VersionedCacheEntry {
  schemaVersion: number;       // Current: 1
  videoId: string;
  data: AnalysisData;
  timestamp: number;
  expiresAt: number;
}

const CURRENT_SCHEMA_VERSION = 1;
```

**Migration Strategy:**

```typescript
class CacheManager {
  // Get with automatic migration
  async get(videoId: string): Promise<AnalysisData | null> {
    const entry = await this.getRawEntry(videoId);
    
    if (!entry) {
      return null;
    }
    
    // Check schema version
    if (!entry.schemaVersion || entry.schemaVersion < CURRENT_SCHEMA_VERSION) {
      // Attempt migration
      const migrated = await this.migrateEntry(entry);
      
      if (migrated) {
        // Save migrated entry
        await this.set(videoId, migrated.data);
        return migrated.data;
      } else {
        // Migration failed, delete corrupted entry
        await this.remove(videoId);
        console.warn(`Cache migration failed for ${videoId}, entry deleted`);
        return null;
      }
    }
    
    return entry.data;
  }
  
  // Migration hooks for each version
  private async migrateEntry(entry: any): Promise<VersionedCacheEntry | null> {
    try {
      let current = entry;
      
      // Migrate from v0 (no version) to v1
      if (!current.schemaVersion) {
        current = this.migrateV0ToV1(current);
      }
      
      // Future migrations would go here
      // if (current.schemaVersion === 1) {
      //   current = this.migrateV1ToV2(current);
      // }
      
      return current;
      
    } catch (error) {
      console.error('Migration error:', error);
      return null;
    }
  }
  
  private migrateV0ToV1(entry: any): VersionedCacheEntry {
    // Example: Add schemaVersion field
    return {
      schemaVersion: 1,
      videoId: entry.videoId,
      data: entry.data,
      timestamp: entry.timestamp || Date.now(),
      expiresAt: entry.expiresAt || Date.now() + 86400000
    };
  }
}
```

**Breaking Change Policy:**

- **Minor changes** (new optional fields): No version bump, backward compatible
- **Major changes** (required fields, structure changes): Version bump + migration
- **Incompatible changes**: Clear cache, start fresh (last resort)

**Safe Deserialization:**

```typescript
function safeDeserialize(data: string): any | null {
  try {
    const parsed = JSON.parse(data);
    
    // Basic validation
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    
    return parsed;
    
  } catch (error) {
    console.error('Deserialization error:', error);
    return null;
  }
}
```

### Storage Quota Management

**Chrome Storage Limits:**

- `chrome.storage.local`: 10 MB (unlimited with `unlimitedStorage` permission)
- `chrome.storage.sync`: 100 KB total, 8 KB per item
- Recommendation: Use `local` for cache, `sync` for config

**Quota Monitoring:**

```typescript
class QuotaManager {
  private readonly WARNING_THRESHOLD = 0.8;  // 80% of quota
  private readonly CRITICAL_THRESHOLD = 0.95; // 95% of quota
  
  async checkQuota(): Promise<QuotaStatus> {
    const usage = await chrome.storage.local.getBytesInUse();
    const quota = 10 * 1024 * 1024; // 10 MB
    const percentage = usage / quota;
    
    return {
      usage,
      quota,
      percentage,
      status: percentage >= this.CRITICAL_THRESHOLD ? 'critical' :
              percentage >= this.WARNING_THRESHOLD ? 'warning' : 'ok'
    };
  }
  
  async ensureSpace(requiredBytes: number): Promise<boolean> {
    const status = await this.checkQuota();
    
    if (status.usage + requiredBytes > status.quota) {
      // Try to free space
      await this.freeSpace(requiredBytes);
      
      // Check again
      const newStatus = await this.checkQuota();
      return newStatus.usage + requiredBytes <= newStatus.quota;
    }
    
    return true;
  }
  
  private async freeSpace(requiredBytes: number): Promise<void> {
    // Step 1: Clear expired entries
    await cacheManager.clearExpired();
    
    // Step 2: If still not enough, evict oldest entries (LRU)
    const status = await this.checkQuota();
    if (status.usage + requiredBytes > status.quota) {
      await this.evictOldest(requiredBytes);
    }
  }
  
  private async evictOldest(requiredBytes: number): Promise<void> {
    const allEntries = await this.getAllCacheEntries();
    
    // Sort by timestamp (oldest first)
    allEntries.sort((a, b) => a.timestamp - b.timestamp);
    
    let freedBytes = 0;
    for (const entry of allEntries) {
      if (freedBytes >= requiredBytes) {
        break;
      }
      
      await cacheManager.remove(entry.videoId);
      freedBytes += this.estimateSize(entry);
    }
    
    console.log(`Evicted ${allEntries.length} entries, freed ${freedBytes} bytes`);
  }
}

interface QuotaStatus {
  usage: number;
  quota: number;
  percentage: number;
  status: 'ok' | 'warning' | 'critical';
}
```

**Eviction Policy (LRU):**

1. Clear expired entries first
2. If still over quota, evict oldest entries (by timestamp)
3. Keep at least 5 most recent entries (even if over quota)
4. Log eviction events for monitoring

**Quota Warnings:**

- At 80% usage: Log warning, continue normal operation
- At 95% usage: Show notification to user, suggest clearing cache
- At 100% usage: Automatic eviction, show error if eviction fails

**Monitoring Metrics:**

```typescript
interface StorageMetrics {
  totalEntries: number;
  totalBytes: number;
  quotaPercentage: number;
  oldestEntryAge: number;      // milliseconds
  newestEntryAge: number;      // milliseconds
  expiredEntries: number;
  lastEviction?: number;       // timestamp
  evictionCount: number;
}
```

## Testing Strategy

### Unit Tests

**Content Script:**
- Video ID extraction from various URL formats
- Message formatting and parsing
- DOM element creation and injection
- Event handler registration

**Background Service Worker:**
- API client request/response handling
- Cache manager CRUD operations
- Cache expiration logic
- Configuration validation

**Popup/Options:**
- Form validation
- Settings persistence
- UI state management

### Integration Tests

- End-to-end flow: button click → API request → result display
- Cache hit/miss scenarios
- Error handling flows
- Message passing between components

### Manual Testing Checklist

- [ ] Install extension in Chrome
- [ ] Configure backend URL
- [ ] Navigate to YouTube video
- [ ] Click analysis button
- [ ] Verify results display correctly
- [ ] Test with cached video
- [ ] Test error scenarios (invalid URL, no transcript)
- [ ] Test on different YouTube layouts (theater mode, fullscreen)
- [ ] Verify performance (no lag, smooth scrolling)
- [ ] Test cache clearing
- [ ] Test settings persistence across browser restarts

### Browser Compatibility

- Primary target: Chrome 88+ (Manifest V3 support)
- Secondary targets: Edge 88+, Brave (Chromium-based)
- Not supported: Firefox (requires Manifest V2 adaptation)

## Security Considerations

### Content Security Policy

- No inline scripts (use external .js files)
- No eval() or Function() constructors
- Restrict external resource loading

### Input Validation

- Validate backend URL format before saving
- Sanitize video IDs (alphanumeric and hyphens only)
- Validate API responses before caching

### Permissions Justification

- `storage`: Required for configuration and caching
- `activeTab`: Required to interact with YouTube pages
- `host_permissions` for youtube.com: Required to inject content scripts

### Data Privacy

**Data Transmission and Processing:**

The extension transmits user data to analyze YouTube videos. Users must understand and consent to this data flow.

**What Data is Sent:**

1. **Video URL** (Required)
   - Full YouTube video URL including video ID
   - Example: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
   - Purpose: Backend fetches transcript and performs analysis
   - Sent to: User-configured backend server

2. **Video Metadata** (Automatic)
   - Video ID extracted from URL
   - Timestamp of analysis request
   - Purpose: Caching and result correlation
   - Stored: Locally in browser only

3. **Video Transcript** (Fetched by Backend)
   - Full transcript text fetched by backend from YouTube
   - Not sent by extension, but processed by backend
   - Purpose: Claim extraction and analysis
   - Stored: Temporarily on backend during analysis

4. **Analysis Results** (Received)
   - Claims, perspectives, bias indicators
   - Cached locally in browser
   - Purpose: Display to user, avoid re-analysis
   - Stored: Locally in browser (chrome.storage.local)

**Who Controls and Processes Data:**

- **User-Configured Backend:** User controls which server receives data
  - Self-hosted: User has full control over data
  - Third-party hosted: Data sent to third-party server (user's choice)
  - Backend processes video URL, fetches transcript, performs analysis
  - Backend may log requests, store results, or retain data (depends on backend configuration)

- **Extension (Client-Side):**
  - Stores analysis results locally in browser
  - Does not send data to any server except user-configured backend
  - Does not collect analytics or telemetry
  - Does not share data with third parties

- **YouTube:**
  - Backend fetches public transcripts from YouTube
  - YouTube may log transcript requests from backend server
  - Extension does not directly access YouTube API

**Data Retention and Storage:**

- **Local Cache (Browser):**
  - Location: `chrome.storage.local` on user's device
  - Retention: 24 hours (configurable, 1-168 hours)
  - Deletion: Automatic expiration, manual clear in settings
  - Encryption: Browser-level encryption (OS-dependent)

- **Backend Server:**
  - Retention: Depends on backend configuration (user's responsibility)
  - Storage: Determined by backend implementation
  - Deletion: User must contact backend administrator or self-manage
  - Recommendation: Configure backend to not retain data

**Third-Party Access:**

- **No Third Parties by Default:** Extension only communicates with user-configured backend
- **User's Choice:** If user configures third-party backend, that party has access to:
  - Video URLs analyzed
  - Timestamps of analysis
  - Analysis results (if backend stores them)
- **No Analytics Services:** Extension does not use Google Analytics, Sentry, or similar services
- **No Tracking:** Extension does not track user behavior or browsing history

**Transport Security:**

- **HTTPS Required:** Extension enforces HTTPS for all backend URLs except localhost
- **HTTP Allowed:** Only for localhost addresses (127.0.0.1, localhost, ::1) for development
- **URL Validation:** Extension validates and rejects HTTP URLs for non-localhost addresses during configuration
- **Security Warning:** Users attempting to configure HTTP URLs receive clear warning requiring HTTPS
- **No Encryption by Extension:** Extension relies on HTTPS for transport security
- **Certificate Validation:** Browser validates HTTPS certificates automatically
- **Rationale:** Prevents video IDs and analysis results from being transmitted unencrypted over the network

**User Consent Flow with Versioning:**

**First-Time Analysis Prompt:**

```
┌─────────────────────────────────────────────────────┐
│  Perspective Prism - Privacy Notice (v1.0.0)        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Before analyzing videos, please understand:        │
│                                                     │
│  • Video URLs will be sent to your configured       │
│    backend server for analysis                      │
│                                                     │
│  • The backend will fetch video transcripts from    │
│    YouTube and process them                         │
│                                                     │
│  • Analysis results will be cached locally in       │
│    your browser                                     │
│                                                     │
│  • You control which backend server receives        │
│    your data (configure in settings)                │
│                                                     │
│  [Learn More] [Deny] [Allow and Continue]          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Consent Requirements:**

- Shown on first analysis attempt (before any data sent)
- User must explicitly click "Allow and Continue"
- "Deny" prevents analysis and shows settings link
- "Learn More" behavior:
  - Checks `config.privacyPolicyUrl` first
  - If present: Opens external URL in new tab
  - If missing: Opens built-in `privacy.html` in new tab
  - Logs which policy was shown (local vs external)
- Consent stored in `chrome.storage.sync`:
  - `consentGiven`: boolean
  - `consentDate`: timestamp
  - `privacyPolicyVersion`: string (e.g., "1.0.0")
- User can revoke consent in settings

**Privacy Policy Versioning:**

When privacy policy is updated:

```
┌─────────────────────────────────────────────────────┐
│  Privacy Policy Updated                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Our privacy policy has been updated to v1.1.0      │
│                                                     │
│  Key changes:                                       │
│  • Updated data retention policy                    │
│  • Added information about backend logging          │
│                                                     │
│  Please review and accept the updated policy to     │
│  continue using video analysis.                     │
│                                                     │
│  [View Full Policy] [Decline] [Accept]             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- Shown on extension startup if policy version changed
- User must re-consent to continue using analysis
- "Decline" revokes consent (same as manual revocation)
- "Accept" updates consent date and policy version
- Version changes logged for audit trail

**Consent Revocation:**

When user revokes consent in settings:

1. Show confirmation dialog:
   ```
   ┌─────────────────────────────────────────────────────┐
   │  Revoke Consent?                                    │
   ├─────────────────────────────────────────────────────┤
   │                                                     │
   │  This will:                                         │
   │  • Cancel any pending analysis requests             │
   │  • Clear all cached analysis results                │
   │  • Disable video analysis                           │
   │                                                     │
   │  You can re-enable analysis at any time.            │
   │                                                     │
   │  [Cancel] [Revoke Consent]                         │
   │                                                     │
   └─────────────────────────────────────────────────────┘
   ```

2. On confirmation:
   - Cancel all pending requests (abort via AbortController)
   - Clear all cached data from `chrome.storage.local`
   - Clear persisted request state (`pending_request_*` keys)
   - Clear all `chrome.alarms` related to analysis
   - Set `consentGiven` to `false`
   - Log revocation event with timestamp

3. If analysis in progress:
   - Show error: "Analysis cancelled: Consent revoked"
   - Close analysis panel
   - Disable analysis button with tooltip: "Consent required"

**Privacy Policy Link:**

- Accessible from: Extension popup, options page, consent dialog
- Location: `chrome-extension://[id]/privacy.html` or external URL
- Content: Detailed privacy policy covering all data practices
- Includes policy version number at top
- Required for Chrome Web Store submission

**Backend Data Retention Policy:**

Privacy policy must document:
- Backend may log requests for debugging/analytics
- Retention period varies by backend configuration
- User responsibility when using third-party backends
- Recommendation: Configure backend to not retain data
- Instructions for requesting data deletion:
  - Self-hosted: User controls their own data
  - Third-party: Contact backend administrator
  - Template email/request form provided

**Settings Privacy Controls:**

```
┌─────────────────────────────────────────────────────┐
│  Privacy Settings                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ☑ Allow video analysis                            │
│     (Send video URLs to backend for analysis)       │
│     Consented: Jan 15, 2024 (Policy v1.0.0)        │
│                                                     │
│  Backend Server:                                    │
│  [http://localhost:8000____________________]        │
│  ⚠️ Data sent to this server. Ensure you trust it. │
│                                                     │
│  ☑ Cache analysis results locally                  │
│     (Stored in browser for 24 hours)                │
│                                                     │
│  [Clear All Cached Data]                           │
│  [Revoke Consent]                                  │
│  [View Privacy Policy]                             │
│                                                     │
│  Privacy Policy URL (optional):                     │
│  [https://example.com/privacy_____________]         │
│  (Leave empty to use built-in policy)               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Performance Optimization

### Content Script Optimization

- Lazy load Analysis Panel (only create when needed)
- Debounce navigation events (500ms)
- Use event delegation for dynamic content
- Remove event listeners on cleanup

### Background Service Worker Optimization

- Implement request deduplication (prevent multiple requests for same video)
- Use AbortController for request cancellation
- Batch cache cleanup operations
- Terminate idle connections

### Caching Strategy

- Aggressive caching (24-hour TTL)
- Preload cache on extension startup
- Lazy cleanup of expired entries
- Limit cache size (max 100 entries, LRU eviction)

## Deployment and Distribution

### Build Process

1. Bundle JavaScript files (optional, can use plain JS)
2. Minify CSS
3. Optimize images
4. Create .zip package for Chrome Web Store

### Chrome Web Store Submission

- Prepare store listing (description, screenshots, privacy policy)
- Submit for review
- Address any review feedback
- Publish to store

### Version Management

- Semantic versioning (MAJOR.MINOR.PATCH)
- Changelog in repository
- Update manifest.json version on each release

## Future Enhancements

- Support for YouTube Shorts
- Inline annotations on video timeline
- Export analysis results (PDF, JSON)
- Keyboard shortcuts
- Multi-language support
- Firefox compatibility (Manifest V2 version)

---

## Appendix: Data Contract

This appendix documents the complete data flow between the extension and backend for transparency and review purposes.

### API Endpoints

#### 1. Analyze Video

**Endpoint:** `POST /analyze`

**Purpose:** Request analysis of a YouTube video

**Request:**
```json
{
  "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Request Headers:**
```
Content-Type: application/json
User-Agent: PerspectivePrism-Extension/1.0.0
```

**Response (Success - 200 OK):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "claims": [
    {
      "claim_text": "Example claim from video",
      "timestamp": "00:01:23",
      "truth_profile": {
        "perspectives": {
          "scientific": {
            "assessment": "Assessment text",
            "confidence": 0.8,
            "supporting_evidence": ["Evidence 1", "Evidence 2"]
          },
          "journalistic": { /* ... */ },
          "partisan_left": { /* ... */ },
          "partisan_right": { /* ... */ }
        },
        "bias_indicators": {
          "logical_fallacies": ["Fallacy 1", "Fallacy 2"],
          "emotional_manipulation": ["Technique 1"],
          "deception_score": 0.3
        },
        "overall_assessment": "Overall assessment text"
      }
    }
  ],
  "metadata": {
    "analyzed_at": "2024-01-15T10:30:00Z",
    "video_title": "Video Title"
  }
}
```

**Response (Error - 400 Bad Request):**
```json
{
  "error": "No transcript available",
  "detail": "This video does not have a transcript available for analysis."
}
```

**Response (Error - 404 Not Found):**
```json
{
  "error": "Video not found",
  "detail": "The specified video could not be found or is unavailable."
}
```

**Response (Error - 500 Internal Server Error):**
```json
{
  "error": "Analysis failed",
  "detail": "An error occurred during analysis. Please try again later."
}
```

#### 2. Health Check (Optional)

**Endpoint:** `GET /health` or `GET /`

**Purpose:** Verify backend connectivity

**Request:** None (GET request)

**Response (Success - 200 OK):**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

### Data Fields Transmitted

#### Extension → Backend

| Field | Type | Required | Purpose | Example | Sensitive |
|-------|------|----------|---------|---------|-----------|
| video_url | string | Yes | Identify video to analyze | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | No (public URL) |

**Notes:**
- Video URL is the only data sent by extension to backend
- URL may contain public video ID and timestamp parameters
- No user identifiers, cookies, or authentication tokens sent
- No browsing history or other videos sent

#### Backend → Extension

| Field | Type | Required | Purpose | Sensitive |
|-------|------|----------|---------|-----------|
| video_id | string | Yes | Correlate results with request | No |
| claims | array | Yes | Analysis results | No (public video content) |
| metadata | object | No | Additional context | No |

**Notes:**
- All response data is derived from public video content
- No user-specific data in responses
- Results cached locally in browser only

### Encryption and Transport

**Transport Layer:**

- **Protocol:** HTTPS (recommended) or HTTP (localhost only)
- **TLS Version:** TLS 1.2 or higher (when using HTTPS)
- **Certificate Validation:** Browser validates certificates automatically
- **Fallback:** HTTP allowed for `localhost` and `127.0.0.1` only

**Data Encryption:**

- **In Transit:** HTTPS encryption (if configured)
- **At Rest (Browser):** Browser-level encryption via `chrome.storage.local`
  - Encryption method: OS-dependent (FileVault on macOS, BitLocker on Windows, etc.)
  - Key management: Handled by browser/OS
- **At Rest (Backend):** Depends on backend implementation (user's responsibility)

**No Additional Encryption:**

- Extension does not implement additional encryption layer
- Relies on HTTPS for transport security
- Relies on browser/OS for storage encryption

### Retention and Deletion Policies

#### Extension (Client-Side)

**Cache Retention:**
- **Default:** 24 hours from analysis time
- **Configurable:** 1-168 hours (user setting)
- **Automatic Deletion:** Expired entries deleted on:
  - Extension startup
  - Cache full (quota exceeded)
  - Manual cache clear

**Manual Deletion:**
- User can clear all cache via settings
- User can clear individual video cache (future enhancement)
- Uninstalling extension deletes all local data

**No Retention After:**
- Cache expiration
- Manual clear
- Extension uninstall

#### Backend (Server-Side)

**Recommendation:** Configure backend to not retain data

**If Backend Retains Data:**
- Retention policy: Determined by backend administrator
- User responsibility: Choose trusted backend or self-host
- Deletion: User must request deletion from backend administrator

**Extension Cannot Control:**
- Backend logging practices
- Backend data retention
- Backend data sharing

**User Guidance:**
- Use self-hosted backend for full control
- Review backend privacy policy before use
- Configure backend to delete data after analysis

### Third-Party Data Sharing

**Extension:**
- ❌ Does not share data with third parties
- ❌ Does not use analytics services
- ❌ Does not use crash reporting services
- ❌ Does not use advertising networks
- ✅ Only communicates with user-configured backend

**Backend:**
- ⚠️ May share data with third parties (depends on backend)
- ⚠️ May use external APIs (e.g., OpenAI, Google Search)
- ⚠️ User must review backend's privacy policy
- ✅ User controls which backend is used

**YouTube:**
- ⚠️ Backend fetches transcripts from YouTube
- ⚠️ YouTube may log transcript requests
- ⚠️ YouTube's privacy policy applies to transcript data
- ℹ️ Transcripts are public data (if available)

### Compliance and Transparency

**Chrome Web Store Requirements:**
- Privacy policy required and linked in extension
- Data usage disclosed in store listing
- User consent required before data transmission
- No deceptive practices

**GDPR Considerations (if applicable):**
- User consent obtained before processing
- Data minimization (only video URL sent)
- Right to deletion (clear cache, uninstall)
- Transparency (this data contract)

**User Rights:**
- Right to know what data is collected (this document)
- Right to control backend server (settings)
- Right to delete data (clear cache)
- Right to revoke consent (disable analysis)

### Security Considerations

**Input Validation:**
- Video ID validated (11 characters, alphanumeric + `-_`)
- Backend URL validated (valid HTTP/HTTPS URL)
- Response data validated against schema

**Output Sanitization:**
- Analysis results sanitized before display (prevent XSS)
- Error messages sanitized (no sensitive data leaked)
- Logs sanitized (no URLs, tokens, or user IDs)

**Attack Mitigation:**
- No eval() or Function() (CSP compliant)
- No inline scripts (CSP compliant)
- Shadow DOM for style isolation
- Message validation between components

**Vulnerability Disclosure:**
- Security issues reported to extension developer
- Responsible disclosure policy
- Updates distributed via Chrome Web Store
