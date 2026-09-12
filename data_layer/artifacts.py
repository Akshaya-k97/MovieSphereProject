"""
MovieSphere — data_layer.artifacts
----------------------------------
Loads precomputed JSON artifacts produced by the spark_jobs pipeline.
Absence of any artifact is fine — callers fall back to live Pandas.
"""

import json
import os 
from functools import lru_cache


# ----------------------------------------------------------------------
# Runtime toggle — gates whether the API uses ALS output.
# The pipeline can generate artifacts freely; the API only consumes
# them once the operator has explicitly flipped this on after
# verifying the output.
# ----------------------------------------------------------------------

def als_enabled() -> bool:
    """
    True only when the operator has explicitly enabled ALS recommendations.
    Set env var MOVIESPHERE_USE_ALS=1 (or 'true'/'yes') to activate.
    Default: disabled — genre stub stays in effect.
    """
    return os.environ.get("MOVIESPHERE_USE_ALS", "").strip().lower() in ("1", "true", "yes", "on")


_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PROCESSED_DIR = os.path.join(_BASE_DIR, "data", "processed")
MODELS_DIR = os.path.join(_BASE_DIR, "data", "models", "als_output")


def _read_json(path: str):
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


# ----------------------------------------------------------------------
# Analytics
# ----------------------------------------------------------------------
@lru_cache(maxsize=1)
def analytics() -> dict | None:
    return _read_json(os.path.join(PROCESSED_DIR, "analytics.json"))


@lru_cache(maxsize=1)
def analytics_extended() -> dict | None:
    return _read_json(os.path.join(PROCESSED_DIR, "analytics_extended.json"))


def has_analytics() -> bool:
    return analytics() is not None


# ----------------------------------------------------------------------
# Recommendations (ALS output)
# ----------------------------------------------------------------------
@lru_cache(maxsize=1)
def recommendations_map() -> dict | None:
    return _read_json(os.path.join(MODELS_DIR, "recommendations.json"))


@lru_cache(maxsize=1)
def als_meta() -> dict | None:
    return _read_json(os.path.join(MODELS_DIR, "meta.json"))


def has_recommendations() -> bool:
    return recommendations_map() is not None


def recommendations_for(movie_id: int, limit: int = 10) -> list[dict] | None:
    """
    Return [{movieId, score}, ...] or None if this movie isn't in the
    artifacts. Empty list means "artifacts exist but movie unknown".
    """
    recs = recommendations_map()
    if not recs:
        return None
    entries = recs.get(str(int(movie_id)))
    if entries is None:
        return None
    return entries[:limit]

# ----------------------------------------------------------------------
# Per-user recommendations (ALS output)
# ----------------------------------------------------------------------
@lru_cache(maxsize=1)
def user_recommendations_map() -> dict | None:
    return _read_json(os.path.join(MODELS_DIR, "user_recommendations.json"))


def has_user_recommendations() -> bool:
    return user_recommendations_map() is not None


def user_recommendations_for(user_id: int, limit: int = 10) -> list[dict] | None:
    """
    Return [{movieId, score}, ...] for a user, or None if the user is not
    in the model. Empty list means "user exists in model but no recs".
    """
    recs = user_recommendations_map()
    if not recs:
        return None
    entries = recs.get(str(int(user_id)))
    if entries is None:
        return None
    return entries[:limit]


def clear_cache() -> None:
    analytics.cache_clear()
    analytics_extended.cache_clear()
    recommendations_map.cache_clear()
    user_recommendations_map.cache_clear()
    als_meta.cache_clear()