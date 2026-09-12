"""
MovieSphere — data_layer.service
--------------------------------
Business logic over the MovieLens DataFrames. Produces JSON-ready
Python structures that match the existing frontend contracts.

IMPORTANT — this is a *stub* recommendation function:
    `recommendations()` returns genre-similar popular movies, NOT
    collaborative-filtering output. It exists so that the
    Recommendations page stays coherent with real data while the
    ALS model is out of scope for Phase 6A.
"""

import re
from functools import lru_cache

import numpy as np
import pandas as pd

from . import loader
from . import artifacts


# ----------------------------------------------------------------------
# Title / genre parsing
# ----------------------------------------------------------------------
_TITLE_RE = re.compile(r"^(.*?)\s*\((\d{4})\)\s*$")


def _split_title(raw) -> tuple[str, int]:
    """'Toy Story (1995)' -> ('Toy Story', 1995). Fallback year = 0."""
    if not isinstance(raw, str):
        return str(raw), 0
    m = _TITLE_RE.match(raw.strip())
    if m:
        return m.group(1).strip(), int(m.group(2))
    return raw.strip(), 0


def _split_genres(raw) -> list[str]:
    if not isinstance(raw, str) or raw == "(no genres listed)":
        return []
    return [g.strip() for g in raw.split("|") if g.strip()]


# ----------------------------------------------------------------------
# Enriched movies view
# ----------------------------------------------------------------------
@lru_cache(maxsize=1)
def movies_df() -> pd.DataFrame:
    """
    Merged movies + ratings aggregates. Columns:
        movieId, title, genres, clean_title, year, genres_list,
        avg_rating, ratings_count, popularity
    """
    m = loader.movies()
    r = loader.ratings()

    agg = (
        r.groupby("movieId")
        .agg(avg_rating=("rating", "mean"), ratings_count=("rating", "count"))
        .reset_index()
    )

    df = m.merge(agg, on="movieId", how="left")
    df["avg_rating"] = df["avg_rating"].fillna(0.0).round(2)
    df["ratings_count"] = df["ratings_count"].fillna(0).astype(int)

    # Popularity: log-scaled ratings_count -> 0..100
    counts = df["ratings_count"].to_numpy(dtype=float)
    if counts.max() > 0:
        pop = np.log1p(counts) / np.log1p(counts.max()) * 100.0
    else:
        pop = np.zeros_like(counts)
    df["popularity"] = pop.round(0).astype(int)

    parsed = df["title"].apply(_split_title)
    df["clean_title"] = parsed.apply(lambda t: t[0])
    df["year"] = parsed.apply(lambda t: t[1])
    df["genres_list"] = df["genres"].apply(_split_genres)

    return df


def _row_to_movie(row) -> dict:
    """Shape a movies_df row into the JSON object the frontend expects."""
    return {
        "id": int(row["movieId"]),
        "title": row["clean_title"],
        "year": int(row["year"]) if row["year"] else 0,
        "rating": float(row["avg_rating"]),
        "ratingsCount": int(row["ratings_count"]),
        "popularity": int(row["popularity"]),
        "genres": list(row["genres_list"]),
    }


# ----------------------------------------------------------------------
# Movie queries
# ----------------------------------------------------------------------
def all_movies(limit: int | None = None) -> list[dict]:
    df = movies_df()
    if limit is not None:
        df = df.head(limit)
    return [_row_to_movie(row) for _, row in df.iterrows()]


def get_movie(movie_id: int) -> dict | None:
    df = movies_df()
    match = df[df["movieId"] == movie_id]
    if match.empty:
        return None
    return _row_to_movie(match.iloc[0])


def search_movies(query: str, limit: int = 20) -> list[dict]:
    if not query:
        return []
    df = movies_df()
    q = re.escape(query.lower().strip())
    matches = df[df["clean_title"].str.lower().str.contains(q, na=False, regex=True)]
    matches = matches.sort_values("ratings_count", ascending=False).head(limit)
    return [_row_to_movie(row) for _, row in matches.iterrows()]


