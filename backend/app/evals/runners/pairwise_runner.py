"""Pairwise model benchmark runner with 50% position-flipping and 4x multi-sampling (FR7, NFR2)."""

import asyncio
import json
import logging
import secrets
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings as global_settings
from app.evals.judges.rubrics import PairwiseJudgmentRubric
from app.evals.security.eval_sanitizer import (
    escape_xml_sandbox_tags,
    neutralize_scoring_directives,
    strip_instruction_delimiters,
)
from app.evals.telemetry.tracer import record_eval_span
from app.utils.llm_utils import get_genai_client

logger = logging.getLogger(__name__)

PAIRWISE_JUDGE_SYSTEM_PROMPT = """You are an expert impartial Pairwise Evaluation Judge for PerspectivePrism.

YOUR PURPOSE:
Compare two candidate model responses (Candidate 1 and Candidate 2) for the exact same input task against specified evaluation criteria.
You must objectively determine which response is better, or declare a tie if they are functionally equivalent in quality.

EVALUATION RULES:
1. Focus strictly on factual accuracy, depth of reasoning, absence of hallucination, and adherence to constraints.
2. Ignore superficial style, formatting length, or candidate presentation position.
3. Winner must be one of:
   - "candidate_1": Candidate 1 is clearly superior.
   - "candidate_2": Candidate 2 is clearly superior.
   - "tie": Both candidates are of comparable quality or both failed equally.
"""


class PairwiseBenchmarkResult(BaseModel):
    """Aggregate benchmark results for pairwise candidate model evaluation."""

    model_config = ConfigDict(extra="forbid")

    model_a: str
    model_b: str
    model_a_win_rate: float = Field(ge=0.0, le=1.0)
    model_b_win_rate: float = Field(ge=0.0, le=1.0)
    tie_rate: float = Field(ge=0.0, le=1.0)
    model_a_wins: int = Field(ge=0)
    model_b_wins: int = Field(ge=0)
    ties: int = Field(ge=0)
    total_comparisons: int = Field(ge=0)
    positional_bias_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Metric measuring order bias: 0.0 = completely unbiased presentation, 1.0 = total positional bias.",
    )
    details: List[Dict[str, Any]] = Field(default_factory=list)


async def _generate_candidate_output(model_name: str, prompt: str) -> str:
    """Invokes candidate model via Google GenAI SDK under Vertex AI mode."""
    client = get_genai_client()
    response = await client.aio.models.generate_content(
        model=model_name,
        contents=prompt,
    )
    return response.text or ""


async def _judge_pairwise_candidates(
    candidate_1_text: str,
    candidate_2_text: str,
    criteria: str,
    is_flipped: bool = False,
    judge_model: str = "gemini-3.5-flash-lite",
) -> PairwiseJudgmentRubric:
    """
    Submits two candidate texts to the judge model with structured Pydantic schema output.
    """
    nonce = secrets.token_hex(8)
    sanitized_c1 = escape_xml_sandbox_tags(
        neutralize_scoring_directives(strip_instruction_delimiters(candidate_1_text)),
        tag_name="candidate_1",
    )
    sanitized_c2 = escape_xml_sandbox_tags(
        neutralize_scoring_directives(strip_instruction_delimiters(candidate_2_text)),
        tag_name="candidate_2",
    )
    sanitized_criteria = escape_xml_sandbox_tags(
        neutralize_scoring_directives(strip_instruction_delimiters(criteria)),
        tag_name="criteria",
    )

    judge_prompt = (
        f"{PAIRWISE_JUDGE_SYSTEM_PROMPT}\n\n"
        f"===JUDGE DATA {nonce} START===\n"
        f"<criteria>\n{sanitized_criteria}\n</criteria>\n\n"
        f"<candidate_1>\n{sanitized_c1}\n</candidate_1>\n\n"
        f"<candidate_2>\n{sanitized_c2}\n</candidate_2>\n"
        f"===JUDGE DATA {nonce} END===\n\n"
        f"Compare Candidate 1 and Candidate 2 against the criteria. Return structured judgment."
    )

    try:
        client = get_genai_client()
        response = await client.aio.models.generate_content(
            model=judge_model,
            contents=judge_prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": PairwiseJudgmentRubric,
            },
        )
        parsed = json.loads(response.text)
        return PairwiseJudgmentRubric.model_validate(parsed)
    except Exception as exc:
        logger.warning("Pairwise judge execution failed (%s); returning fallback tie.", exc)
        return PairwiseJudgmentRubric(
            winner="tie",
            confidence_score=0.0,
            comparative_rationale=f"Fallback judgment activated due to judge error: {str(exc)[:150]}",
            is_fallback=True,
        )


