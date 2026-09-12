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
# Relative match normalisation
# ----------------------------------------------------------------------
MATCH_LO = 60
MATCH_HI = 95


def _attach_relative_match(items: list[dict], lo: int = MATCH_LO, hi: int = MATCH_HI) -> list[dict]:
    """
    Attach a *relative* 'match' percentage to a batch of recommendations.

    The match is derived by min-max normalising the raw ALS scores
    WITHIN the returned batch, mapped to [lo, hi]. It reflects how the
    top recommendation compares to the others in this batch — it is
    NOT a probability, accuracy, or absolute confidence score.

    If all scores are equal, every item receives the batch mid-point.
    """
    if not items:
        return []
    scores = [it["score"] for it in items]
    smin, smax = min(scores), max(scores)
    span = smax - smin
    out = []
    for it in items:
        ratio = 0.5 if span <= 1e-9 else (it["score"] - smin) / span
        match = round(lo + ratio * (hi - lo))
        out.append({**it, "match": int(match)})
    return out

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

def user_recommendations(user_id: int, limit: int = 10) -> list[dict] | None:
    """
    Personalized recommendations for a user, sourced from ALS output.

    Returns None when:
      • the ALS gate is off (MOVIESPHERE_USE_ALS not set), or
      • the user is not present in user_recommendations.json (cold start).

    Callers translate None into HTTP 404 so the frontend can fall back.
    """
    if not artifacts.als_enabled():
        return None

    rec_items = artifacts.user_recommendations_for(user_id, limit=limit)
    if not rec_items:
        return None

    df = movies_df()
    present = set(df["movieId"].values)
    score_by_id = {int(it["movieId"]): it["score"] for it in rec_items}
    ordered_ids = [mid for mid in score_by_id if mid in present]
    if not ordered_ids:
        return None

    ordered_df = df.set_index("movieId").loc[ordered_ids].reset_index()
    movies = [_row_to_movie(row) for _, row in ordered_df.iterrows()]
    for m in movies:
        m["score"] = score_by_id[m["id"]]

    movies = _attach_relative_match(movies)
    for m in movies:
        m.pop("score", None)
    return movies

# ----------------------------------------------------------------------
# Recommendations — NON-ML STUB (keeps UI coherent with real data)
# ----------------------------------------------------------------------
def recommendations(movie_id: int, limit: int = 10) -> list[dict] | None:
    """
    Tier 1: precomputed ALS item-item artifacts (opt-in via MOVIESPHERE_USE_ALS).
            Response includes a relative 'match' field derived from ALS scores.
    Tier 2: Phase 6A genre-similarity stub — no 'match' field, so the
            frontend's heuristic is used. Byte-identical to the Phase 6A
            contract.

    Returns the same movie-object shape either way.
    """
    df = movies_df()
    match = df[df["movieId"] == movie_id]
    if match.empty:
        return None

    # --- Tier 1: ALS artifacts (opt-in) ---
    if artifacts.als_enabled():
        rec_items = artifacts.recommendations_for(movie_id, limit=limit)
        if rec_items:
            present = set(df["movieId"].values)
            score_by_id = {int(it["movieId"]): it["score"] for it in rec_items}
            ordered_ids = [mid for mid in score_by_id if mid in present]

            if ordered_ids:
                ordered_df = df.set_index("movieId").loc[ordered_ids].reset_index()
                movies = [_row_to_movie(row) for _, row in ordered_df.iterrows()]
                for m in movies:
                    m["score"] = score_by_id[m["id"]]

                movies = _attach_relative_match(movies)
                # Strip the raw ALS score — kept internal, not exposed.
                for m in movies:
                    m.pop("score", None)
                return movies

    # --- Tier 2: Phase 6A genre-similarity stub ---
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