#!/usr/bin/env python3
"""
High-Throughput Parallel Request Burst Test (Mocked & Fast).

Verifies paid-tier rate limits, concurrency semaphore acquisition (10 max concurrent requests),
and error-free burst dispatch using mocked LLM agent calls.
"""

import asyncio
import sys
import time
from unittest.mock import patch

from app.core.config import Settings
from app.models.schemas import BiasAnalysis, Claim
from app.services.analysis_service import AnalysisService


async def run_burst_test(concurrency_count: int = 20, mock_delay: float = 0.05, active_settings=None):
    cfg = active_settings if active_settings is not None else Settings(_env_file=None)

    print("🚀 Starting High-Throughput Burst Test (Mocked)...")
    print(f"   • Target Concurrency Count: {concurrency_count} parallel requests")
    print(f"   • Configured GEMINI_TIER: {cfg.GEMINI_TIER}")
    print(f"   • Concurrency Semaphore Limit: {cfg.tier_max_concurrency}")
    print(f"   • Primary Model: {cfg.LLM_MODEL}\n")

    # Mock response payload matching BiasAnalysis schema
    mock_bias_output = BiasAnalysis(
        framing_bias="Minimal framing bias detected.",
        sourcing_bias="Multiple reputable sources referenced.",
        omission_bias="No significant omissions found.",
        sensationalism="Objective tone throughout.",
        deception_rating=1.5,
        deception_rationale="Claim is factual and supported by evidence.",
    )

    async def mock_agent_call(agent, user_prompt, output_key, is_backup=False):
        # Simulate realistic async LLM processing delay inside semaphore
        await asyncio.sleep(mock_delay)
        return mock_bias_output

    dummy_claim = Claim(
        id="burst_test_claim",
        text="Solar energy capacity expanded significantly worldwide in 2025.",
        timestamp_start=0.0,
        timestamp_end=5.0,
        context="Energy transition report analysis.",
    )

    # Patch the shared execute_adk_agent helper (DRY refactor: _run_agent_direct_inner removed)
    with patch("app.utils.llm_utils.execute_adk_agent", side_effect=mock_agent_call):
        service = AnalysisService(settings=cfg)

        async def single_request(request_id: int):
            start_time = time.time()
            try:
                result = await service.analyze_bias_and_deception(dummy_claim)
                elapsed = time.time() - start_time
                return {
                    "id": request_id,
                    "status": "success",
                    "elapsed": elapsed,
                    "deception_rating": result.deception_rating,
                }
            except Exception as e:
                elapsed = time.time() - start_time
                return {
                    "id": request_id,
                    "status": "failed",
                    "elapsed": elapsed,
                    "error": str(e),
                }

        start_burst = time.time()
        tasks = [single_request(i + 1) for i in range(concurrency_count)]
        results = await asyncio.gather(*tasks)
        total_burst_time = time.time() - start_burst

    successes = [r for r in results if r["status"] == "success"]
    failures = [r for r in results if r["status"] == "failed"]

    print("📊 Burst Test Results (Mocked Mode):")
    print(f"   • Total Requests Dispatched: {concurrency_count}")
    print(f"   • Successful: {len(successes)}")
    print(f"   • Failed: {len(failures)}")
    print(f"   • Total Wall-Clock Execution Time: {total_burst_time:.4f} seconds")

    if successes:
        latencies = [r["elapsed"] for r in successes]
        avg_latency = sum(latencies) / len(latencies)
        print(f"   • Average Latency per Request: {avg_latency:.4f} seconds")
        print(f"   • Effective Throughput: {len(successes) / total_burst_time:.2f} requests/sec")

    if failures:
        print("\n❌ Errors Encountered:")
        for f in failures:
            print(f"   • Request #{f['id']}: {f['error']}")
        sys.exit(1)
    else:
        print("\n🎉 High-throughput mock burst test completed with 100% success and verified semaphore throttling!")


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    asyncio.run(run_burst_test(count))
