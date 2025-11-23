from pydantic import BaseModel, HttpUrl, Field
from typing import List, Optional, Dict
from enum import Enum

class PerspectiveType(str, Enum):
    SCIENTIFIC = "Scientific"
    JOURNALISTIC = "Journalistic"
    PARTISAN_LEFT = "Partisan (Left)"
    PARTISAN_RIGHT = "Partisan (Right)"

class VideoRequest(BaseModel):
    url: HttpUrl
    
class TranscriptSegment(BaseModel):
    text: str
    start: float
    duration: float

class Transcript(BaseModel):
    video_id: str
    segments: List[TranscriptSegment]
    full_text: str

class Claim(BaseModel):
    id: str
    text: str
    timestamp_start: Optional[float] = None
    timestamp_end: Optional[float] = None
    context: Optional[str] = None

class Evidence(BaseModel):
    url: str
    title: str
    snippet: str
    source: str
    perspective: PerspectiveType

class PerspectiveAnalysis(BaseModel):
    perspective: PerspectiveType
    stance: str = Field(..., description="Support, Refute, or Ambiguous")
    confidence: float
    explanation: str
    evidence: List[Evidence]

class BiasAnalysis(BaseModel):
    framing_bias: Optional[str] = None
    sourcing_bias: Optional[str] = None
    omission_bias: Optional[str] = None
    sensationalism: Optional[str] = None
    deception_rating: float = Field(..., ge=0, le=10)
    deception_rationale: str

class TruthProfile(BaseModel):
    claim: Claim
    perspectives: List[PerspectiveAnalysis]
    bias_analysis: BiasAnalysis
    overall_assessment: str

class AnalysisResponse(BaseModel):
    video_id: str
    truth_profiles: List[TruthProfile]

class JobResponse(BaseModel):
    job_id: str

class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    result: Optional[AnalysisResponse] = None
    error: Optional[str] = None
