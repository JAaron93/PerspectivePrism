from urllib.parse import parse_qs, urlparse

def extract_video_id(url: str) -> str:
    """
    Extracts the video ID from a YouTube URL.
    """
    parsed_url = urlparse(url)
    if parsed_url.hostname == "youtu.be":
        video_id = parsed_url.path[1:]
        if not video_id:
            raise ValueError("Invalid YouTube URL")
        return video_id
    if parsed_url.hostname in ("www.youtube.com", "youtube.com"):
        if parsed_url.path == "/watch":
            p = parse_qs(parsed_url.query)
            if "v" not in p or not p["v"] or not p["v"][0]:
                raise ValueError("Invalid YouTube URL")
            return p["v"][0]
        if parsed_url.path[:7] == "/embed/":
            parts = parsed_url.path.split("/")
            if len(parts) < 3 or not parts[2]:
                raise ValueError("Invalid YouTube URL")
            return parts[2]
        if parsed_url.path[:3] == "/v/":
            parts = parsed_url.path.split("/")
            if len(parts) < 3 or not parts[2]:
                raise ValueError("Invalid YouTube URL")
            return parts[2]
    raise ValueError("Invalid YouTube URL")