# ----------------------------------------------------------------------
# Analytics
# ----------------------------------------------------------------------
def analytics_kpis() -> dict:
    """
    Prefer precomputed artifacts from spark_jobs.spark_analytics.
    Fall back to live Pandas aggregation (Phase 6A behavior).
    """
    pre = artifacts.analytics()
    if pre and isinstance(pre.get("kpis"), list) and pre["kpis"]:
        return pre

    # --- Phase 6A fallback ---
    m = movies_df()
    r = loader.ratings()

    total_ratings = int(len(r))
    total_movies = int(len(m))
    total_users = int(r["userId"].nunique())

    exploded = m["genres_list"].explode().dropna()
    total_genres = int(exploded.nunique()) if len(exploded) else 0

    return {
        "kpis": [
            {"key": "ratings", "label": "Ratings Processed", "value": total_ratings, "icon": "fa-database"},
            {"key": "movies",  "label": "Movies",            "value": total_movies,  "icon": "fa-film"},
            {"key": "users",   "label": "Users",             "value": total_users,   "icon": "fa-users"},
            {"key": "genres",  "label": "Genres",            "value": total_genres,  "icon": "fa-tags"},
        ]
    }


# ----------------------------------------------------------------------
# Per-user insights
# ----------------------------------------------------------------------
def user_insights(user_id: int) -> dict | None:
    r = loader.ratings()
    m = movies_df()

    user_r = r[r["userId"] == user_id]
    if user_r.empty:
        return None

    rated = user_r.merge(
        m[["movieId", "clean_title", "genres_list", "year"]],
        on="movieId",
        how="left",
    )

    movies_rated = int(len(rated))
    avg_rating = round(float(user_r["rating"].mean()), 2)

    # Genre frequency across the user's rated movies
    genre_counts: dict[str, int] = {}
    for genres in rated["genres_list"]:
        for g in (genres or []):
            genre_counts[g] = genre_counts.get(g, 0) + 1

    sorted_genres = sorted(genre_counts.items(), key=lambda kv: kv[1], reverse=True)
    favorite = sorted_genres[0][0] if sorted_genres else "N/A"
    most_active = sorted_genres[1][0] if len(sorted_genres) > 1 else favorite

    favorite_genres = [{"genre": g, "count": c} for g, c in sorted_genres[:6]]

    # Rating behaviour: index 0 = 5★, index 4 = 1★
    behaviour = [0, 0, 0, 0, 0]
    for rating in user_r["rating"]:
        idx = int(round(float(rating)))
        if 1 <= idx <= 5:
            behaviour[5 - idx] += 1

    return {
        "userId": int(user_id),
        "displayName": f"User #{user_id}",
        "moviesRated": movies_rated,
        "avgRating": avg_rating,
        "favoriteGenre": favorite,
        "mostActiveGenre": most_active,
        "favoriteGenres": favorite_genres,
        "ratingBehaviour": behaviour,
    }


# ----------------------------------------------------------------------
# Recommendations — NON-ML STUB (keeps UI coherent with real data)
# ----------------------------------------------------------------------
def recommendations(movie_id: int, limit: int = 10) -> list[dict] | None:
    """
    Tier 1: precomputed ALS artifacts — ONLY if MOVIESPHERE_USE_ALS is set.
            This gate exists so that generating ALS output (6B.1) does not
            automatically alter the API behavior. The switch happens in 6B.2
            after the ALS pipeline has been verified.
    Tier 2: Phase 6A genre-similarity stub — default behavior.

    Returns the same JSON shape either way.
    """
    df = movies_df()
    match = df[df["movieId"] == movie_id]
    if match.empty:
        return None

    # --- Tier 1: ALS artifacts (opt-in) ---
    if artifacts.als_enabled():
        rec_items = artifacts.recommendations_for(movie_id, limit=limit)
        if rec_items:
            movie_ids = [int(it["movieId"]) for it in rec_items]
            present = set(df["movieId"].values)
            ordered_ids = [m for m in movie_ids if m in present]
            if ordered_ids:
                ordered_df = df.set_index("movieId").loc[ordered_ids].reset_index()
                return [_row_to_movie(row) for _, row in ordered_df.iterrows()]

    # --- Tier 2: Phase 6A genre-similarity stub (default) ---
    input_genres = set(match.iloc[0]["genres_list"])

    if input_genres:
        mask = df["genres_list"].apply(lambda gs: bool(set(gs) & input_genres))
        pool = df[mask & (df["movieId"] != movie_id)]
    else:
        pool = df[df["movieId"] != movie_id]

    if pool.empty:
        pool = df[df["movieId"] != movie_id]

    top = pool.sort_values(
        by=["popularity", "avg_rating"], ascending=[False, False]
    ).head(limit)

    return [_row_to_movie(row) for _, row in top.iterrows()]