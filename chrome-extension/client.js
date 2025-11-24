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
        if (persistedState) {
            console.log(`[PerspectivePrismClient] Found persisted request for ${videoId}, waiting for completion`);
            // In a real scenario, we might want to attach to the existing process, 
            // but since service workers are ephemeral, we mainly rely on the alarm system to drive it.
            // For the UI, we can return a "pending" status or similar, but for now let's just start a new request 
            // if it's not in memory, effectively "attaching" to the logical request.
            // However, to avoid double processing if the alarm is about to fire, we could check status.
            // For simplicity in this MVP, if it's persisted but not in memory (worker restarted), 
            // we can treat it as a new call that will update the persistence.
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
            await this.cleanupPersistedRequest(videoId);
            return { success: true, data: result };

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

                // Schedule alarm
                await chrome.alarms.create(`retry_${videoId}_${attempt + 1}`, {
                    when: Date.now() + delay
                });

                return { success: false, error: 'Analysis in progress (retrying)', isRetry: true };
            } else {
                // Terminal failure
                await this.cleanupPersistedRequest(videoId);
                return { success: false, error: error.message };
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
        // Preserve original startTime if possible, or pass it in. 
        // For now, if we are updating, we might want to read first? 
        // Or just trust the caller to pass the right state. 
        // Let's read-modify-write to be safe if we want to keep startTime constant.
        // But for efficiency, let's assume the caller manages it or we just overwrite.
        // To be safe, let's just save what we are given.
        await chrome.storage.local.set({ [key]: state });
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
            if (alarm.name.startsWith(`retry_${videoId}_`)) {
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
                // If it was 'pending' (worker died during request) or 'retrying' (waiting for alarm),
                // we should ensure the alarm is set or just retry immediately?
                // If the worker died, the alarm might still be there. 
                // If the alarm fired and woke the worker, we are good.
                // If the worker died *during* execution (status 'pending'), we might want to retry.
                if (state.status === 'pending') {
                    // It was interrupted. Let's schedule a retry immediately or soon.
                    await this.executeAnalysisRequest(state.videoId, state.videoUrl, state.attemptCount);
                }
            }
        }
    }

    setupAlarmListener() {
        chrome.alarms.onAlarm.addListener(async (alarm) => {
            if (alarm.name.startsWith('retry_')) {
                const parts = alarm.name.split('_');
                const videoId = parts[1];
                const attempt = parseInt(parts[2], 10);

                console.log(`[PerspectivePrismClient] Alarm fired for ${videoId} attempt ${attempt}`);
                const state = await this.getPersistedRequestState(videoId);

                if (state) {
                    const result = await this.executeAnalysisRequest(videoId, state.videoUrl, attempt);
                    // If successful, we might want to notify the UI/content script.
                    // But since the original promise is long gone (worker restart), 
                    // we need a way to push the result.
                    if (result.success) {
                        this.broadcastResult(videoId, result.data);
                    }
                }
            }
        });
    }

    broadcastResult(videoId, data) {
        chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'ANALYSIS_RESULT',
                    videoId,
                    data,
                    success: true
                }).catch(() => { }); // Ignore errors for tabs that don't listen
            }
        });
    }
}

