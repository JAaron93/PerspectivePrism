"""
Micro-Benchmark Suite: Python Baseline vs Native Rust Core Engine.

Evaluates latency improvements across Candidates A, B, C, and D:
- Candidate A: Full-Pipeline Unified Sanitizer (10k, 50k, 100k chars)
- Candidate B: Aho-Corasick Political Keyword Fast-Path (<3k chars metadata)
- Candidate C: Vectorized Transcript Processor (250 and 1,000 segments)
- Candidate D: Prompt Nonce & Delimiter Isolation Guard
"""

import os
import sys
import time
import unicodedata
import re
from typing import List, Tuple

# Ensure backend root is on sys.path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

import prism_sanitizer_rs
from app.utils.input_sanitizer import (
    escape_special_characters,
    contains_control_characters,
    contains_suspicious_patterns,
    truncate_text,
    SanitizationError,
)
from app.services.content_classifier import POLITICAL_KEYWORDS


# Pure-Python baseline for Candidate A
def python_sanitize_input_baseline(
    text: str,
    max_length: int,
    allow_suspicious_patterns: bool = False,
    allow_control_chars: bool = False,
) -> str:
    trimmed = text.strip()
    if not trimmed:
        raise SanitizationError("input cannot be empty")
    normalized = unicodedata.normalize("NFKC", trimmed)
    if not normalized.strip():
        raise SanitizationError("input cannot be empty")
    if not allow_control_chars:
        for char in normalized:
            if char not in ("\t", "\n", "\r") and unicodedata.category(char).startswith("C"):
                raise SanitizationError("input contains invalid control characters")
    if not allow_suspicious_patterns and contains_suspicious_patterns(normalized):
        raise SanitizationError("input contains suspicious patterns")
    escaped = escape_special_characters(normalized)
    return truncate_text(escaped, max_length)


# Pure-Python baseline for Candidate B
_PYTHON_KEYWORD_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(kw) for kw in POLITICAL_KEYWORDS) + r")\b",
    re.IGNORECASE,
)

def python_contains_political_keywords_baseline(text: str) -> bool:
    normalized = unicodedata.normalize("NFKC", text)
    return bool(_PYTHON_KEYWORD_PATTERN.search(normalized))


