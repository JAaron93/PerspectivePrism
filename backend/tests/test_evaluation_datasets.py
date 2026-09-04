import json
import re
from pathlib import Path
import pytest

DATASETS_DIR = Path(__file__).resolve().parent.parent / "app" / "evals" / "datasets"
BACKEND_DIR = Path(__file__).resolve().parent.parent


def test_evaluation_dependencies_in_manifests():
    """T1.1: Verify manifests declare required evaluation dependencies."""
    req_file = BACKEND_DIR / "requirements.txt"
    pyproject_file = BACKEND_DIR / "pyproject.toml"

    assert req_file.exists(), f"Missing {req_file}"
    assert pyproject_file.exists(), f"Missing {pyproject_file}"

    req_text = req_file.read_text()
    pyproject_text = pyproject_file.read_text()

    required_pkgs = [
        "google-adk",
        "google-genai",
        "pydantic",
        "opentelemetry-api",
        "opentelemetry-sdk",
        "tabulate",
    ]

    for pkg in required_pkgs:
        assert re.search(rf"\b{re.escape(pkg)}\b", req_text, re.IGNORECASE), (
            f"Package '{pkg}' missing from requirements.txt"
        )
        assert re.search(rf"\b{re.escape(pkg)}\b", pyproject_text, re.IGNORECASE), (
            f"Package '{pkg}' missing from pyproject.toml"
        )


def test_pre_classifier_golden_dataset_structure_and_bounds():
    """T1.2: Validate pre_classifier_golden.json exists, has >=30 cases, valid schema, and edge-case coverage."""
    dataset_path = DATASETS_DIR / "pre_classifier_golden.json"
    assert dataset_path.exists(), f"Dataset file does not exist: {dataset_path}"

    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list), "Dataset root must be a JSON array"
    assert len(data) >= 30, f"Expected at least 30 test cases, got {len(data)}"

    edge_cases_found = set()
    for idx, item in enumerate(data):
        assert "id" in item and item["id"], f"Case {idx} missing 'id'"
        assert "title" in item, f"Case {idx} missing 'title'"
        assert "channel_name" in item, f"Case {idx} missing 'channel_name'"
        assert "category_id" in item, f"Case {idx} missing 'category_id'"
        assert "category_name" in item, f"Case {idx} missing 'category_name'"
        assert "tags" in item and isinstance(item["tags"], list), f"Case {idx} missing 'tags' list"
        assert "description_snippet" in item, f"Case {idx} missing 'description_snippet'"
        assert "transcript_preview" in item, f"Case {idx} missing 'transcript_preview'"
        assert "is_analysable" in item and isinstance(item["is_analysable"], bool), (
            f"Case {idx} missing boolean 'is_analysable'"
        )
        assert "expected_category" in item and item["expected_category"], (
            f"Case {idx} missing 'expected_category'"
        )
        if "edge_case_type" in item and item["edge_case_type"]:
            edge_cases_found.add(item["edge_case_type"])

    required_edge_cases = {"satire", "amv_debate", "technical_documentary", "gaming_speedrun", "captionless_political"}
    assert required_edge_cases.issubset(edge_cases_found), (
        f"Missing edge case types: {required_edge_cases - edge_cases_found}"
    )


