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
            console.error(`[PerspectivePrismClient] Analysis failed for ${videoId} (attempt ${attempt}):`, error);

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
                // Terminal failure
                await this.cleanupPersistedRequest(videoId);
                const errorResult = { success: false, error: error.message };
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
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

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
                const errorText = await response.text();
                throw new Error(`HTTP error ${response.status}: ${errorText}`);
            }

            return await response.json();
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
        // Don't retry on 4xx errors (except 429? maybe, but let's keep it simple)
        if (error.message.includes('HTTP error 4')) {
            return false;
        }
        return true; // Retry on network errors, 5xx, timeouts
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
}

