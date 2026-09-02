from enum import Enum
from typing import Dict, List, Optional, Literal

from pydantic import BaseModel, Field, HttpUrl


class PerspectiveType(str, Enum):
    SCIENTIFIC = "Scientific"
    JOURNALISTIC = "Journalistic"
    PARTISAN_LEFT = "Partisan (Left)"
    PARTISAN_RIGHT = "Partisan (Right)"


TruthTheoryType = Literal[
    "Correspondence (Empirical)",
    "Coherence (Systemic Narrative)",
    "Pragmatic (Practical Utility)",
    "Perspectivism (Lived Experience)",
    "Consensus (Institutional Agreement)",
    "Deflationary (Rhetorical Endorsement)"
]


class VideoMetadata(BaseModel):
    title: str = Field(default="", description="YouTube video title")
    channel_name: str = Field(default="", description="Channel or creator name")
    category_id: Optional[str] = Field(default=None, description="YouTube Category ID")
    category_name: Optional[str] = Field(default=None, description="Category name (e.g. News & Politics, Music)")
    tags: List[str] = Field(default_factory=list, description="Video tags/keywords")
    description_snippet: str = Field(default="", description="First 250 characters of description")


class VideoRequest(BaseModel):
    url: HttpUrl
    force_override: bool = Field(
        default=False,
        description="When True, bypasses the Pre-Classification guardrail gate and forces full analysis."
    )
    metadata: Optional[VideoMetadata] = Field(
        default=None,
        description="Client-extracted YouTube DOM metadata to assist pre-classification."
    )


class ContentEligibilityResult(BaseModel):
    is_analysable: bool = Field(
        ...,
        description="True if video contains political discourse, news, commentary, debate, or socio-economic claims."
    )
    confidence_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence level between 0.0 and 1.0 that classification is correct."
    )
    detected_category: str = Field(
        ...,
        description="2-3 word label for detected content type (e.g. 'Anime Music Video', 'Political Commentary')."
    )
    disclaimer_title: str = Field(
        ...,
        description="Short user-facing header if is_analysable is False (e.g. 'Analysis Skipped')."
    )
    disclaimer_message: str = Field(
        ...,
        description="Clear, respectful explanation of why analysis was skipped."
    )
    key_topics_found: List[str] = Field(
        default_factory=list,
        description="Brief list of top topics identified in the metadata/transcript."
    )


class AlethiologyAnalysis(BaseModel):
    primary_theory: TruthTheoryType = Field(
        ...,
        description="Dominant epistemological theory of truth the speaker operates on."
    )
    secondary_theory: Optional[TruthTheoryType] = Field(
        default=None,
        description="Supporting or secondary truth framework present in the transcript."
    )
    epistemic_summary: str = Field(
        ...,
        description="Strictly neutral 2-3 sentence explanation of HOW the speaker builds their case."
    )
    quote_evidences: List[str] = Field(
        default_factory=list,
        description="Exact transcript quotes where speaker demonstrates their truth assumptions."
    )


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
    metadata: Optional[Dict] = None


class ExtractedClaim(BaseModel):
    text: str = Field(..., description="The exact text of the claim or a concise summary")
    start_time: float = Field(..., description="Start timestamp in seconds")
    end_time: float = Field(..., description="End timestamp in seconds")
    context: str = Field(..., description="Surrounding text context of the claim")


class ClaimsOutput(BaseModel):
    claims: List[ExtractedClaim]



class Evidence(BaseModel):
    url: str
    title: str
    snippet: str
    source: str
    perspective: PerspectiveType


class PerspectiveAnalysisLLMOutput(BaseModel):
    stance: str = Field(..., description="Support, Refute, or Ambiguous")
    confidence: float = Field(..., description="Confidence score from 0.0 to 1.0")
    explanation: str = Field(..., description="Brief explanation based only on the evidence")


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
    alethiology: Optional[AlethiologyAnalysis] = None


class AnalysisMetadata(BaseModel):
    analyzed_at: str


class BiasIndicators(BaseModel):
    logical_fallacies: List[str] = []
    emotional_manipulation: List[str] = []
    deception_score: Optional[float] = Field(None, ge=0, le=10)


class ClientTruthProfile(BaseModel):
    overall_assessment: str
    perspectives: Dict[str, PerspectiveAnalysis]
    bias_indicators: BiasIndicators
    alethiology: Optional[AlethiologyAnalysis] = None


class ClientClaimAnalysis(BaseModel):
    claim_text: str
    video_timestamp_start: Optional[float] = None
    video_timestamp_end: Optional[float] = None
    truth_profile: ClientTruthProfile


class AnalysisResponse(BaseModel):
    video_id: str
    metadata: AnalysisMetadata
    eligibility: Optional[ContentEligibilityResult] = None
    claims: List[ClientClaimAnalysis]


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
