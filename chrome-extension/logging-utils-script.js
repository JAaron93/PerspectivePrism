/**
 * Privacy-Protected Logging Utility (Script Version)
 *
 * Provides sanitized logging for content scripts and standard script contexts.
 * See logging-utils.js for the Module version.
 */

(function () {
  class Logger {
    static LOG_LEVELS = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      NONE: 4,
    };

    constructor(
      prefix = "[Perspective Prism]",
      level = Logger.LOG_LEVELS.INFO,
    ) {
      this.prefix = prefix;
      this.level = level;
      // Patterns to redact
      this.redactPatterns = [
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email
        /Bearer\s+[a-zA-Z0-9-._~+/]+=*/g, // Bearer Tokens
        /key=[a-zA-Z0-9_]+/g, // API Keys in query
      ];
      this.history = [];
      this.MAX_HISTORY = 100;
    }

    /**
     * Set the logging level
     * @param {number} level - One of Logger.LOG_LEVELS
     */
    setLevel(level) {
      this.level = level;
    }

    async persistLog(levelName, args) {
      try {
        const timestamp = new Date().toISOString();
        const sanitizedArgs = this.sanitizeArgs(args);
        const entry = {
          timestamp,
          level: levelName,
          message: sanitizedArgs.map(a => 
            typeof a === 'object' ? JSON.stringify(a) : String(a)
          ).join(' ')
        };

        this.history.push(entry);
        if (this.history.length > this.MAX_HISTORY) {
          this.history.shift();
        }

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
             // Basic persistence - content scripts might overwrite each other but better than nothing
             // In a real robust system we'd send a message to background to log
             // But for now direct write if possible (content scripts can access storage)
             // We get existing logs first?
             // Use get/set
             chrome.storage.local.get(['extension_logs'], (result) => {
               const logs = result.extension_logs || [];
               logs.push(entry);
               if (logs.length > this.MAX_HISTORY) {
                 logs.splice(0, logs.length - this.MAX_HISTORY);
               }
               chrome.storage.local.set({ extension_logs: logs });
             });
        }
      } catch (e) {
        // Ignore
      }
    }

    debug(...args) {
      if (this.level <= Logger.LOG_LEVELS.DEBUG) {
        console.debug(this.prefix, ...this.sanitizeArgs(args));
      }
    }

    info(...args) {
      if (this.level <= Logger.LOG_LEVELS.INFO) {
        console.log(this.prefix, ...this.sanitizeArgs(args));
        this.persistLog('INFO', args);
      }
    }

    warn(...args) {
      if (this.level <= Logger.LOG_LEVELS.WARN) {
        console.warn(this.prefix, ...this.sanitizeArgs(args));
        this.persistLog('WARN', args);
      }
    }

    error(...args) {
      if (this.level <= Logger.LOG_LEVELS.ERROR) {
        console.error(this.prefix, ...this.sanitizeArgs(args));
        this.persistLog('ERROR', args);
      }
    }

    /**
     * Sanitize an array of arguments
     */
    sanitizeArgs(args) {
      return args.map((arg) => this.sanitize(arg));
    }

    /**
     * Sanitize a single value
     */
    sanitize(value) {
      if (value === null || value === undefined) {
        return value;
      }

      if (typeof value === "string") {
        return this.sanitizeString(value);
      }

      if (Array.isArray(value)) {
        return value.map((item) => this.sanitize(item));
      }

      if (value instanceof Error) {
        return this.sanitizeError(value);
      }

      if (typeof value === "object") {
        return this.sanitizeObject(value);
      }

      return value;
    }

    sanitizeString(str) {
      let sanitized = str;

      // Redact patterns
      this.redactPatterns.forEach((pattern) => {
        sanitized = sanitized.replace(pattern, "[REDACTED]");
      });

      // Sanitize URLs
      if (sanitized.includes("http:") || sanitized.includes("https:")) {
        try {
          // Attempt to extract and sanitize URL if the whole string is a URL
          const url = new URL(sanitized);
          return this.sanitizeUrlObj(url).toString();
        } catch (e) {
          // Regex fallback for URLs inside strings
          sanitized = sanitized.replace(
            /((?:https?:\/\/)[^?#\s]+)(\?[^#\s]*)?/g,
            (match, origin, search) => {
              if (search) {
                return origin + "?[REDACTED_PARAMS]";
              }
              return origin;
            },
          );
        }
      }

      return sanitized;
    }

    sanitizeUrlObj(url) {
      const safeUrl = new URL(url.toString());
      if (safeUrl.search) {
        safeUrl.search = "?[REDACTED_PARAMS]";
      }
      return safeUrl;
    }

    sanitizeObject(obj) {
      try {
        const copy = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (
              /token|key|auth|password|secret/i.test(key) &&
              !/csrf/i.test(key)
            ) {
              copy[key] = "[REDACTED]";
            } else {
              copy[key] = this.sanitize(obj[key]);
            }
          }
        }
        return copy;
      } catch (e) {
        return "[Unserializable Object]";
      }
    }

    sanitizeError(error) {
      return {
        message: this.sanitizeString(error.message),
        name: error.name,
        stack: error.stack,
        code: error.code,
      };
    }
  }

  // Assign to global scope
  window.Logger = Logger;
})();
