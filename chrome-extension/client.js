/**
 * PerspectivePrismClient
 * Handles API communication with the backend, including retry logic and state persistence.
 */
class PerspectivePrismClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.pendingRequests = new Map(); // In-memory deduplication
        this.MAX_RETRIES = 2;
        this.RETRY_DELAYS = [2000, 4000]; // Exponential backoff: 2s, 4s
        this.TIMEOUT_MS = 120000; // 120 seconds
        this.MAX_REQUEST_AGE = 300000; // 5 minutes

        // Recover persisted requests on startup
        this.recoverPersistedRequests();

        // Setup alarm listener for retries
        this.setupAlarmListener();

        this.pendingResolvers = new Map(); // Map<videoId, Array<{resolve, reject, timeoutId}>>
    }

    /**
     * Analyze a video by its ID.
     * @param {string} videoId - The YouTube video ID.
     * @returns {Promise<Object>} - The analysis result.
     */
    async analyzeVideo(videoId) {
        // Validation
        if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return { success: false, error: 'Invalid video ID format' };
        }

        // Deduplication (In-memory)
        if (this.pendingRequests.has(videoId)) {
            console.log(`[PerspectivePrismClient] Returning existing promise for ${videoId}`);
            return this.pendingRequests.get(videoId);
        }

        // Deduplication (Persistent)
        const persistedState = await this.getPersistedRequestState(videoId);
        if (persistedState && persistedState.status !== 'completed') {
            console.log(`[PerspectivePrismClient] Attaching to persisted request for ${videoId}`);
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    this.removeResolver(videoId, resolve);
                    // Resolve with error instead of rejecting to match API contract
                    resolve({ success: false, error: 'Analysis timed out (persisted)', videoId });
                }, this.TIMEOUT_MS);

                const resolvers = this.pendingResolvers.get(videoId) || [];
                resolvers.push({ resolve, reject, timeoutId });
                this.pendingResolvers.set(videoId, resolvers);
            });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Create a promise for this request
        const requestPromise = this.executeAnalysisRequest(videoId, videoUrl);
        this.pendingRequests.set(videoId, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            this.pendingRequests.delete(videoId);
        }
    }

    /**
     * Execute the analysis request with retry logic.
     * @param {string} videoId 
     * @param {string} videoUrl 
     * @param {number} attempt 
     */
    async executeAnalysisRequest(videoId, videoUrl, attempt = 0) {
        // Persist state start
        await this.persistRequestState({
            videoId,
            videoUrl,
            startTime: Date.now(),
            attemptCount: attempt,
            status: 'pending'
        });

        try {
            const result = await this.makeAnalysisRequest(videoUrl, videoId);

            // Success
            // Success
            await this.cleanupPersistedRequest(videoId);
            const successResult = { success: true, data: result };
            this.notifyCompletion(videoId, successResult);
            return successResult;

        } catch (error) {
            this.logError(`Analysis failed for ${videoId} (attempt ${attempt})`, error);

            // Check if we should retry
            if (attempt < this.MAX_RETRIES && this.shouldRetryError(error)) {
                const delay = this.RETRY_DELAYS[attempt];
                console.log(`[PerspectivePrismClient] Scheduling retry in ${delay}ms`);

                // Update persisted state
                await this.persistRequestState({
                    videoId,
                    videoUrl,
                    startTime: Date.now(), // Keep original start time? Maybe better to track original. 
                    // For simplicity, let's update timestamp to now for the "last activity" 
                    // but we should probably keep the original start time if we want to timeout the whole thing.
                    // Let's stick to the plan: store startTime.
                    // We need to fetch the original start time if we want to preserve it, 
                    // or just pass it through. For now, let's just update the attempt count.
                    attemptCount: attempt + 1,
                    lastError: error.message,
                    status: 'retrying'
                });

                // Schedule alarm with safe naming
                const alarmName = `retry::${videoId}::${attempt + 1}`;
                await chrome.alarms.create(alarmName, {
                    when: Date.now() + delay
                });

                return { success: false, error: 'Analysis in progress (retrying)', isRetry: true };
            } else {
                // Terminal failure
                await this.cleanupPersistedRequest(videoId);
                const userMessage = this.formatUserError(error);
                const errorResult = { success: false, error: userMessage, originalError: error.message };
                this.notifyCompletion(videoId, errorResult);
                return errorResult;
            }
        }
    }

    /**
     * Make the actual HTTP request.
     * @param {string} videoUrl 
     */
    async makeAnalysisRequest(videoUrl, videoId) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.TIMEOUT_MS);

        // Progress tracking
        const progressIntervals = [10000, 30000, 60000, 90000];
        const progressTimers = [];

        progressIntervals.forEach(delay => {
            const timer = setTimeout(() => {
                this.broadcastProgress(videoId, {
                    status: 'analyzing',
                    elapsedMs: delay,
                    message: delay === 10000 ? 'Still analyzing...' : undefined
                });
            }, delay);
            progressTimers.push(timer);
        });

        try {
            const response = await fetch(`${this.baseUrl}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ video_url: videoUrl }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new HttpError(response.status, response.statusText);
            }

            const data = await response.json();
            this.validateAnalysisData(data);
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new TimeoutError('Analysis request timed out');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
            progressTimers.forEach(t => clearTimeout(t));
        }
    }

    broadcastProgress(videoId, progressData) {
        // Query tabs that match YouTube patterns (we have host permissions for these)
        chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'ANALYSIS_PROGRESS',
                    videoId,
                    payload: progressData
                }).catch(() => { });
            }
        });
    }

    shouldRetryError(error) {
        // Don't retry validation errors
        if (error instanceof ValidationError) {
            return false;
        }

        // Retry on TimeoutError
        if (error instanceof TimeoutError) {
            return true;
        }

        // Retry on HttpError if 5xx or 429
        if (error instanceof HttpError) {
            if (error.status === 429 || error.status >= 500) {
                return true;
            }
            return false; // Don't retry other 4xx errors
        }

        // Retry on network errors (fetch failures usually don't have status)
        return true;
    }

    formatUserError(error) {
        if (error instanceof ValidationError) {
            return 'The analysis data received was invalid. Please try again.';
        }
        if (error instanceof TimeoutError) {
            return ' The analysis took too long. Please try again later.';
        }
        if (error instanceof HttpError) {
            if (error.status === 429) {
                return 'Too many requests. Please wait a moment and try again.';
            }
            if (error.status >= 500) {
                return 'Our servers are experiencing issues. Please try again later.';
            }
            return `Unable to complete analysis (Error ${error.status}).`;
        }
        return 'An unexpected error occurred. Please try again.';
    }

    logError(context, error) {
        // Sanitize error message to remove potential PII or tokens
        // (Basic implementation: ensure no obvious URL params or long strings that look like tokens)
        let message = error.message || 'Unknown error';

        // Redact potential URLs
        message = message.replace(/https?:\/\/[^\s]+/g, '[URL REDACTED]');

        console.error(`[PerspectivePrismClient] ${context}: ${message}`, {
            name: error.name,
            stack: error.stack // Stack trace is usually safe in extension context but good to be aware
        });
    }

    // --- Persistence & Lifecycle ---

    async persistRequestState(state) {
        const key = `pending_request_${state.videoId}`;

        // Read-modify-write to preserve existing fields (like startTime)
        // This ensures that retries don't reset the original start time if it's not provided in the new state.
        // Although executeAnalysisRequest currently passes Date.now(), this pattern is safer for future changes.
        try {
            const existing = await chrome.storage.local.get(key);
            const existingState = existing[key] || {};

            // Merge existing state with new state, prioritizing new state values
            // but preserving startTime from existing if not in new (or if we want to enforce original)
            // For now, we just merge.
            const newState = { ...existingState, ...state };

            // If we want to strictly preserve original startTime even if state has a new one:
            if (existingState.startTime) {
                newState.startTime = existingState.startTime;
            }

            await chrome.storage.local.set({ [key]: newState });
        } catch (error) {
            console.error(`[PerspectivePrismClient] Failed to persist request state for ${state.videoId}:`, error);
        }
    }

    async getPersistedRequestState(videoId) {
        const key = `pending_request_${videoId}`;
        const result = await chrome.storage.local.get(key);
        return result[key];
    }

    async cleanupPersistedRequest(videoId) {
        const key = `pending_request_${videoId}`;
        await chrome.storage.local.remove(key);

        // Clear alarms
        // We can't wildcard clear easily without listing all, but we can clear specific ones if we know the attempt.
        // Or just clear all alarms starting with prefix.
        const alarms = await chrome.alarms.getAll();
        for (const alarm of alarms) {
            if (alarm.name.startsWith(`retry::${videoId}::`)) {
                await chrome.alarms.clear(alarm.name);
            }
        }
    }

    async recoverPersistedRequests() {
        const all = await chrome.storage.local.get(null);
        const keys = Object.keys(all).filter(k => k.startsWith('pending_request_'));

        for (const key of keys) {
            const state = all[key];
            const age = Date.now() - (state.startTime || 0); // Handle missing startTime

            if (age > this.MAX_REQUEST_AGE) {
                console.log(`[PerspectivePrismClient] Cleaning up stale request ${state.videoId}`);
                await this.cleanupPersistedRequest(state.videoId);
            } else {
                console.log(`[PerspectivePrismClient] Recovering request ${state.videoId}`);

                // Rate limiting: wait 500ms between recoveries to avoid overwhelming backend
                await new Promise(resolve => setTimeout(resolve, 500));

                if (state.status === 'pending') {
                    // Interrupted during execution, retry immediately
                    await this.executeAnalysisRequest(state.videoId, state.videoUrl, state.attemptCount);
                } else if (state.status === 'retrying') {
                    // Check if alarm exists
                    const nextAttempt = state.attemptCount + 1; // Assuming stored attempt is the last failed one
                    // Actually, in executeAnalysisRequest we store attemptCount: attempt + 1 BEFORE scheduling alarm.
                    // So state.attemptCount IS the attempt we are waiting for.
                    const alarmName = `retry::${state.videoId}::${state.attemptCount}`;
                    const alarm = await chrome.alarms.get(alarmName);

                    if (!alarm) {
                        console.warn(`[PerspectivePrismClient] Missing alarm for ${state.videoId}, rescheduling immediately`);
                        // If alarm is missing, we should probably just execute it now or schedule it.
                        // Let's execute it now to be safe and simple.
                        await this.executeAnalysisRequest(state.videoId, state.videoUrl, state.attemptCount);
                    }
                }
            }
        }
    }

    setupAlarmListener() {
        chrome.alarms.onAlarm.addListener(async (alarm) => {
            if (alarm.name.startsWith('retry::')) {
                const parts = alarm.name.split('::');
                // Format: retry::videoId::attempt
                if (parts.length !== 3) return;

                const videoId = parts[1];
                // We don't rely on the attempt from alarm name anymore, but it's there if needed.
                const alarmAttempt = parseInt(parts[2], 10);

                console.log(`[PerspectivePrismClient] Alarm fired for ${videoId}`);
                const state = await this.getPersistedRequestState(videoId);

                if (state) {
                    // Use state.attemptCount to ensure we are in sync with persistence
                    await this.executeAnalysisRequest(videoId, state.videoUrl, state.attemptCount);
                    // executeAnalysisRequest handles notification on completion
                } else {
                    // Fallback for missing state
                    console.error(`[PerspectivePrismClient] Alarm fired for ${videoId} but no persisted state found. Alarm attempt: ${alarmAttempt}`);
                    this.broadcastResult(videoId, { error: 'Analysis failed: State lost during recovery' });
                }
            }
        });
    }

    notifyCompletion(videoId, result) {
        // 1. Broadcast to tabs
        chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'ANALYSIS_RESULT',
                    videoId,
                    data: result.data,
                    error: result.error,
                    success: result.success
                }).catch(() => { }); // Ignore errors for tabs that don't listen
            }
        });

        // 2. Resolve pending local promises
        const resolvers = this.pendingResolvers.get(videoId);
        if (resolvers) {
            resolvers.forEach(({ resolve, timeoutId }) => {
                clearTimeout(timeoutId);
                resolve(result);
            });
            this.pendingResolvers.delete(videoId);
        }
    }

    removeResolver(videoId, resolve) {
        const resolvers = this.pendingResolvers.get(videoId);
        if (resolvers) {
            const index = resolvers.findIndex(r => r.resolve === resolve);
            if (index !== -1) {
                resolvers.splice(index, 1);
                if (resolvers.length === 0) {
                    this.pendingResolvers.delete(videoId);
                }
            }
        }
    }

    validateAnalysisData(data) {
        if (!data) {
            throw new ValidationError('Response data is null or undefined');
        }

        // Validate video_id
        if (typeof data.video_id !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(data.video_id)) {
            throw new ValidationError('Invalid or missing video_id: must be an 11-character string');
        }

        // Validate metadata
        if (!data.metadata || typeof data.metadata !== 'object') {
            throw new ValidationError('Missing metadata object');
        }
        if (typeof data.metadata.analyzed_at !== 'string') {
            throw new ValidationError('Missing or invalid metadata.analyzed_at');
        }

        // Validate claims
        if (!Array.isArray(data.claims)) {
            throw new ValidationError('claims must be an array');
        }

        data.claims.forEach((claim, index) => {
            if (typeof claim.claim_text !== 'string') {
                throw new ValidationError(`Claim at index ${index} missing claim_text`);
            }

            // Validate truth_profile
            if (!claim.truth_profile || typeof claim.truth_profile !== 'object') {
                throw new ValidationError(`Claim at index ${index} missing truth_profile`);
            }

            const tp = claim.truth_profile;
            if (typeof tp.overall_assessment !== 'string') {
                throw new ValidationError(`Claim at index ${index} missing overall_assessment`);
            }

            // Validate perspectives
            if (!tp.perspectives || typeof tp.perspectives !== 'object') {
                throw new ValidationError(`Claim at index ${index} missing perspectives object`);
            }

            // Validate bias_indicators
            if (!tp.bias_indicators || typeof tp.bias_indicators !== 'object') {
                throw new ValidationError(`Claim at index ${index} missing bias_indicators`);
            }

            const bi = tp.bias_indicators;
            if (!Array.isArray(bi.logical_fallacies)) {
                throw new ValidationError(`Claim at index ${index} invalid logical_fallacies array`);
            }
            if (!Array.isArray(bi.emotional_manipulation)) {
                throw new ValidationError(`Claim at index ${index} invalid emotional_manipulation array`);
            }
            if (typeof bi.deception_score !== 'number') {
                throw new ValidationError(`Claim at index ${index} invalid deception_score`);
            }
        });

        return true;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

class HttpError extends Error {
    constructor(status, statusText) {
        super(`HTTP error ${status}: ${statusText}`);
        this.name = 'HttpError';
        this.status = status;
        this.statusText = statusText;
    }
}

class TimeoutError extends Error {
    constructor(message = 'Request timed out') {
        super(message);
        this.name = 'TimeoutError';
    }
}

