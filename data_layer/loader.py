"""
MovieSphere — data_layer.loader
--------------------------------
Reads MovieLens CSVs with Pandas and caches them for the process lifetime.

Replaceable by PySpark:
    The public functions here (movies, ratings, tags) return DataFrames.
    A future Spark implementation only needs to return equivalent DataFrames.
"""

import os
from functools import lru_cache

import pandas as pd


_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Override with env var MOVIELENS_DIR=/path/to/dataset if needed.
DATA_DIR = os.environ.get(
    "MOVIELENS_DIR",
    os.path.join(_BASE_DIR, "data", "ml-latest-small"),
)


def _path(filename: str) -> str:
    return os.path.join(DATA_DIR, filename)


def data_available() -> bool:
    """True only when both required CSVs exist."""
    return os.path.exists(_path("movies.csv")) and os.path.exists(_path("ratings.csv"))


@lru_cache(maxsize=1)
def movies() -> pd.DataFrame:
    """MovieLens movies.csv — columns: movieId, title, genres."""
    return pd.read_csv(_path("movies.csv"))


@lru_cache(maxsize=1)
def ratings() -> pd.DataFrame:
    """MovieLens ratings.csv — columns: userId, movieId, rating, timestamp."""
    return pd.read_csv(_path("ratings.csv"))


@lru_cache(maxsize=1)
def tags() -> pd.DataFrame:
    """MovieLens tags.csv — optional. Empty DataFrame if not present."""
    p = _path("tags.csv")
    if os.path.exists(p):
        return pd.read_csv(p)
    return pd.DataFrame(columns=["userId", "movieId", "tag", "timestamp"])


def clear_cache() -> None:
    """Call after replacing CSVs on disk to force a reload."""
    movies.cache_clear()
    ratings.cache_clear()
    tags.cache_clear()

def processed_dir() -> str:
    import os
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "data", "processed")