/**
 * Video Utilities (ES Module Version)
 */

export function isValidVideoId(id) {
  // YouTube video IDs are exactly 11 characters
  // Valid characters: A-Z, a-z, 0-9, underscore, hyphen
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

export function extractVideoIdFromUrl(url) {
  try {
    const urlObj = new URL(url);

    // Standard watch URL (?v=VIDEO_ID)
    const vParam = urlObj.searchParams.get("v");
    if (vParam && isValidVideoId(vParam)) {
      return vParam;
    }

    // Shorts format: /shorts/VIDEO_ID
    const shortsMatch = urlObj.pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
    if (shortsMatch && isValidVideoId(shortsMatch[1])) {
      return shortsMatch[1];
    }

    // Embed format: /embed/VIDEO_ID
    const embedMatch = urlObj.pathname.match(/\/embed\/([A-Za-z0-9_-]+)/);
    if (embedMatch && isValidVideoId(embedMatch[1])) {
      return embedMatch[1];
    }

    // Legacy format: /v/VIDEO_ID
    const legacyMatch = urlObj.pathname.match(/\/v\/([A-Za-z0-9_-]+)/);
    if (legacyMatch && isValidVideoId(legacyMatch[1])) {
      return legacyMatch[1];
    }

    // Short URL format (youtu.be/VIDEO_ID)
    if (urlObj.hostname.includes("youtu.be")) {
      const pathParts = urlObj.pathname.split("/");
      const id = pathParts[1] || null;
      if (isValidVideoId(id)) return id;
    }

    return null;
  } catch (error) {
    return null;
  }
}