async def run_pairwise_model_benchmark(
    test_items: List[Dict[str, str]],
    model_a: str = "gemini-3.5-flash-lite",
    model_b: str = "gemini-3.8-flash",
    judge_model: str = "gemini-3.5-flash-lite",
    multi_sample_count: int = 4,
    settings: Any = None,
) -> PairwiseBenchmarkResult:
    r"""
    Executes a position-flipped (50% reversed order), multi-sampled (4x) pairwise model comparison.
    Eliminates presentation order bias and provides statistically grounded win rates.
    """
    total_comparisons = 0
    model_a_wins = 0
    model_b_wins = 0
    ties = 0
    pos_1_selections = 0
    pos_2_selections = 0
    details: List[Dict[str, Any]] = []

    for item_idx, item in enumerate(test_items):
        prompt = item.get("prompt", "")
        criteria = item.get("criteria", "Accuracy, groundedness, and descriptive neutrality.")

        # Generate outputs from both candidate models in parallel
        out_a_task = _generate_candidate_output(model_a, prompt)
        out_b_task = _generate_candidate_output(model_b, prompt)
        out_a, out_b = await asyncio.gather(out_a_task, out_b_task)

        # Run both forward (flip=False) and reversed (flip=True) configurations
        for is_flipped in [False, True]:
            cand_1 = out_b if is_flipped else out_a
            cand_2 = out_a if is_flipped else out_b

            # Run multi-sample comparisons to mitigate LLM evaluation variance
            for sample_idx in range(multi_sample_count):
                judgment = await _judge_pairwise_candidates(
                    candidate_1_text=cand_1,
                    candidate_2_text=cand_2,
                    criteria=criteria,
                    is_flipped=is_flipped,
                    judge_model=judge_model,
                )

                total_comparisons += 1
                winner = judgment.winner

                if winner == "candidate_1":
                    pos_1_selections += 1
                    actual_winner = model_b if is_flipped else model_a
                elif winner == "candidate_2":
                    pos_2_selections += 1
                    actual_winner = model_a if is_flipped else model_b
                else:
                    actual_winner = "tie"
                    ties += 1

                if actual_winner == model_a:
                    model_a_wins += 1
                elif actual_winner == model_b:
                    model_b_wins += 1

                details.append({
                    "item_index": item_idx,
                    "is_flipped": is_flipped,
                    "sample_index": sample_idx,
                    "raw_winner": winner,
                    "actual_winner": actual_winner,
                    "confidence": judgment.confidence_score,
                    "is_fallback": judgment.is_fallback,
                })

    decisive_comparisons = pos_1_selections + pos_2_selections
    if decisive_comparisons > 0:
        pos_1_ratio = pos_1_selections / decisive_comparisons
        positional_bias_score = round(abs(pos_1_ratio - 0.5) * 2.0, 4)
    else:
        positional_bias_score = 0.0

    a_win_rate = round(model_a_wins / total_comparisons, 4) if total_comparisons > 0 else 0.0
    b_win_rate = round(model_b_wins / total_comparisons, 4) if total_comparisons > 0 else 0.0
    tie_rate = round(ties / total_comparisons, 4) if total_comparisons > 0 else 0.0

    result = PairwiseBenchmarkResult(
        model_a=model_a,
        model_b=model_b,
        model_a_win_rate=a_win_rate,
        model_b_win_rate=b_win_rate,
        tie_rate=tie_rate,
        model_a_wins=model_a_wins,
        model_b_wins=model_b_wins,
        ties=ties,
        total_comparisons=total_comparisons,
        positional_bias_score=positional_bias_score,
        details=details,
    )

    with record_eval_span(
        metric_name="pairwise_win_rate",
        model_name=model_b,
        score=b_win_rate,
        extra_attributes={
            "gen_ai.evaluation.candidate_a": model_a,
            "gen_ai.evaluation.candidate_b": model_b,
            "gen_ai.evaluation.candidate_a_win_rate": a_win_rate,
            "gen_ai.evaluation.positional_bias_score": positional_bias_score,
        },
    ):
        pass

    return result