def test_claim_extractor_golden_dataset_structure_and_bounds():
    """T1.3: Validate claim_extractor_golden.json exists, has >=15 transcripts, and verified claims with timestamps."""
    dataset_path = DATASETS_DIR / "claim_extractor_golden.json"
    assert dataset_path.exists(), f"Dataset file does not exist: {dataset_path}"

    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list), "Dataset root must be a JSON array"
    assert len(data) >= 15, f"Expected at least 15 transcript cases, got {len(data)}"

    total_claims = 0
    for idx, item in enumerate(data):
        assert "video_id" in item and item["video_id"], f"Case {idx} missing 'video_id'"
        assert "title" in item and item["title"], f"Case {idx} missing 'title'"
        assert "transcript_text" in item and len(item["transcript_text"]) > 50, (
            f"Case {idx} has invalid 'transcript_text'"
        )
        assert "gold_claims" in item and isinstance(item["gold_claims"], list), (
            f"Case {idx} missing 'gold_claims' list"
        )
        assert len(item["gold_claims"]) > 0, f"Case {idx} has empty gold_claims"

        assert "segments" in item and isinstance(item["segments"], list), (
            f"Case {idx} missing 'segments' list"
        )
        assert len(item["segments"]) > 0, f"Case {idx} has empty segments"
        for s_idx, seg in enumerate(item["segments"]):
            assert "text" in seg and seg["text"], f"Case {idx} segment {s_idx} missing text"
            assert "start" in seg and isinstance(seg["start"], (int, float)), (
                f"Case {idx} segment {s_idx} missing numeric start"
            )
            assert "duration" in seg and isinstance(seg["duration"], (int, float)), (
                f"Case {idx} segment {s_idx} missing numeric duration"
            )
            assert seg["duration"] >= 0, f"Case {idx} segment {s_idx} negative duration"

        from app.models.schemas import Transcript, TranscriptSegment
        transcript_obj = Transcript(
            video_id=item["video_id"],
            segments=[TranscriptSegment(**s) for s in item["segments"]],
            full_text=item["transcript_text"]
        )
        assert len(transcript_obj.segments) == len(item["segments"])

        for c_idx, claim in enumerate(item["gold_claims"]):
            assert "id" in claim and claim["id"], f"Case {idx} claim {c_idx} missing 'id'"
            assert "text" in claim and len(claim["text"]) > 5, f"Case {idx} claim {c_idx} text too short"
            assert "timestamp_start" in claim and isinstance(claim["timestamp_start"], (int, float)), (
                f"Case {idx} claim {c_idx} missing numeric timestamp_start"
            )
            assert "timestamp_end" in claim and isinstance(claim["timestamp_end"], (int, float)), (
                f"Case {idx} claim {c_idx} missing numeric timestamp_end"
            )
            assert claim["timestamp_end"] >= claim["timestamp_start"], (
                f"Case {idx} claim {c_idx} invalid timestamps: {claim['timestamp_start']} > {claim['timestamp_end']}"
            )
            assert "context" in claim and claim["context"], f"Case {idx} claim {c_idx} missing 'context'"

            # Validate that each gold claim has corresponding overlapping segment(s)
            matching_segs = [
                s for s in item["segments"]
                if not (s["start"] + s["duration"] <= claim["timestamp_start"] or s["start"] >= claim["timestamp_end"])
            ]
            assert len(matching_segs) > 0, f"Case {idx} claim {c_idx} has no overlapping segments"

            total_claims += 1

    assert total_claims >= 40, f"Expected at least 40 total annotated claims across corpus, got {total_claims}"


def test_perspective_stance_golden_dataset_structure_and_bounds():
    """T1.4: Validate perspective_stance_golden.json exists, has >=40 cases, all 4 perspectives, and valid stances."""
    from app.models.schemas import PerspectiveType

    dataset_path = DATASETS_DIR / "perspective_stance_golden.json"
    assert dataset_path.exists(), f"Dataset file does not exist: {dataset_path}"

    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list), "Dataset root must be a JSON array"
    assert len(data) >= 40, f"Expected at least 40 test cases, got {len(data)}"

    perspectives_found = set()
    valid_stances = {"SUPPORTS", "REFUTES", "AMBIGUOUS"}
    hallucination_baits = 0

    for idx, item in enumerate(data):
        assert "id" in item and item["id"], f"Case {idx} missing 'id'"
        assert "claim_text" in item and len(item["claim_text"]) > 5, f"Case {idx} invalid claim_text"
        assert "perspective" in item and item["perspective"], f"Case {idx} missing perspective"
        # Validate that perspective maps directly to PerspectiveType enum
        assert PerspectiveType(item["perspective"]), f"Case {idx} invalid PerspectiveType: {item['perspective']}"
        perspectives_found.add(item["perspective"])

        assert "frozen_search_snippets" in item and isinstance(item["frozen_search_snippets"], list), (
            f"Case {idx} missing frozen_search_snippets list"
        )
        assert len(item["frozen_search_snippets"]) > 0, f"Case {idx} frozen_search_snippets is empty"
        assert "gold_stance" in item and item["gold_stance"] in valid_stances, (
            f"Case {idx} invalid gold_stance: {item.get('gold_stance')}"
        )
        assert "grounding_rationale" in item and len(item["grounding_rationale"]) > 10, (
            f"Case {idx} grounding_rationale too short"
        )
        assert "is_hallucination_bait" in item and isinstance(item["is_hallucination_bait"], bool), (
            f"Case {idx} missing boolean is_hallucination_bait"
        )
        if item["is_hallucination_bait"]:
            hallucination_baits += 1

    expected_perspectives = {"Scientific", "Journalistic", "Partisan (Left)", "Partisan (Right)"}
    assert perspectives_found == expected_perspectives, (
        f"Perspectives mismatch. Expected {expected_perspectives}, got {perspectives_found}"
    )
    assert hallucination_baits >= 5, f"Expected at least 5 hallucination bait test cases, got {hallucination_baits}"


