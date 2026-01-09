import re
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.models.schemas import (
    VideoRequest, AnalysisResponse, TruthProfile, PerspectiveType,
    JobResponse, JobStatusResponse, JobStatus,
    AnalysisMetadata, ClientClaimAnalysis, ClientTruthProfile, BiasIndicators
)
from app.services.claim_extractor import ClaimExtractor
from app.services.evidence_retriever import EvidenceRetriever
from app.services.analysis_service import AnalysisService
import asyncio
import logging
import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.PROJECT_NAME)

# Helper for CORS regex
def build_chrome_extension_regex(extension_ids: list[str]) -> str | None:
    if not extension_ids:
        return None
    return f"chrome-extension://({'|'.join(re.escape(cid) for cid in extension_ids)})"

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=build_chrome_extension_regex(settings.CHROME_EXTENSION_IDS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize services
claim_extractor = ClaimExtractor()
evidence_retriever = EvidenceRetriever()
analysis_service = AnalysisService()


# Job Store (In-memory for MVP)
# Structure: {job_id: {"status": JobStatus, "result": AnalysisResponse | None, "error": str | None, "created_at": datetime}}
jobs: Dict[str, Dict[str, Any]] = {}
jobs_lock = asyncio.Lock()

@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

async def cleanup_jobs():
    """
    Background task to clean up old jobs.
    """
    while True:
        try:
            await asyncio.sleep(300)  # Run every 5 minutes
            async with jobs_lock:
                now = datetime.now(timezone.utc)
                jobs_to_remove = []
                for job_id, job in jobs.items():
                    if now - job["created_at"] > timedelta(hours=1):
                        jobs_to_remove.append(job_id)
                
                for job_id in jobs_to_remove:
                    del jobs[job_id]
                
                if jobs_to_remove:
                    logger.info(f"Cleaned up {len(jobs_to_remove)} old jobs")
        except asyncio.CancelledError:
            logger.info("Cleanup jobs task cancelled")
            raise
        except Exception as e:
            logger.error(f"Error in cleanup_jobs task: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_jobs())

async def process_analysis(job_id: str, request: VideoRequest):
    """
    Background task to process the video analysis.
    """
    try:
        async with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["status"] = JobStatus.PROCESSING
        
        logger.debug(f"DEBUG: Starting analysis for job {job_id}, URL: {request.url}")
        logger.info(f"Starting analysis for job {job_id}, URL: {request.url}")
        
        # 1. Extract Video ID and Transcript
        
        def create_analysis_response(vid: str, cls: list) -> AnalysisResponse:
            return AnalysisResponse(
                video_id=vid,
                metadata=AnalysisMetadata(
                    analyzed_at=datetime.now(timezone.utc).isoformat()
                ),
                claims=list(cls)
            )

        def compute_overall_assessment(p_analyses: list, deception_score: float) -> str:
            # Simple overall assessment logic for MVP
            assessment = "Mixed"
            support_count = sum(1 for p in p_analyses if p.stance == "Support")
            refute_count = sum(1 for p in p_analyses if p.stance == "Refute")
            
            if support_count > refute_count and support_count >= 2:
                assessment = "Likely True"
            elif refute_count > support_count and refute_count >= 2:
                assessment = "Likely False"
            elif deception_score > 7:
                assessment = "Suspicious/Deceptive"
            return assessment

        video_id = claim_extractor.extract_video_id(str(request.url))
        # Validation is now done in create_analysis_job
        
        transcript = claim_extractor.get_transcript(video_id)
        
        # 2. Extract Claims
        claims = await claim_extractor.extract_claims(transcript)
        
        # Process claims with a reasonable limit
        MAX_CLAIMS_PER_REQUEST = 3  # Limit to prevent timeouts from processing too many claims
        if len(claims) > MAX_CLAIMS_PER_REQUEST:
            logger.warning(f"Video has {len(claims)} claims, limiting to {MAX_CLAIMS_PER_REQUEST}")
        claims_to_process = claims[:MAX_CLAIMS_PER_REQUEST]
        
        claims_to_return = []
        
        # 2b. Initial Partial Result Update
        # Create an initial result with claims but empty perspectives/truth profiles
        initial_claims_result = []
        for claim in claims_to_process:
             # Create empty placeholders
             client_perspectives = {} 
             bias_indicators = BiasIndicators(
                logical_fallacies=[],
                emotional_manipulation=[],
                deception_score=0.0 # Default
             )
             client_truth_profile = ClientTruthProfile(
                overall_assessment="Analyzing...",
                perspectives=client_perspectives,
                bias_indicators=bias_indicators
             )
             initial_claims_result.append(ClientClaimAnalysis(
                claim_text=claim.text,
                video_timestamp_start=claim.timestamp_start,
                video_timestamp_end=claim.timestamp_end,
                truth_profile=client_truth_profile
             ))
        
        # Save initial partial result
        # Save initial partial result
        async with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["result"] = create_analysis_response(video_id, initial_claims_result)

        claims_to_return = list(initial_claims_result)  # Work on a separate copy

        for i, claim in enumerate(claims_to_process):
            logger.debug(f"DEBUG: Processing claim {i+1}/{len(claims_to_process)}: {claim.text[:50]}...")
            logger.info(f"Processing claim {i+1}/{len(claims_to_process)}: {claim.id}")
            
            # 3. Retrieve Evidence (Parallelize perspectives)
            perspectives = [
                PerspectiveType.SCIENTIFIC,
                PerspectiveType.JOURNALISTIC,
                PerspectiveType.PARTISAN_LEFT,
                PerspectiveType.PARTISAN_RIGHT
            ]
            
            evidence_results = await evidence_retriever.retrieve_evidence(claim, perspectives)
            
            # 4. Analyze Perspectives (Parallelize analysis with incremental updates)
            
            async def process_single_perspective(p_type, p_evidence):
                # Analyze
                p_analysis = await analysis_service.analyze_perspective(claim, p_type, p_evidence)
                
                # Transform to dictionary format expected by UI
                p_dict = p_analysis.dict()
                p_dict['assessment'] = p_analysis.stance  # UI expects 'assessment'
                
                async with jobs_lock:
                    # Update local state inside the lock to prevent race conditions
                    # We know 'claims_to_return' is a list of ClientClaimAnalysis objects
                    # And 'truth_profile.perspectives' is a dict we can mutate
                    claims_to_return[i].truth_profile.perspectives[p_type.value] = p_dict
                    
                    # Create snapshot INSIDE lock to ensure we capture the latest state 
                    # and don't overwrite a newer state with an older snapshot
                    if job_id in jobs:
                        jobs[job_id]["result"] = create_analysis_response(video_id, claims_to_return)
                        
                return p_analysis

            analysis_tasks = []
            for perspective in perspectives:
                evidence = evidence_results.get(perspective, [])
                analysis_tasks.append(
                    process_single_perspective(perspective, evidence)
                )
            
            # Run perspective analyses concurrently, but wait for all to complete
            # before computing overall assessment
            perspective_analyses = await asyncio.gather(*analysis_tasks)
            
            # 5. Analyze Bias and Deception
            bias_analysis = await analysis_service.analyze_bias_and_deception(claim)
            
            # 6. Construct Truth Profile (Finalize for this claim)
            overall_assessment = compute_overall_assessment(perspective_analyses, bias_analysis.deception_rating)
            
            # Update the claim with final assessments and bias info
            # Note: perspectives are already populated incrementally!
            
            bias_indicators = BiasIndicators(
                logical_fallacies=[], # MVP placeholder
                emotional_manipulation=[], # MVP placeholder
                deception_score=bias_analysis.deception_rating
            )
            
            # Update the existing object in place or replace it - let's update fields to be safe
            claims_to_return[i].truth_profile.overall_assessment = overall_assessment
            claims_to_return[i].truth_profile.bias_indicators = bias_indicators
            
            # One final update for this claim (fixing the overall assessment and bias)
            # One final update for this claim (fixing the overall assessment and bias)
            async with jobs_lock:
                if job_id in jobs:
                    jobs[job_id]["result"] = create_analysis_response(video_id, claims_to_return)
            
        async with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["status"] = JobStatus.COMPLETED
                jobs[job_id]["result"] = create_analysis_response(video_id, claims_to_return)
        logger.info(f"Job {job_id} completed successfully")

    except Exception as e:
        logger.debug(f"DEBUG: Error processing job {job_id}: {e}")
        logger.exception(f"Error processing job {job_id}")
        async with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["status"] = JobStatus.FAILED
                jobs[job_id]["error"] = str(e)

@app.post("/analyze/jobs", response_model=JobResponse)
async def create_analysis_job(request: VideoRequest, background_tasks: BackgroundTasks):
    """
    Starts a background job to analyze a YouTube video.
    """
    # Validate video ID upfront
    video_id = claim_extractor.extract_video_id(str(request.url))
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid video URL: could not extract video ID")

    job_id = str(uuid.uuid4())
    async with jobs_lock:
        jobs[job_id] = {
            "status": JobStatus.PENDING,
            "result": None,
            "error": None,
            "created_at": datetime.now(timezone.utc)
        }
    
    background_tasks.add_task(process_analysis, job_id, request)
    
    return JobResponse(job_id=job_id)

@app.get("/analyze/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Retrieves the status and result of an analysis job.
    """
    async with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        job = jobs[job_id]
        # Return a copy or extract fields to avoid race conditions if job is modified after lock release
        # (Though for simple dict access in this MVP, returning the values is fine)
        return JobStatusResponse(
            job_id=job_id,
            status=job["status"],
            result=job["result"],
            error=job["error"]
        )

# Deprecated synchronous endpoint (kept for backward compatibility if needed, but we'll remove it or wrap it)
# For now, we'll remove it to force usage of the new flow as per instructions to "replace"

