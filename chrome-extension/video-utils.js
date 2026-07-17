function isValidVideoId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

function extractVideoIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Strategy 1: Standard watch URL parameter (?v=VIDEO_ID)
    const vParam = urlObj.searchParams.get("v");
    if (vParam && isValidVideoId(vParam)) {
      return vParam;
    }

    // Strategy 2: Shorts format: /shorts/VIDEO_ID
    const shortsMatch = urlObj.pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
    if (shortsMatch && isValidVideoId(shortsMatch[1])) {
      return shortsMatch[1];
    }

    // Strategy 3: Embed format: /embed/VIDEO_ID
    const embedMatch = urlObj.pathname.match(/\/embed\/([A-Za-z0-9_-]+)/);
    if (embedMatch && isValidVideoId(embedMatch[1])) {
      return embedMatch[1];
    }

    // Strategy 4: Legacy format: /v/VIDEO_ID
    const legacyMatch = urlObj.pathname.match(/\/v\/([A-Za-z0-9_-]+)/);
    if (legacyMatch && isValidVideoId(legacyMatch[1])) {
      return legacyMatch[1];
    }

    // Strategy 5: Short URL (youtu.be)
    if (urlObj.hostname.includes("youtu.be")) {
      const pathParts = urlObj.pathname.split("/");
      const id = pathParts[1] || null;
      if (id && isValidVideoId(id)) {
        return id;
      }
    }

    // Strategy 6: Hash fragment (e.g. #v=VIDEO_ID or #...&v=VIDEO_ID)
    const hashMatch = urlObj.hash.match(/[?&]v=([A-Za-z0-9_-]+)/);
    if (hashMatch && isValidVideoId(hashMatch[1])) {
      return hashMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export { isValidVideoId, extractVideoIdFromUrl };
