/**
 * Privacy-Protected Logging Utility
 *
 * Provides sanitized logging to ensure no sensitive user data (PII, tokens, full URLs)
 * is logged to the console.
 */

class Logger {
  static LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4,
  };

  constructor(prefix = "[Perspective Prism]", level = Logger.LOG_LEVELS.INFO) {
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
      // Create a simplified entry for storage (join args to string or store as array)
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

      // Persist to storage (debounced or immediate? Immediate for now but catch errors)
      // Note: In content scripts, this might fail if extension context is invalid, check chrome.storage
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // We read-modify-write. This is race-prone but for logs it's acceptable usually.
        // Or we just store OUR history instance.
        // Better: append to a global log list. But that requires reading.
        // For simplicity: We will just save what this logger sees in a specific key, 
        // OR we try to get global logs. 
        // Given complexity, let's just save this instance's view or skip if too complex for 'metrics'.
        // The requirement says "last 100 log entries".
        // Let's rely on a fire-and-forget update.
        await chrome.storage.local.set({ extension_logs: this.history });
      }
    } catch (e) {
      // Ignore persistence errors to avoid loop
    }
  }

  debug(...args) {
    if (this.level <= Logger.LOG_LEVELS.DEBUG) {
      console.debug(this.prefix, ...this.sanitizeArgs(args));
      // Typically we don't persist debug logs to storage unless requested
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
   * @param {*} value - Value to sanitize
   * @param {WeakSet} [visited] - Track visited objects for circular reference detection
   */
  sanitize(value, visited = new WeakSet()) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      return this.sanitizeString(value);
    }

    // For objects (including arrays), check for circular references
    if (typeof value === "object") {
      if (visited.has(value)) {
        return "[Circular]";
      }
      visited.add(value);

      if (Array.isArray(value)) {
        return value.map((item) => this.sanitize(item, visited));
      }

      if (value instanceof Error) {
        return this.sanitizeError(value);
      }

      return this.sanitizeObject(value, visited);
    }

    return value;
  }

  sanitizeString(str) {
    let sanitized = str;

    // Redact patterns
    this.redactPatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });

    // Sanitize URLs (simple check)
    // We look for http:// or https:// and check if it's potentially sensitive
    // We'll trust localhost URLs usually, but let's be safe and redact query params globally
    if (sanitized.includes("http:") || sanitized.includes("https:")) {
      try {
        // Attempt to extract and sanitize URL if the whole string is a URL
        const url = new URL(sanitized);
        return this.sanitizeUrlObj(url).toString();
      } catch (e) {
        // If it's a string containing a URL, finding and replacing is harder without aggressive regex
        // For now, simple query param stripping via regex if it looks like a URL
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
    // Clone to avoid mutating original if it was passed in (though we don't pass URL objects here usually)
    const safeUrl = new URL(url.toString());
    if (safeUrl.search) {
      safeUrl.search = "?[REDACTED_PARAMS]";
    }
    return safeUrl;
  }

  /**
   * Sanitize an object, redacting sensitive keys
   * @param {Object} obj - Object to sanitize
   * @param {WeakSet} [visited] - Track visited objects for circular reference detection
   */
  sanitizeObject(obj, visited = new WeakSet()) {
    try {
      const copy = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // Check for specific tokens in keys or values
          if (
            /token|key|auth|password|secret/i.test(key) &&
            !/csrf/i.test(key)
          ) {
            copy[key] = "[REDACTED]";
          } else {
            copy[key] = this.sanitize(obj[key], visited);
          }
        }
      }
      return copy;
    } catch (e) {
      return "[Unserializable Object]";
    }
  }

  sanitizeError(error) {
    // Errors often contain PII in messages and stack traces
    return {
      message: this.sanitizeString(error.message),
      name: error.name,
      // Stack traces can contain user home paths (PII) - redact them
      stack: this.sanitizeStack(error.stack),
      code: error.code, // Useful for network errors
    };
  }

  /**
   * Sanitize stack traces by redacting file system paths that may contain usernames
   */
  sanitizeStack(stack) {
    if (!stack || typeof stack !== 'string') {
      return stack;
    }

    let sanitized = stack;

    // Redact Unix-style home directories: /Users/username, /home/username
    sanitized = sanitized.replace(/\/(?:Users|home)\/[^\s\/:]+/g, '[REDACTED_PATH]');

    // Redact Windows-style home directories: C:\Users\username
    sanitized = sanitized.replace(/[A-Z]:\\\\?Users\\\\?[^\s\\:]+/gi, '[REDACTED_PATH]');

    // Also run through sanitizeString for emails, tokens, etc. that might appear in stack
    sanitized = this.sanitizeString(sanitized);

    return sanitized;
  }
}

// Singleton instance
const logger = new Logger();

export { Logger, logger };
