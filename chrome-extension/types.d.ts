/**
 * Type definitions for Perspective Prism Chrome Extension
 *
 * This file defines the message interfaces and data structures used for communication
 * between the content script and background service worker, as well as data structures
 * for analysis results and MV3 recovery state.
 *
 * @file types.d.ts
 * @see design.md for detailed interface documentation
 */

// ============================================================================
// MESSAGE TYPES - Content Script to Background Service Worker
// ============================================================================

/**
 * Request to analyze a YouTube video
 * Sent from content script to background service worker
 */
interface AnalysisRequest {
  type: "ANALYZE_VIDEO";
  videoId: string;
  forceOverride?: boolean;
  force_override?: boolean;
  metadata?: VideoMetadata;
}

/**
 * Request to check cache for existing analysis results
 * Sent from content script to background service worker
 */
interface CacheCheckRequest {
  type: "CHECK_CACHE";
  videoId: string;
}

// ============================================================================
// MESSAGE TYPES - Background Service Worker to Content Script
// ============================================================================

/**
 * Response containing analysis results
 * Sent from background service worker to content script
 */
interface AnalysisResponse {
  type: "ANALYSIS_RESULT";
  videoId: string;
  data: AnalysisData | null;
  error?: string;
}

/**
 * Response containing cached analysis results
 * Sent from background service worker to content script
 */
interface CacheCheckResponse {
  type: "CACHE_RESULT";
  videoId: string;
  data: AnalysisData | null;
}

// ============================================================================
// ANALYSIS DATA STRUCTURES
// ============================================================================

/**
 * Complete analysis results for a video
 * Matches backend response schema
 */
interface AnalysisData {
  video_id: string;
  claims: Claim[];
  metadata: AnalysisMetadata;
  eligibility?: ContentEligibilityResult;
}

/**
 * Metadata about the analysis
 */
interface AnalysisMetadata {
  analyzed_at: string;
  video_title?: string;
}

/**
 * A single claim extracted from the video
 */
interface Claim {
  claim_text: string;
  timestamp?: string;
  truth_profile: TruthProfile;
}

/**
 * Truth profile for a claim, containing multi-perspective analysis
 */
interface TruthProfile {
  perspectives: PerspectiveSet;
  bias_indicators: BiasIndicators;
  overall_assessment: string;
  alethiology?: AlethiologyAnalysis;
}

/**
 * Set of perspective analyses for a claim
 */
interface PerspectiveSet {
  scientific?: PerspectiveAnalysis;
  journalistic?: PerspectiveAnalysis;
  partisan_left?: PerspectiveAnalysis;
  partisan_right?: PerspectiveAnalysis;
}

/**
 * Analysis from a specific perspective
 */
interface PerspectiveAnalysis {
  assessment: string;
  confidence: number;
  supporting_evidence: string[];
}

/**
 * Bias indicators for a claim
 */
interface BiasIndicators {
  logical_fallacies: string[];
  emotional_manipulation: string[];
  deception_score: number;
}

// ============================================================================
// MV3 RECOVERY STATE
// ============================================================================

/**
 * Persistent request state for MV3 service worker recovery
 *
 * This interface defines the state that must be persisted to chrome.storage.local
 * to enable recovery of in-flight analysis requests when the service worker
 * is terminated and restarted.
 *
 * @see design.md section "MV3 Lifecycle Handling" for implementation details
 */
interface PersistentRequestState {
  /** YouTube video ID (11 characters) */
  videoId: string;

  /** Full YouTube video URL */
  videoUrl: string;

  /** Timestamp when the request was initiated (milliseconds since epoch) */
  startTime: number;

  /** Number of retry attempts made so far */
  attemptCount: number;

  /** Error message from last failed attempt (if any) */
  lastError?: string;

  /** Current status of the request */
  status: "pending" | "retrying" | "failed";
}

/**
 * Interface for requests that need retry scheduling
 * Used internally for tracking retry state
 */
interface RequestRecoveryState extends PersistentRequestState {
  /** Resolver functions waiting for this request to complete */
  resolvers?: Array<(result: AnalysisResult) => void>;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Result object returned from analysis operations
 */
interface AnalysisResult {
  success: boolean;
  videoId: string;
  data?: AnalysisData;
  error?: string;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

/**
 * Cache entry structure stored in chrome.storage.local
 *
 * Key format: `cache_{videoId}`
 */
interface CacheEntry {
  videoId: string;
  data: AnalysisData;
  timestamp: number;
  expiresAt: number;
  schemaVersion: number;
}

/**
 * Cache statistics returned by getStats()
 */
interface CacheStats {
  totalEntries: number;
  totalSize: number;
  lastCleanup: number;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Extension configuration stored in chrome.storage.sync
 */
interface ExtensionConfig {
  backendUrl: string;
  cacheEnabled: boolean;
  cacheDuration: number; // hours
  allowInsecureUrls?: boolean; // Developer flag for HTTP URLs (default: false)
  privacyPolicyUrl?: string; // Optional external privacy policy URL
}

/**
 * Validation result from ConfigValidator
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// PROGRESS TYPES
// ============================================================================

/**
 * Progress update message sent during long-running analysis
 */
interface ProgressUpdate {
  type: "ANALYSIS_PROGRESS";
  videoId: string;
  progress: ProgressData;
}

/**
 * Progress data for analysis operation
 */
interface ProgressData {
  stage: "fetching" | "extracting" | "analyzing" | "caching";
  percentage?: number;
  message: string;
  elapsedTime: number;
}

// ============================================================================
// MESSAGE RETRY TYPES
// ============================================================================

/**
 * Options for sendMessageWithRetry function
 */
interface MessageRetryOptions {
  /** Per-request timeout in milliseconds (default: 5000) */
  timeout?: number;

  /** Maximum number of retry attempts (default: 4) */
  maxAttempts?: number;

  /** Custom backoff delays in milliseconds (default: [0, 500, 1000, 2000]) */
  backoffDelays?: number[];
}

/**
 * Internal retry state for message requests
 * Used for tracking retry attempts and errors
 */
interface MessageRetryState {
  /** Unique request identifier */
  requestId: string;

  /** Message being sent */
  message: any;

  /** Current attempt number (0-indexed) */
  attempt: number;

  /** Maximum number of attempts */
  maxAttempts: number;

  /** Backoff delays for each attempt */
  backoffDelays: number[];

  /** Last error encountered (if any) */
  lastError?: Error;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * HTTP error type with status code and response details
 */
type HttpError = Error & {
  statusCode: number;
  response?: string;
};

/**
 * Timeout error type with timeout duration
 */
type TimeoutError = Error & {
  timeout: number;
};

/**
 * Validation error type with invalid field information
 */
type ValidationError = Error & {
  invalidField: string;
};
