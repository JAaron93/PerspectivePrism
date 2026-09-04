#!/usr/bin/env python3
"""
Agent Evaluation Suite.

This script evaluates the Perspective Prism backend agents (Claim Extraction & Analysis)
using an end-to-end extraction and multi-perspective analysis pipeline.
Standardized on 100% cloud-native GCP Vertex AI mode and local benchmarking without
external SaaS dependencies (Weights & Biases / Weave).
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

from app.core.config import settings
from app.models.schemas import PerspectiveType
from app.services.analysis_service import AnalysisService
from app.services.claim_extractor import ClaimExtractor
from app.services.evidence_retriever import EvidenceRetriever


# Define the Pipeline Model for Evaluation
class PerspectivePrismPipeline:
    def __init__(
        self,
        extractor_model: str | None = None,
        analysis_model: str | None = None,
    ):
        self.extractor_model = extractor_model or getattr(settings, "LLM_MODEL", "gemini-3.8-flash")
        self.analysis_model = analysis_model or getattr(settings, "LLM_MODEL", "gemini-3.8-flash")

    async def predict(self, url: str) -> dict:
        """Runs the end-to-end extraction and single claim perspective analysis."""
        claim_extractor = ClaimExtractor(model_name=self.extractor_model)
        evidence_retriever = EvidenceRetriever()
        analysis_service = AnalysisService(model_name=self.analysis_model)

        is_paid_tier = getattr(settings, "GEMINI_TIER", "paid").lower() == "paid"

        # Inject artificial delays on free tier if applicable
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
def has_claims_scorer(output: dict) -> dict:
    """Verifies that the extractor succeeded in identifying at least one claim."""
    claims_count = output.get("claims_count", 0)
    return {"has_claims": claims_count > 0}


def pipeline_success_scorer(output: dict) -> dict:
    """Verifies that the entire extraction and analysis pipeline executed without raising errors."""
    return {"success": output.get("success", False)}


def latency_scorer(output: dict) -> dict:
    """Measures if the pipeline finished execution within a threshold of 60 seconds."""
    total_time = output.get("total_time", 0.0)
    return {"latency_under_60s": total_time < 60.0}


# Main Evaluation Runner
async def main():
    print("=" * 60)
    print("PERSPECTIVE PRISM - AGENT EVALUATION SUITE")
    print("=" * 60)
    print(f"GCP Project:   {getattr(settings, 'effective_gcp_project', 'Not Configured')}")
    print(f"Gemini Model:  {getattr(settings, 'LLM_MODEL', 'gemini-3.8-flash')}")
    print(f"Gemini Tier:   {getattr(settings, 'GEMINI_TIER', 'paid')}")
    print("=" * 60 + "\n")

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
    results = []

    for i, item in enumerate(dataset, 1):
        url = item["url"]
        print(f"[{i}/{len(dataset)}] Testing: {url}")
        res = await model.predict(url)
        
        # Evaluate against scorers
        claims_score = has_claims_scorer(res)["has_claims"]
        success_score = pipeline_success_scorer(res)["success"]
        latency_score = latency_scorer(res)["latency_under_60s"]

        res["scores"] = {
            "has_claims": claims_score,
            "success": success_score,
            "latency_under_60s": latency_score,
        }
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
    with_claims = [r for r in results if r.get("scores", {}).get("has_claims")]
    within_latency = [r for r in results if r.get("scores", {}).get("latency_under_60s")]
    
    success_rate = (len(successful) / len(results) * 100) if results else 0
    has_claims_rate = (len(with_claims) / len(results) * 100) if results else 0
    latency_rate = (len(within_latency) / len(results) * 100) if results else 0
    avg_time = (sum(r["total_time"] for r in successful) / len(successful)) if successful else 0

    print("=" * 60)
    print("BENCHMARK EVALUATION SUMMARY")
    print("=" * 60)
    print(f"Total Tests:             {len(results)}")
    print(f"Successful:              {len(successful)}")
    print(f"Failed:                  {len(results) - len(successful)}")
    print(f"Pipeline Success Rate:   {success_rate:.1f}%")
    print(f"Claims Yield Rate:       {has_claims_rate:.1f}%")
    print(f"Latency Compliance:      {latency_rate:.1f}% (< 60s)")
    if successful:
        print(f"Avg Successful Latency:  {avg_time:.2f}s")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
