#!/usr/bin/env python3
"""
Agent Evaluation Suite using Weights & Biases Weave.

This script evaluates the Perspective Prism backend agents (Claim Extraction & Analysis)
using Weave's Model, Dataset, and Evaluation APIs when W&B credentials are configured.
If no credentials are found, it falls back to a clean local benchmarking loop.
It also configures dynamic tier-checking for Gemini rate limits and supports context caching.
"""

import asyncio
import os
import sys
import time
from typing import Dict, List, Any
from dotenv import load_dotenv

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# Load env variables from backend/.env if it exists
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

# Check if Weights & Biases credentials are configured.
# If not, disable Weave completely to avoid blocking login prompts and run in local-only fallback mode.
def has_wandb_credentials() -> bool:
    if "WANDB_API_KEY" in os.environ:
        return True
    try:
        import netrc
        netrc_file = netrc.netrc()
        if "api.wandb.ai" in netrc_file.hosts or "wandb.ai" in netrc_file.hosts:
            return True
    except Exception:
        pass
    try:
        settings_path = os.path.expanduser("~/.config/wandb/settings")
        if os.path.exists(settings_path):
            with open(settings_path, "r") as f:
                if "api_key" in f.read():
                    return True
    except Exception:
        pass
    return False

if not has_wandb_credentials():
    os.environ["WEAVE_DISABLED"] = "true"

import weave

from app.models.schemas import PerspectiveType
from app.services.analysis_service import AnalysisService
from app.services.claim_extractor import ClaimExtractor
from app.services.evidence_retriever import EvidenceRetriever

# Check Gemini Tier in env to handle rate limits and concurrency
is_paid_tier = os.getenv("GEMINI_TIER", "free").lower() == "paid"

# Configure Weave parallelism based on tier to prevent HTTP 429 (Too Many Requests)
if not is_paid_tier:
    # Free tier: force sequential evaluation to avoid RPM limits
    os.environ["WEAVE_PARALLELISM"] = "1"
else:
    # Paid tier: allow concurrent requests
    os.environ["WEAVE_PARALLELISM"] = "10"


# Define the Pipeline Model for Evaluation
class PerspectivePrismPipeline(weave.Model):
    extractor_model: str = "gemini-3.5-flash"
    analysis_model: str = "gemini-3.5-flash"

    @weave.op()
    async def predict(self, url: str) -> dict:
        """Runs the end-to-end extraction and single claim perspective analysis."""
        # Initialize service instances inside predict to avoid Weave serialization issues
        claim_extractor = ClaimExtractor()
        evidence_retriever = EvidenceRetriever()
        analysis_service = AnalysisService()

        # Inject artificial delays on free tier
        if not is_paid_tier:
            await asyncio.sleep(2)

        start_time = time.time()
        try:
            # 1. Extract Video ID and Transcript
            video_id = claim_extractor.extract_video_id(url)
            transcript = claim_extractor.get_transcript(video_id)

            # 2. Extract Claims
            claims = await claim_extractor.extract_claims(transcript)
            
            # 3. Analyze the first claim across Scientific & Journalistic perspectives
            analyses_results = []
            if claims:
                claim = claims[0]
                perspectives = [
                    PerspectiveType.SCIENTIFIC,
                    PerspectiveType.JOURNALISTIC,
                ]
                
                # Retrieve Evidence (Queries Google Search API)
                evidence_results = await evidence_retriever.retrieve_evidence(
                    claim, perspectives
                )

                for p in perspectives:
                    if not is_paid_tier:
                        await asyncio.sleep(2)
                    
                    analysis = await analysis_service.analyze_perspective(
                        claim,
                        p,
                        evidence_results.get(p, []),
                    )
                    analyses_results.append({
                        "perspective": p.value,
                        "stance": analysis.stance,
                        "confidence": analysis.confidence,
                        "explanation": analysis.explanation
                    })

            total_time = time.time() - start_time
            return {
                "success": True,
                "claims_count": len(claims),
                "analyses": analyses_results,
                "total_time": total_time,
                "error": None
            }

        except Exception as e:
            return {
                "success": False,
                "claims_count": 0,
                "analyses": [],
                "total_time": time.time() - start_time,
                "error": str(e)
            }