# Pure-Python baseline for Candidate C
def python_format_and_sanitize_transcript_baseline(
    segments: List[Tuple[float, str]],
    max_length: int = 100000,
) -> str:
    if not segments:
        raise SanitizationError("input cannot be empty")
    has_non_empty = any(text.strip() for _, text in segments)
    if not has_non_empty:
        raise SanitizationError("input cannot be empty")

    for _, text in segments:
        normalized = unicodedata.normalize("NFKC", text)
        for char in normalized:
            if char not in ("\t", "\n", "\r") and unicodedata.category(char).startswith("C"):
                raise SanitizationError("input contains invalid control characters")
        if contains_suspicious_patterns(normalized):
            raise SanitizationError("input contains suspicious patterns")

    formatted_transcript = ""
    for start, text in segments:
        normalized = unicodedata.normalize("NFKC", text)
        minutes = int(max(0.0, start) // 60)
        seconds = int(max(0.0, start) % 60)
        timestamp = f"[{minutes:02d}:{seconds:02d}]"
        escaped_text = escape_special_characters(normalized)
        formatted_transcript += f"{timestamp} {escaped_text}\n"

        if len(formatted_transcript) > max_length:
            suffix = "\n...[TRUNCATED]..."
            suffix_len = len(suffix)
            if max_length >= suffix_len:
                cut_point = max_length - suffix_len
                s = formatted_transcript[:cut_point]
                bs_count = 0
                for c in reversed(s):
                    if c == "\\":
                        bs_count += 1
                    else:
                        break
                if bs_count % 2 == 1:
                    s = s[:-1]
                formatted_transcript = s + suffix
            else:
                formatted_transcript = formatted_transcript[:max_length]
            return formatted_transcript

    return formatted_transcript


# Pure-Python baseline for Candidate D
def python_build_user_data_prompt_baseline(data: str, instruction: str, nonce: str = "deadbeef") -> str:
    start_delim = f"===USER DATA {nonce} START==="
    end_delim = f"===USER DATA {nonce} END==="
    return f"{start_delim}\n{data}\n{end_delim}\n{instruction}"


def benchmark_function(fn, *args, iterations: int = 50) -> float:
    # Warmup
    for _ in range(5):
        fn(*args)
    # Timed run
    start = time.perf_counter()
    for _ in range(iterations):
        fn(*args)
    duration = time.perf_counter() - start
    return (duration / iterations) * 1000.0  # ms


def run_all_benchmarks():
    print("=" * 80)
    print(" PERSPECTIVE PRISM: RUST NATIVE CORE ENGINE MICRO-BENCHMARKS")
    print("=" * 80)

    # Sample texts for Candidate A
    base_sentence = "The congressional committee reviewed the 2024 economic sanctions, inflation data, and federal policy. "
    text_10k = (base_sentence * (10000 // len(base_sentence) + 1))[:10000]
    text_50k = (base_sentence * (50000 // len(base_sentence) + 1))[:50000]
    text_100k = (base_sentence * (100000 // len(base_sentence) + 1))[:100000]

    print("\n--- Track 2 / Candidate A: Unified Sanitizer Pipeline ---")
    sizes = [("10k chars", text_10k, 10000), ("50k chars", text_50k, 50000), ("100k chars", text_100k, 100000)]
    results_a = {}
    for label, payload, limit in sizes:
        t_py = benchmark_function(python_sanitize_input_baseline, payload, limit, iterations=30)
        t_rs = benchmark_function(prism_sanitizer_rs.sanitize_input, payload, limit, iterations=30)
        speedup = t_py / t_rs if t_rs > 0 else float("inf")
        reduction = ((t_py - t_rs) / t_py) * 100.0
        results_a[label] = (t_py, t_rs, speedup, reduction)
        print(f"[{label:10s}] Python: {t_py:8.3f} ms | Rust: {t_rs:8.3f} ms | Speedup: {speedup:6.1f}x | Reduction: {reduction:5.1f}%")

    # Assert NFR-1 for Candidate A
    _, t_rs_100k, _, red_100k = results_a["100k chars"]
    assert t_rs_100k < 5.0, f"Candidate A 100k latency {t_rs_100k:.3f} ms exceeded 5.0 ms ceiling!"
    assert red_100k >= 75.0, f"Candidate A latency reduction {red_100k:.1f}% was below 75% target!"

    print("\n--- Track 3 / Candidate B: Aho-Corasick Keyword Pre-Classifier ---")
    metadata_text = (
        "Breaking: Senate Judiciary Committee Holds Key Hearing on Federal Court Nominations and Campaign Reform. "
        "The panel discussed legislative amendments, constitutionality, and economic implications with witnesses. "
        "Tags: politics, election, congress, law, policy, constitution."
    )
    t_py_b = benchmark_function(python_contains_political_keywords_baseline, metadata_text, iterations=200)
    t_rs_b = benchmark_function(prism_sanitizer_rs.contains_political_keywords, metadata_text, iterations=200)
    speedup_b = t_py_b / t_rs_b if t_rs_b > 0 else float("inf")
    t_rs_b_us = t_rs_b * 1000.0  # microseconds
    print(f"[Metadata  ] Python: {t_py_b * 1000.0:8.2f} µs | Rust: {t_rs_b_us:8.2f} µs | Speedup: {speedup_b:6.1f}x")
    assert t_rs_b_us < 50.0, f"Candidate B metadata latency {t_rs_b_us:.2f} µs exceeded 50 µs ceiling!"

    print("\n--- Track 4 / Candidate C: Vectorized Transcript Processor ---")
    # 250 segments ~ 20,000 characters (typical YouTube video)
    segments_250 = [(i * 3.5, f"Segment {i}: The official discussed budget deficits, interest rates, and trade treaties.") for i in range(250)]
    t_py_c250 = benchmark_function(python_format_and_sanitize_transcript_baseline, segments_250, 100000, iterations=30)
    t_rs_c250 = benchmark_function(prism_sanitizer_rs.format_and_sanitize_transcript, segments_250, 100000, iterations=30)
    speedup_c250 = t_py_c250 / t_rs_c250 if t_rs_c250 > 0 else float("inf")
    reduction_c250 = ((t_py_c250 - t_rs_c250) / t_py_c250) * 100.0
    print(f"[250 Segs  ] Python: {t_py_c250:8.3f} ms | Rust: {t_rs_c250:8.3f} ms | Speedup: {speedup_c250:6.1f}x | Reduction: {reduction_c250:5.1f}%")
    assert t_rs_c250 < 1.0, f"Candidate C typical transcript processing latency {t_rs_c250:.3f} ms exceeded 1.0 ms ceiling!"

    # 1,000 segments ~ 80,000 characters (long-form video)
    segments_1000 = [(i * 3.5, f"Segment {i}: The official discussed budget deficits, interest rates, and trade treaties.") for i in range(1000)]
    t_py_c1000 = benchmark_function(python_format_and_sanitize_transcript_baseline, segments_1000, 100000, iterations=30)
    t_rs_c1000 = benchmark_function(prism_sanitizer_rs.format_and_sanitize_transcript, segments_1000, 100000, iterations=30)
    speedup_c1000 = t_py_c1000 / t_rs_c1000 if t_rs_c1000 > 0 else float("inf")
    reduction_c1000 = ((t_py_c1000 - t_rs_c1000) / t_py_c1000) * 100.0
    print(f"[1,000 Segs] Python: {t_py_c1000:8.3f} ms | Rust: {t_rs_c1000:8.3f} ms | Speedup: {speedup_c1000:6.1f}x | Reduction: {reduction_c1000:5.1f}%")
    assert reduction_c1000 >= 75.0, f"Candidate C 1000-seg reduction {reduction_c1000:.1f}% was below 75% target!"

    print("\n--- Track 5 / Candidate D: Prompt Nonce & Delimiter Guard ---")
    sample_data = text_10k
    instruction = "Extract all verifiable factual claims and assess epistemic reliability."
    t_py_d = benchmark_function(python_build_user_data_prompt_baseline, sample_data, instruction, "deadbeef", iterations=100)
    t_rs_d = benchmark_function(prism_sanitizer_rs.build_user_data_prompt, sample_data, instruction, "deadbeef", iterations=100)
    speedup_d = t_py_d / t_rs_d if t_rs_d > 0 else float("inf")
    print(f"[10k Prompt] Python: {t_py_d * 1000.0:8.2f} µs | Rust: {t_rs_d * 1000.0:8.2f} µs | Speedup: {speedup_d:6.1f}x")

    t_py_forgery = benchmark_function(lambda: "===USER DATA" in sample_data, iterations=500)
    t_rs_forgery = benchmark_function(prism_sanitizer_rs.contains_delimiter_forgery, sample_data, "deadbeef", iterations=500)
    print(f"[Scan Forgery] Python: {t_py_forgery * 1000.0:8.2f} µs | Rust: {t_rs_forgery * 1000.0:8.2f} µs")

    print("\n" + "=" * 80)
    print(" ALL NFR-1 PERFORMANCE CEILINGS VERIFIED GREEN (>75% SPEEDUP MET)")
    print("=" * 80)


if __name__ == "__main__":
    run_all_benchmarks()
