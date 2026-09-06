"""Native quantitative evaluation runners for pointwise metrics and alignment (FR6, NFR4)."""

import json
import logging
import math
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from app.core.config import settings as global_settings
from app.evals.telemetry.tracer import record_eval_span

logger = logging.getLogger(__name__)

DEFAULT_PRE_CLASSIFIER_GOLDEN_PATH = (
    Path(__file__).resolve().parent.parent / "datasets" / "pre_classifier_golden.json"
)


def calculate_timestamp_iou(
    pred_start: float,
    pred_end: float,
    gold_start: float,
    gold_end: float,
) -> float:
    """
    Calculates the Intersection-over-Union (IoU) of two temporal intervals.
    Returns 0.0 for disjoint, inverted, or zero-duration ranges.
    """
    try:
        p_start = float(pred_start)
        p_end = float(pred_end)
        g_start = float(gold_start)
        g_end = float(gold_end)
    except (ValueError, TypeError):
        return 0.0

    # Inverted ranges or zero durations are invalid
    if p_start >= p_end or g_start >= g_end:
        return 0.0

    intersection_start = max(p_start, g_start)
    intersection_end = min(p_end, g_end)
    intersection = max(0.0, intersection_end - intersection_start)

    union_start = min(p_start, g_start)
    union_end = max(p_end, g_end)
    union = max(0.0, union_end - union_start)

    if union <= 0.0:
        return 0.0

    return intersection / union


def calculate_classification_metrics(
    y_true: List[Any],
    y_pred: List[Any],
    labels: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    """
    Calculates precision, recall, F1, accuracy, and confusion matrix.
    Supports both binary (bool) and multi-class strings.
    """
    if not y_true or not y_pred or len(y_true) != len(y_pred):
        return {
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1_score": 0.0,
            "macro_f1": 0.0,
            "total_samples": 0,
        }

    total = len(y_true)
    correct = sum(1 for yt, yp in zip(y_true, y_pred) if yt == yp)
    accuracy = correct / total

    # Check if binary boolean classification
    is_boolean_binary = all(isinstance(v, (bool, int)) for v in y_true + y_pred) and set(y_true + y_pred).issubset({True, False, 0, 1})

    if is_boolean_binary:
        tp = sum(1 for yt, yp in zip(y_true, y_pred) if yt and yp)
        fp = sum(1 for yt, yp in zip(y_true, y_pred) if not yt and yp)
        fn = sum(1 for yt, yp in zip(y_true, y_pred) if yt and not yp)
        tn = sum(1 for yt, yp in zip(y_true, y_pred) if not yt and not yp)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1_score = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        return {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "f1_score": f1_score,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
            "total_samples": total,
        }

    # Multi-class categorical evaluation
    unique_labels = list(dict.fromkeys(labels or (list(y_true) + list(y_pred))))
    per_class: Dict[str, Dict[str, float]] = {}
    f1_list: List[float] = []

    for label in unique_labels:
        c_tp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == label and yp == label)
        c_fp = sum(1 for yt, yp in zip(y_true, y_pred) if yt != label and yp == label)
        c_fn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == label and yp != label)

        c_prec = c_tp / (c_tp + c_fp) if (c_tp + c_fp) > 0 else 0.0
        c_rec = c_tp / (c_tp + c_fn) if (c_tp + c_fn) > 0 else 0.0
        c_f1 = (2 * c_prec * c_rec) / (c_prec + c_rec) if (c_prec + c_rec) > 0 else 0.0

        per_class[str(label)] = {
            "precision": c_prec,
            "recall": c_rec,
            "f1": c_f1,
            "support": sum(1 for yt in y_true if yt == label),
        }
        f1_list.append(c_f1)

    macro_f1 = sum(f1_list) / len(f1_list) if f1_list else 0.0

    return {
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "f1_score": macro_f1,
        "per_class": per_class,
        "total_samples": total,
    }


def calculate_error_metrics(
    y_true: List[float],
    y_pred: List[float],
) -> Dict[str, float]:
    """Calculates Mean Absolute Error (MAE), Mean Squared Error (MSE), and RMSE."""
    if not y_true or not y_pred or len(y_true) != len(y_pred):
        return {"mae": 0.0, "mse": 0.0, "rmse": 0.0}

    n = len(y_true)
    mae = sum(abs(t - p) for t, p in zip(y_true, y_pred)) / n
    mse = sum((t - p) ** 2 for t, p in zip(y_true, y_pred)) / n
    rmse = math.sqrt(mse)

    return {
        "mae": round(mae, 4),
        "mse": round(mse, 4),
        "rmse": round(rmse, 4),
    }


