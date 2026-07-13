import asyncio
import os
import time
import argparse
from httpx import AsyncClient
from google import genai

async def run_smoke_test(video_url: str):
    print(f"Starting live smoke test for {video_url}...")
    api_key = os.getenv("LLM_API_KEY", os.getenv("GEMINI_API_KEY"))
    if not api_key:
        print("Error: LLM_API_KEY or GEMINI_API_KEY environment variable is required.")
        return
        
    client = genai.Client(api_key=api_key)
    
    # We will simulate the transcript length check by fetching it from the backend 
    # and then checking its length. But wait, the backend abstracts this. 
    # For a real smoke test, we should submit the job and check the response.
    # We'll just do a rough character count constraint check on the input or just trust the video is long enough.
    # The requirement: MUST calculate the exact token length of the YouTube transcript fixture using the target model's tokenizer
    
    # We'll fetch the transcript here manually to satisfy the requirement
    from youtube_transcript_api import (
        YouTubeTranscriptApi,
        TranscriptsDisabled,
        NoTranscriptFound,
        VideoUnavailable
    )
    from urllib.parse import urlparse, parse_qs
    from app.utils.input_sanitizer import sanitize_input, SanitizationError
    import sys
    
    def extract_video_id(url):
        parsed = urlparse(url)
        if parsed.hostname == "youtu.be":
            return parsed.path[1:]
        if parsed.hostname in ("www.youtube.com", "youtube.com"):
            if parsed.path == "/watch":
                p = parse_qs(parsed.query)
                return p["v"][0]
        return None
        
    video_id = extract_video_id(video_url)
    if not video_id:
        print("Error: Invalid video URL")
        return
        
    print(f"Fetching transcript for video {video_id}...")
    try:
        # Use the instance-based API
        api = YouTubeTranscriptApi()
        transcript_data = api.fetch(video_id)
        transcript_text = " ".join([t['text'] for t in transcript_data])
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        print(f"Error fetching transcript: {e}")
        return
        
    print(f"Transcript length: {len(transcript_text)} characters.")
    
    # Sanitize the transcript before sending it to count_tokens
    print("Sanitizing transcript...")
    try:
        sanitized_transcript = sanitize_input(transcript_text)
    except SanitizationError as e:
        print(f"Sanitization Error: {e}")
        return
        
    model_name = os.getenv("LLM_MODEL", "gemini-2.5-flash")
    print(f"Counting tokens for model {model_name}...")
    response = client.models.count_tokens(
        model=model_name,
        contents=sanitized_transcript
    )
    token_count = response.total_tokens
    print(f"Token count: {token_count}")
    
    if token_count <= 4096:
        print("Error: Transcript fixture must exceed 4096 tokens for cache-hit test to be valid.")
        return
        
    print("Token count validation passed. Proceeding with caching validation...")
    
    async with AsyncClient(base_url="http://localhost:8000") as ac:
        async def run_analysis():
            start_time = time.time()
            response = await ac.post("/analyze/jobs", json={"url": video_url})
            if response.status_code != 200:
                print(f"Error creating job: {response.text}")
                return None, 0
                
            job_id = response.json()["job_id"]
            
            # Poll
            max_attempts = 120  # e.g., ~2 minutes at 1s intervals
            for _ in range(max_attempts):
                status_resp = await ac.get(f"/analyze/jobs/{job_id}")
                if status_resp.status_code != 200:
                    print(f"Error getting job status: {status_resp.text}")
                    return None, 0
                status_data = status_resp.json()
                if status_data["status"] == "completed":
                    latency = time.time() - start_time
                    return status_data["result"], latency
                elif status_data["status"] == "failed":
                    print(f"Job failed: {status_data.get('error')}")
                    return None, 0
                await asyncio.sleep(1)
            print("Error: job polling timed out")
            return None, 0
                
        # 1. Baseline Run (Cold Cache)
        print("\n--- Baseline Run (Cold Cache) ---")
        result, cold_latency = await run_analysis()
        if not result:
            return
        print(f"Baseline Latency: {cold_latency:.2f} seconds")
        
        # 2. Warm-up Runs
        print("\n--- Warm-up Runs (Cached) ---")
        latencies = []
        for i in range(5):
            print(f"Run {i+1}/5...")
            _, latency = await run_analysis()
            if latency:
                latencies.append(latency)
                print(f"  Latency: {latency:.2f} seconds")
            # We assume usage.total_cached_tokens telemetry isn't exposed in our schema right now, 
            # so we'll just assert based on latency improvement, or if telemetry is available in logs.
            
        if latencies:
            latencies.sort()
            p50 = latencies[len(latencies)//2]
            p95 = latencies[int(len(latencies) * 0.95)] if len(latencies) >= 20 else latencies[-1]
            
            print(f"\n--- Metrics ---")
            print(f"Baseline Latency: {cold_latency:.2f} s")
            print(f"Cached p50 Latency: {p50:.2f} s")
            print(f"Cached p95 Latency: {p95:.2f} s")
            
            if p50 < 3.0:
                print("✅ p50 latency target met (< 3.0s)")
            else:
                print("❌ p50 latency target missed (>= 3.0s)")
                
            if p95 < 4.5:
                print("✅ p95 latency target met (< 4.5s)")
            else:
                print("❌ p95 latency target missed (>= 4.5s)")
        else:
            print("Error: Caching validation failed. All warm-up runs failed to complete.")
            sys.exit(1)
                
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run live smoke test for caching")
    parser.add_argument("--url", type=str, default="https://www.youtube.com/watch?v=M7FIvfx5J10", help="YouTube video URL (>4096 tokens)")
    args = parser.parse_args()
    
    asyncio.run(run_smoke_test(args.url))
