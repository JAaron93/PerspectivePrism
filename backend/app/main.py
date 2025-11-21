from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.models.schemas import VideoRequest, AnalysisResponse, TruthProfile, PerspectiveType
from app.services.claim_extractor import ClaimExtractor
from app.services.evidence_retriever import EvidenceRetriever
from app.services.analysis_service import AnalysisService
import asyncio
import logging

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.PROJECT_NAME)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
claim_extractor = ClaimExtractor()
evidence_retriever = EvidenceRetriever()
analysis_service = AnalysisService()

@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_video(request: VideoRequest):
    """
    Analyzes a YouTube video for claims, bias, and perspective-based truth.
    """
    try:
        # 1. Extract Video ID and Transcript
        video_id = claim_extractor.extract_video_id(str(request.url))
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid video URL: could not extract video ID")
        transcript = claim_extractor.get_transcript(video_id)
        
        # 2. Extract Claims
        claims = await claim_extractor.extract_claims(transcript)
        
        # Limit claims for MVP to avoid hitting rate limits or long processing times
        # Let's process the first 3 claims for now
        claims_to_process = claims[:3]
        
        truth_profiles = []
        
        for claim in claims_to_process:
            # 3. Retrieve Evidence (Parallelize perspectives)
            perspectives = [
                PerspectiveType.SCIENTIFIC,
                PerspectiveType.JOURNALISTIC,
                PerspectiveType.PARTISAN_LEFT,
                PerspectiveType.PARTISAN_RIGHT
            ]
            
            evidence_results = await evidence_retriever.retrieve_evidence(claim, perspectives)
            
            # 4. Analyze Perspectives (Parallelize analysis)
            perspective_analyses = []
            analysis_tasks = []
            
            for perspective in perspectives:
                evidence = evidence_results.get(perspective, [])
                analysis_tasks.append(
                    analysis_service.analyze_perspective(claim, perspective, evidence)
                )
            
            perspective_analyses = await asyncio.gather(*analysis_tasks)
            
            # 5. Analyze Bias and Deception
            bias_analysis = await analysis_service.analyze_bias_and_deception(claim)
            
            # 6. Construct Truth Profile
            # Simple overall assessment logic for MVP
            overall_assessment = "Mixed"
            support_count = sum(1 for p in perspective_analyses if p.stance == "Support")
            refute_count = sum(1 for p in perspective_analyses if p.stance == "Refute")
            
            if support_count > refute_count and support_count >= 2:
                overall_assessment = "Likely True"
            elif refute_count > support_count and refute_count >= 2:
                overall_assessment = "Likely False"
            elif bias_analysis.deception_rating > 7:
                overall_assessment = "Suspicious/Deceptive"
                
            truth_profiles.append(TruthProfile(
                claim=claim,
                perspectives=perspective_analyses,
                bias_analysis=bias_analysis,
                overall_assessment=overall_assessment
            ))
            
        return AnalysisResponse(
            video_id=video_id,
            truth_profiles=truth_profiles
        )

    except ValueError as e:
        # ValueError is safe to return - it's from our validation
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Log full stacktrace server-side but hide details from client
        logger.exception("Error processing video analysis request")
        raise HTTPException(status_code=500, detail="Internal server error")