# Define Scorers for Evaluation Metrics
@weave.op()
def has_claims_scorer(output: dict) -> dict:
    """Verifies that the extractor succeeded in identifying at least one claim."""
    claims_count = output.get("claims_count", 0)
    return {"has_claims": claims_count > 0}

@weave.op()
def pipeline_success_scorer(output: dict) -> dict:
    """Verifies that the entire extraction and analysis pipeline executed without raising errors."""
    return {"success": output.get("success", False)}

@weave.op()
def latency_scorer(output: dict) -> dict:
    """Measures if the pipeline finished execution within a threshold of 60 seconds."""
    total_time = output.get("total_time", 0.0)
    return {"latency_under_60s": total_time < 60.0}


# Main Evaluation Runner
async def main():
    print("=" * 60)
    print("PERSPECTIVE PRISM - EVALUATION SUITE")
    print("=" * 60)
    
    use_weave = os.environ.get("WEAVE_DISABLED", "false").lower() != "true"

    # Define Test Dataset
    dataset = [
        # TED Talk: Giorgia Lupi (Data visualization)
        {"url": "https://www.youtube.com/watch?v=sFIDCtRX_-o"},
        # TED Talk: Bill Gates (Pandemic preparedness)
        {"url": "https://www.youtube.com/watch?v=6Af6b_wyiwI"},
        # NASA Artemis Program (Lunar missions)
        {"url": "https://www.youtube.com/watch?v=vl6jn-DdafM"},
    ]

    model = PerspectivePrismPipeline()

    if use_weave:
        print("W&B Weave credentials detected. Running Weave cloud evaluation...")
        weave.init("perspective-prism-evals")
        evaluation = weave.Evaluation(
            dataset=dataset,
            scorers=[
                has_claims_scorer,
                pipeline_success_scorer,
                latency_scorer,
            ],
        )
        results = await evaluation.evaluate(model)
        
        print("\n" + "=" * 60)
        print("WEAVE EVALUATION COMPLETED")
        print("=" * 60)
        print("Summary Metrics:")
        for metric_name, value in results.items():
            print(f"  {metric_name}: {value}")
        print("=" * 60)
    else:
        print("No W&B credentials detected. Running local fallback benchmarking...")
        print("Note: To run with full Weights & Biases tracing, configure WANDB_API_KEY or run 'wandb login'.\n")
        
        results = []
        for i, item in enumerate(dataset, 1):
            url = item["url"]
            print(f"[{i}/{len(dataset)}] Testing: {url}")
            res = await model.predict(url)
            results.append(res)
            if res["success"]:
                print(f"  ✓ Success | Claims: {res['claims_count']} | Time: {res['total_time']:.2f}s")
                for analysis in res["analyses"]:
                    print(f"    - {analysis['perspective']}: {analysis['stance']} (Conf: {analysis['confidence']:.2f})")
            else:
                print(f"  ✗ Failed | Error: {res['error']}")
            print()
            
        # Calculate summary metrics
        successful = [r for r in results if r["success"]]
        success_rate = len(successful) / len(results) * 100 if results else 0
        avg_time = sum([r["total_time"] for r in successful]) / len(successful) if successful else 0
        
        print("=" * 60)
        print("LOCAL BENCHMARK SUMMARY")
        print("=" * 60)
        print(f"Total Tests:       {len(results)}")
        print(f"Successful:        {len(successful)}")
        print(f"Failed:            {len(results) - len(successful)}")
        print(f"Success Rate:      {success_rate:.1f}%")
        if successful:
            print(f"Avg Total Time:    {avg_time:.2f}s")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
