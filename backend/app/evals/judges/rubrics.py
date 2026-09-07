"""Pydantic rubrics for Google ADK 2.0 Agent-as-a-Judge evaluations (FR10, FR11, FR12, FR13, FR16)."""

from typing import List, Literal
from pydantic import BaseModel, ConfigDict, Field


class ClaimExtractionRecallRubric(BaseModel):
    """Rubric measuring semantic claim recall and verifiability precision against gold references (FR10)."""

    model_config = ConfigDict(extra="forbid")

    extracted_claim_count: int = Field(
        ge=0,
        description="Number of valid claims extracted.",
    )
    reference_claim_count: int = Field(
        ge=0,
        description="Number of expected reference claims.",
    )
    true_positive_claims: int = Field(
        ge=0,
        description="Claims correctly captured semantically.",
    )
    hallucinated_claims: int = Field(
        ge=0,
        default=0,
        description="Extracted claims with no basis in transcript.",
    )
    filler_trivial_claims: int = Field(
        ge=0,
        default=0,
        description="Subjective, rhetorical, or unverifiable filler extracted.",
    )
    claim_recall_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Semantic recall: TP / Reference Count.",
    )
    verifiability_precision_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Precision of verifiable assertions: TP / Extracted Count.",
    )
    reasoning_justification: str = Field(
        min_length=20,
        description="Explanation of claim matching.",
    )
    is_fallback: bool = Field(
        default=False,
        description="Whether this result was produced by heuristic fallback.",
    )


class PerspectiveFaithfulnessRubric(BaseModel):
    """Rubric evaluating groundedness and faithfulness of perspective stances to search snippets (FR11)."""

    model_config = ConfigDict(extra="forbid")

    evidence_groundedness_score: int = Field(
        ge=1,
        le=5,
        description="1 = Major hallucination/prior knowledge leakage; 5 = Completely grounded in provided evidence.",
    )
    stance_correctness: bool = Field(
        description="Does stance strictly follow from evidence?",
    )
    hallucinated_facts: List[str] = Field(
        default_factory=list,
        description="External facts asserted not in evidence.",
    )
    reasoning_quality_score: int = Field(
        ge=1,
        le=5,
        description="Logical soundness of explanation.",
    )
    faithfulness_justification: str = Field(
        min_length=20,
        description="Detailed audit of evidence vs reasoning.",
    )
    is_fallback: bool = Field(
        default=False,
        description="Whether this result was produced by heuristic fallback.",
    )


class AlethiologyEvaluationRubric(BaseModel):
    """Rubric verifying 6-theory epistemic categorization and descriptive neutrality (FR12)."""

    model_config = ConfigDict(extra="forbid")

    primary_theory_match: bool = Field(
        description="Does primary theory match gold classification?",
    )
    secondary_theory_match: bool = Field(
        description="Does secondary theory match gold classification?",
    )
    descriptive_neutrality_score: int = Field(
        ge=1,
        le=5,
        description="5 = Perfectly descriptive and non-judgmental; 1 = Uses pejorative slurs, normative attacks, or validity judgments.",
    )
    neutrality_violations: List[str] = Field(
        default_factory=list,
        description="Pejorative terms or value judgments detected.",
    )
    quote_evidence_relevance: int = Field(
        ge=1,
        le=5,
        description="Relevance and fidelity of extracted quote evidences.",
    )
    evaluation_summary: str = Field(
        min_length=20,
        description="Step-by-step audit rationale.",
    )
    is_fallback: bool = Field(
        default=False,
        description="Whether this result was produced by heuristic fallback.",
    )


class PairwiseJudgmentRubric(BaseModel):
    """Rubric for position-flipped pairwise comparison of model candidate outputs (FR7)."""

    model_config = ConfigDict(extra="forbid")

    winner: Literal["candidate_1", "candidate_2", "tie"] = Field(
        description="Selected better candidate or tie.",
    )
    confidence_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score in the pairwise comparison (0.0 to 1.0).",
    )
    comparative_rationale: str = Field(
        min_length=20,
        description="Detailed explanation comparing Candidate 1 vs Candidate 2 against evaluation criteria.",
    )
    is_fallback: bool = Field(
        default=False,
        description="Whether this judgment was produced by heuristic fallback.",
    )
