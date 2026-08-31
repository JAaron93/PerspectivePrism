import time
import pytest
from typing import Dict, List

from redteam.corpus import load_corpus, get_default_payloads_dir, PayloadEntry
from redteam.probe import run_probe, probe_payload, ProbeStatus, ProbeResult


@pytest.mark.redteam
def test_deterministic_probe_full_corpus_execution_and_performance():
    """
    Executes the deterministic probe across the full payload corpus.
    
    Ensures:
    - All corpus entries are probed with zero network calls.
    - Execution completes in under 60 seconds (NFR-1).
    """
    corpus = load_corpus()
    assert len(corpus) > 0, "Corpus must not be empty"

    start_time = time.perf_counter()
    results = run_probe(corpus)
    elapsed_time = time.perf_counter() - start_time

    assert len(results) == len(corpus)
    assert elapsed_time < 60.0, f"Deterministic probe took {elapsed_time:.2f}s, exceeding 60s limit (NFR-1)"

    # Verify no unexpected ERROR statuses occurred
    errors = [r for r in results if r.status == ProbeStatus.ERROR]
    assert len(errors) == 0, f"Found {len(errors)} unexpected errors during probe: {[e.payload_id for e in errors]}"


@pytest.mark.redteam
def test_legitimate_control_corpus_never_rejected():
    """
    AC-2 / FR-2.3 Invariant: Legitimate journalism/news control transcripts (LEG)
    must NEVER be rejected by the sanitizer.
    
    Any false-positive rejection of a LEG payload fails the deterministic suite.
    """
    corpus = load_corpus()
    leg_entries = [entry for entry in corpus if entry.id.startswith("LEG-")]

    assert len(leg_entries) >= 10, f"Expected at least 10 LEG entries, found {len(leg_entries)}"

    rejected_entries: List[Dict[str, str]] = []

    for entry in leg_entries:
        result = probe_payload(entry)
        if result.status != ProbeStatus.BYPASSED:
            rejected_entries.append({
                "id": entry.id,
                "status": result.status,
                "error": result.error_message or "Unknown error",
            })

    assert len(rejected_entries) == 0, (
        f"Legitimate control payloads were rejected by sanitizer: {rejected_entries}"
    )


@pytest.mark.redteam
def test_delimiter_forgery_h1_survival_detected():
    """
    Hypothesis H1 Verification:
    Tests that delimiter forgery payloads (PI-DLM) containing '===USER DATA END==='
    are flagged as delimiter_forgery_survived=True when they bypass the regex sanitizer.
    """
    corpus = load_corpus()
    dlm_entries = [
        entry for entry in corpus
        if entry.id.startswith("PI-DLM-") and "===USER DATA END===" in entry.payload
    ]

    assert len(dlm_entries) > 0, "Expected at least one PI-DLM entry containing '===USER DATA END==='"

    results = [probe_payload(entry) for entry in dlm_entries]
    surviving = [r for r in results if r.delimiter_forgery_survived]

    assert len(surviving) > 0, (
        "Expected at least one PI-DLM payload to bypass regex sanitizer and survive with delimiter intact"
    )


@pytest.mark.redteam
def test_per_category_distribution():
    """
    Verifies that all required taxonomy categories are evaluated and return valid ProbeResults.
    """
    corpus = load_corpus()
    results = run_probe(corpus)
    result_by_id = {r.payload_id: r for r in results}

    categories: Dict[str, List[ProbeResult]] = {}
    for entry in corpus:
        prefix = entry.id.rsplit("-", 1)[0]
        categories.setdefault(prefix, []).append(result_by_id[entry.id])

    expected_categories = [
        "PI-DIR", "PI-PAR", "PI-DLM", "PI-ROL", "PI-OUT",
        "PI-EXF", "PI-UNI", "PI-MUL", "PI-SPL", "PI-TRN",
        "PI-ENC", "LEG"
    ]

    for cat in expected_categories:
        assert cat in categories, f"Missing results for category: {cat}"
        assert len(categories[cat]) >= 5, f"Category {cat} should have >= 5 results"