def test_bias_deception_golden_dataset_structure_and_bounds():
    """T1.5: Validate bias_deception_golden.json exists, has >=25 cases, and calibrated deception scores (0-10)."""
    dataset_path = DATASETS_DIR / "bias_deception_golden.json"
    assert dataset_path.exists(), f"Dataset file does not exist: {dataset_path}"

    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list), "Dataset root must be a JSON array"
    assert len(data) >= 25, f"Expected at least 25 test cases, got {len(data)}"

    high_deception_count = 0
    low_deception_count = 0

    for idx, item in enumerate(data):
        assert "id" in item and item["id"], f"Case {idx} missing 'id'"
        assert "claim_text" in item and len(item["claim_text"]) > 5, f"Case {idx} invalid claim_text"
        assert "context" in item and len(item["context"]) > 10, f"Case {idx} context too short"
        assert "gold_deception_score" in item and isinstance(item["gold_deception_score"], (int, float)), (
            f"Case {idx} missing numeric gold_deception_score"
        )
        score = float(item["gold_deception_score"])
        assert 0.0 <= score <= 10.0, f"Case {idx} score {score} out of bounds [0.0, 10.0]"

        assert "framing_bias_present" in item and isinstance(item["framing_bias_present"], bool)
        assert "sourcing_bias_present" in item and isinstance(item["sourcing_bias_present"], bool)
        assert "omission_bias_present" in item and isinstance(item["omission_bias_present"], bool)
        assert "sensationalism_present" in item and isinstance(item["sensationalism_present"], bool)
        assert "deception_rationale" in item and len(item["deception_rationale"]) > 10

        if score >= 7.0:
            high_deception_count += 1
        elif score <= 3.0:
            low_deception_count += 1

    assert high_deception_count >= 5, f"Expected at least 5 high deception (>=7.0) cases, got {high_deception_count}"
    assert low_deception_count >= 5, f"Expected at least 5 low deception (<=3.0) cases, got {low_deception_count}"


def test_alethiology_epistemic_golden_dataset_structure_and_bounds():
    """T1.6: Validate alethiology_golden.json exists, has >=30 cases evenly across all 6 canonical truth theories."""
    dataset_path = DATASETS_DIR / "alethiology_golden.json"
    assert dataset_path.exists(), f"Dataset file does not exist: {dataset_path}"

    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list), "Dataset root must be a JSON array"
    assert len(data) >= 30, f"Expected at least 30 test cases, got {len(data)}"

    canonical_theories = {
        "Correspondence (Empirical)",
        "Coherence (Systemic Narrative)",
        "Pragmatic (Practical Utility)",
        "Perspectivism (Lived Experience)",
        "Consensus (Institutional Agreement)",
        "Deflationary (Rhetorical Endorsement)",
    }

    theory_counts = {t: 0 for t in canonical_theories}

    for idx, item in enumerate(data):
        assert "id" in item and item["id"], f"Case {idx} missing 'id'"
        assert "claim_text" in item and len(item["claim_text"]) > 5, f"Case {idx} invalid claim_text"
        assert "context_excerpt" in item and len(item["context_excerpt"]) > 10, f"Case {idx} invalid context_excerpt"
        assert "primary_theory" in item and item["primary_theory"] in canonical_theories, (
            f"Case {idx} unknown primary_theory: {item.get('primary_theory')}"
        )
        theory_counts[item["primary_theory"]] += 1

        if "secondary_theory" in item and item["secondary_theory"]:
            assert item["secondary_theory"] in canonical_theories, (
                f"Case {idx} unknown secondary_theory: {item.get('secondary_theory')}"
            )

        assert "epistemic_summary" in item and len(item["epistemic_summary"]) > 15
        assert "quote_evidences" in item and isinstance(item["quote_evidences"], list)
        assert len(item["quote_evidences"]) > 0, f"Case {idx} quote_evidences cannot be empty"

    for theory, count in theory_counts.items():
        assert count >= 4, f"Expected at least 4 test cases for '{theory}', got {count}"