def _load_pre_classifier_dataset(dataset_path: Optional[Union[str, Path]] = None) -> List[Dict[str, Any]]:
    """Loads golden pre-classifier fixtures from disk."""
    path = Path(dataset_path) if dataset_path else DEFAULT_PRE_CLASSIFIER_GOLDEN_PATH
    if not path.exists():
        raise FileNotFoundError(f"Pre-classifier golden dataset not found at: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "test_cases" in data:
        return data["test_cases"]
    raise ValueError(f"Invalid format in golden dataset at {path}")


async def run_pre_classifier_eval(
    service: Optional[Any] = None,
    dataset_path: Optional[Union[str, Path]] = None,
    limit: Optional[int] = None,
    settings: Any = None,
) -> Dict[str, Any]:
    """
    Runs pointwise quantitative evaluation of the PreClassifierService against golden fixtures.
    Computes accuracy, precision, recall, F1, and deterministic fast-path short-circuit rate.
    """
    active_settings = settings or global_settings
    dataset = _load_pre_classifier_dataset(dataset_path)
    if limit and limit > 0:
        dataset = dataset[:limit]

    if service is None:
        from app.services.content_classifier import PreClassifierService
        service = PreClassifierService(settings=active_settings)

    from app.models.schemas import VideoMetadata

    y_true: List[bool] = []
    y_pred: List[bool] = []
    category_true: List[str] = []
    category_pred: List[str] = []
    fast_path_count = 0

    for item in dataset:
        metadata = VideoMetadata(
            video_id=item.get("video_id", "test_id"),
            title=item.get("title", ""),
            channel_name=item.get("channel_name", ""),
            category_id=str(item.get("category_id", "0")),
            category_name=item.get("category_name", ""),
            tags=item.get("tags", []),
            description_snippet=item.get("description_snippet", ""),
        )
        transcript_preview = item.get("transcript_preview")

        result = await service.classify_video(
            metadata=metadata,
            transcript_preview=transcript_preview,
        )

        y_true.append(bool(item.get("is_analysable", True)))
        y_pred.append(bool(result.is_analysable))
        category_true.append(str(item.get("expected_category", "")))
        category_pred.append(str(getattr(result, "detected_category", getattr(result, "category", ""))))

        if getattr(result, "deterministic_fast_path", False):
            fast_path_count += 1

    binary_metrics = calculate_classification_metrics(y_true, y_pred)
    category_metrics = calculate_classification_metrics(category_true, category_pred)
    fast_path_rate = fast_path_count / len(dataset) if dataset else 0.0

    summary = {
        **binary_metrics,
        "category_macro_f1": category_metrics.get("macro_f1", 0.0),
        "fast_path_short_circuit_rate": round(fast_path_rate, 4),
        "fast_path_count": fast_path_count,
        "total_evaluated": len(dataset),
    }

    with record_eval_span(
        metric_name="pre_classifier_f1",
        model_name=getattr(active_settings, "LLM_MODEL", "gemini-3.5-flash-lite"),
        score=summary["f1_score"],
        extra_attributes={
            "gen_ai.evaluation.accuracy": summary["accuracy"],
            "gen_ai.evaluation.fast_path_rate": fast_path_rate,
        },
    ):
        pass

    return summary


def run_claim_timestamp_iou_eval(
    extracted_claims: List[Dict[str, Any]],
    gold_claims: List[Dict[str, Any]],
    iou_threshold: float = 0.5,
) -> Dict[str, Any]:
    """
    Computes timestamp alignment between extracted claims and gold reference claims.
    Uses greedy bipartite matching by maximum IoU.
    """
    if not extracted_claims or not gold_claims:
        return {
            "mean_iou": 0.0,
            "precision_at_iou": 0.0,
            "recall_at_iou": 0.0,
            "matched_claims": 0,
            "extracted_count": len(extracted_claims),
            "gold_count": len(gold_claims),
        }

    # Compute pairwise IoU matrix
    unmatched_gold = set(range(len(gold_claims)))
    matches: List[Tuple[int, int, float]] = []

    for ext_idx, ext in enumerate(extracted_claims):
        p_start = float(ext.get("timestamp_start", ext.get("start", 0.0)))
        p_end = float(ext.get("timestamp_end", ext.get("end", 0.0)))

        best_gold_idx = -1
        best_iou = 0.0

        for gold_idx in unmatched_gold:
            g = gold_claims[gold_idx]
            g_start = float(g.get("timestamp_start", g.get("start", 0.0)))
            g_end = float(g.get("timestamp_end", g.get("end", 0.0)))

            iou = calculate_timestamp_iou(p_start, p_end, g_start, g_end)
            if iou > best_iou:
                best_iou = iou
                best_gold_idx = gold_idx

        if best_gold_idx >= 0 and best_iou >= iou_threshold:
            matches.append((ext_idx, best_gold_idx, best_iou))
            unmatched_gold.remove(best_gold_idx)

    matched_count = len(matches)
    mean_iou = sum(m[2] for m in matches) / matched_count if matched_count > 0 else 0.0
    precision_at_iou = matched_count / len(extracted_claims) if extracted_claims else 0.0
    recall_at_iou = matched_count / len(gold_claims) if gold_claims else 0.0

    return {
        "mean_iou": round(mean_iou, 4),
        "precision_at_iou": round(precision_at_iou, 4),
        "recall_at_iou": round(recall_at_iou, 4),
        "matched_claims": matched_count,
        "extracted_count": len(extracted_claims),
        "gold_count": len(gold_claims),
    }
