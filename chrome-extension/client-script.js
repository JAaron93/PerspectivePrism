/**
 * Perspective Prism Client (Script Version for Manifest Script Injection)
 */

(function () {
  const logger =
    typeof window !== "undefined" && typeof window.Logger !== "undefined"
      ? new window.Logger("[PerspectivePrismClient]")
      : console;

  class ValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = "ValidationError";
    }
  }

  class HttpError extends Error {
    constructor(status, statusText) {
      super(`HTTP error ${status}: ${statusText}`);
      this.name = "HttpError";
      this.status = status;
      this.statusText = statusText;
    }
  }

  class TimeoutError extends Error {
    constructor(message = "Request timed out") {
      super(message);
      this.name = "TimeoutError";
    }
  }

  class PerspectivePrismClient {
    constructor(baseUrl = "http://localhost:8000") {
      this.baseUrl = baseUrl.replace(/\/$/, "");
      this.pendingRequests = new Map();
      this.pendingRequestOptions = new Map();
      this.pendingResolvers = new Map();
      this.abortControllers = new Map();
      this.TIMEOUT_MS = 120000;
      this.MAX_RETRIES = 3;
      this.RETRY_DELAYS = [2000, 5000, 10000];
      this.MAX_REQUEST_AGE = 5 * 60 * 1000;
      this.MAX_QUEUE_SIZE = 100;
      this.recoveryComplete = false;
      this.requestQueue = [];

      this.recoverPersistedRequests();
      this.setupAlarmListener();
    }

    async analyzeVideo(videoId, options = {}) {
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return { success: false, error: "Invalid video ID format" };
      }

      return this.performAnalysis(videoId, options);
    }

    async performAnalysis(videoId, options = {}) {
      const isForceOverride = Boolean(
        options.forceOverride || options.force_override,
      );

      if (!isForceOverride) {
        const cachedResult = await this.checkCache(videoId);
        if (cachedResult) {
          logger.info(`[PerspectivePrismClient] Cache hit for ${videoId}`);
          return { success: true, data: cachedResult, cached: true };
        }
      }

      if (this.pendingRequests.has(videoId)) {
        const inFlightOptions = this.pendingRequestOptions.get(videoId) || {};
        const inFlightIsForce = Boolean(
          inFlightOptions.forceOverride || inFlightOptions.force_override,
        );

        if (isForceOverride && !inFlightIsForce) {
          this.pendingRequests.delete(videoId);
          this.pendingRequestOptions.delete(videoId);
        } else {
          return this.pendingRequests.get(videoId);
        }
      }

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const requestPromise = this.executeAnalysisRequest(
        videoId,
        videoUrl,
        0,
        options,
      );
      this.pendingRequests.set(videoId, requestPromise);
      this.pendingRequestOptions.set(videoId, options);

      try {
        const result = await requestPromise;
        return result;
      } finally {
        this.pendingRequests.delete(videoId);
        this.pendingRequestOptions.delete(videoId);
      }
    }

    async executeAnalysisRequest(videoId, videoUrl, _attempt = 0, options = {}) {
      try {
        const result = await this.makeAnalysisRequest(
          videoUrl,
          videoId,
          options,
        );
        const successResult = { success: true, data: result };
        return successResult;
      } catch (error) {
        return {
          success: false,
          error: error.message || "Analysis failed",
        };
      }
    }

    async createAnalysisJob(videoUrl, options = {}) {
      const requestBody = {
        url: videoUrl,
        force_override: Boolean(options.forceOverride || options.force_override),
      };

      if (options.metadata) {
        requestBody.metadata = options.metadata;
      }

      const response = await fetch(`${this.baseUrl}/analyze/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: options.signal,
      });

      if (!response.ok) {
        throw new HttpError(response.status, response.statusText);
      }

      const jobData = await response.json();
      const jobId = jobData.job_id;

      if (!jobId || typeof jobId !== "string" || jobId.trim() === "") {
        throw new ValidationError("Backend returned invalid job_id");
      }

      return jobData;
    }

    async makeAnalysisRequest(videoUrl, videoId, options = {}) {
      const controller = new AbortController();
      const jobData = await this.createAnalysisJob(videoUrl, {
        ...options,
        signal: controller.signal,
      });
      const jobId = jobData.job_id;

      const result = await this.pollJobStatus(jobId, controller.signal);
      this.validateAnalysisData(result);
      return result;
    }

    async pollJobStatus(jobId, signal) {
      const maxAttempts = 60;
      const pollInterval = 2000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal && signal.aborted) {
          throw new TimeoutError("Analysis request timed out");
        }

        const response = await fetch(`${this.baseUrl}/analyze/jobs/${jobId}`, {
          headers: { "Content-Type": "application/json" },
          signal,
        });

        if (!response.ok) {
          throw new HttpError(response.status, response.statusText);
        }

        const job = await response.json();

        if (job.status === "completed") {
          return job.result;
        } else if (job.status === "failed") {
          throw new Error(job.error || "Job failed on backend");
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      throw new TimeoutError("Job polling timed out");
    }

    async checkCache(videoId) {
      try {
        const keyPrefix = `cache_${videoId}_`;
        const allItems = await chrome.storage.local.get(null);
        const matchKey = Object.keys(allItems).find((k) =>
          k.startsWith(keyPrefix),
        );
        if (matchKey && allItems[matchKey]) {
          return allItems[matchKey].data || allItems[matchKey];
        }
      } catch (_e) {
        // Ignore cache lookup error
      }
      return null;
    }

    recoverPersistedRequests() {
      this.recoveryComplete = true;
    }

    setupAlarmListener() {}

    validateAnalysisData(data) {
      if (!data) {
        throw new ValidationError("Response data is null or undefined");
      }
      if (
        typeof data.video_id !== "string" ||
        !/^[a-zA-Z0-9_-]{11}$/.test(data.video_id)
      ) {
        throw new ValidationError("Invalid or missing video_id");
      }
      if (!data.metadata || typeof data.metadata !== "object") {
        throw new ValidationError("Missing metadata object");
      }
      if (!Array.isArray(data.claims)) {
        throw new ValidationError("claims must be an array");
      }
      return true;
    }
  }

  if (typeof window !== "undefined") {
    window.PerspectivePrismClient = PerspectivePrismClient;
    window.ValidationError = ValidationError;
    window.HttpError = HttpError;
    window.TimeoutError = TimeoutError;
  }
})();
