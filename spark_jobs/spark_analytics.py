"""
MovieSphere — spark_jobs.spark_analytics
----------------------------------------
Computes the analytics artifacts consumed by /api/analytics (and reserved
for future /api/analytics* extensions).

Outputs (data/processed/):
    analytics.json           → { kpis: [...] }  (frontend contract)
    analytics_extended.json  → distribution, genres, activity, etc.

Run:
    python -m spark_jobs.spark_analytics                # Spark
    python -m spark_jobs.spark_analytics --engine pandas  # Pandas fallback
"""

import argparse
import json
import os
import re
import time

from .common import DATA_DIR, PROCESSED_DIR, build_spark, ensure_dirs


# ----------------------------------------------------------------------
# Shared parsing helpers (kept identical to data_layer.service)
# ----------------------------------------------------------------------
_TITLE_RE = re.compile(r"^(.*?)\s*\((\d{4})\)\s*$")


def split_title(raw: str):
    if not isinstance(raw, str):
        return str(raw), 0
    m = _TITLE_RE.match(raw.strip())
    if m:
        return m.group(1).strip(), int(m.group(2))
    return raw.strip(), 0


# ======================================================================
# SPARK ENGINE
# ======================================================================
def run_spark() -> dict:
    from pyspark.sql import functions as F
    from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType, LongType

    spark = build_spark("MovieSphere_Analytics")
    spark.sparkContext.setLogLevel("WARN")

    # ---- Load ----
    movies_schema = StructType([
        StructField("movieId", IntegerType(), True),
        StructField("title", StringType(), True),
        StructField("genres", StringType(), True),
    ])
    ratings_schema = StructType([
        StructField("userId", IntegerType(), True),
        StructField("movieId", IntegerType(), True),
        StructField("rating", DoubleType(), True),
        StructField("timestamp", LongType(), True),
    ])

    movies = spark.read.csv(os.path.join(DATA_DIR, "movies.csv"),
                            header=True, schema=movies_schema)
    ratings = spark.read.csv(os.path.join(DATA_DIR, "ratings.csv"),
                             header=True, schema=ratings_schema)

    # ---- KPI aggregates ----
    total_ratings = ratings.count()
    total_movies = movies.count()
    total_users = ratings.select("userId").distinct().count()

    genres_flat = (
        movies
        .withColumn("genre", F.explode(F.split(F.col("genres"), "\\|")))
        .filter(F.col("genre") != "(no genres listed)")
    )
    total_genres = genres_flat.select("genre").distinct().count()

    avg_rating = ratings.agg(F.avg("rating")).collect()[0][0] or 0.0

    kpis = [
        {"key": "ratings", "label": "Ratings Processed",
         "value": int(total_ratings), "icon": "fa-database"},
        {"key": "movies", "label": "Movies",
         "value": int(total_movies), "icon": "fa-film"},
        {"key": "users", "label": "Users",
         "value": int(total_users), "icon": "fa-users"},
        {"key": "genres", "label": "Genres",
         "value": int(total_genres), "icon": "fa-tags"},
    ]

    # ---- Extended aggregations ----
    # Rating distribution (5..1)
    dist_rows = (
        ratings
        .withColumn("bucket", F.round("rating").cast("int"))
        .groupBy("bucket").count().collect()
    )
    dist_map = {int(r["bucket"]): int(r["count"]) for r in dist_rows}
    rating_distribution = [dist_map.get(s, 0) for s in (5, 4, 3, 2, 1)]

    # Movies per genre
    by_genre = (
        genres_flat.groupBy("genre").count()
        .orderBy(F.desc("count")).limit(10).collect()
    )
    movies_by_genre = [{"genre": r["genre"], "count": int(r["count"])} for r in by_genre]

    # Average rating per genre
    avg_by_genre = (
        ratings
        .join(movies, on="movieId", how="inner")
        .withColumn("genre", F.explode(F.split(F.col("genres"), "\\|")))
        .filter(F.col("genre") != "(no genres listed)")
        .groupBy("genre")
        .agg(F.avg("rating").alias("avg_rating"),
             F.count("rating").alias("n"))
        .filter(F.col("n") >= 20)
        .orderBy(F.desc("avg_rating"))
        .limit(10).collect()
    )
    avg_rating_by_genre = [
        {"genre": r["genre"], "avgRating": round(float(r["avg_rating"]), 2)}
        for r in avg_by_genre
    ]

    # Most-rated movies
    most_rated = (
        ratings.groupBy("movieId").count()
        .orderBy(F.desc("count")).limit(10)
        .join(movies, on="movieId", how="inner")
        .select("movieId", "title", "count")
        .collect()
    )
    most_rated_movies = [
        {"id": int(r["movieId"]), "title": r["title"], "ratingsCount": int(r["count"])}
        for r in most_rated
    ]

    # Rating activity by month
    activity = (
        ratings
        .withColumn("month", F.date_format(F.to_timestamp(F.col("timestamp")), "yyyy-MM"))
        .groupBy("month").count()
        .orderBy("month").collect()
    )
    rating_activity = [{"month": r["month"], "count": int(r["count"])} for r in activity]

    spark.stop()

    return {
        "analytics": {"kpis": kpis},
        "extended": {
            "averageRating": round(float(avg_rating), 3),
            "ratingDistribution": rating_distribution,   # [5★, 4★, 3★, 2★, 1★]
            "moviesByGenre": movies_by_genre,
            "avgRatingByGenre": avg_rating_by_genre,
            "mostRatedMovies": most_rated_movies,
            "ratingActivity": rating_activity,
        },
    }


# ======================================================================
# PANDAS FALLBACK ENGINE  (identical output, no Java required)
# ======================================================================
def run_pandas() -> dict:
    import pandas as pd

    movies = pd.read_csv(os.path.join(DATA_DIR, "movies.csv"))
    ratings = pd.read_csv(os.path.join(DATA_DIR, "ratings.csv"))

    genres_flat = (
        movies.assign(genre=movies["genres"].str.split("|"))
        .explode("genre")
        .query("genre != '(no genres listed)'")
    )

    kpis = [
        {"key": "ratings", "label": "Ratings Processed",
         "value": int(len(ratings)), "icon": "fa-database"},
        {"key": "movies", "label": "Movies",
         "value": int(len(movies)), "icon": "fa-film"},
        {"key": "users", "label": "Users",
         "value": int(ratings["userId"].nunique()), "icon": "fa-users"},
        {"key": "genres", "label": "Genres",
         "value": int(genres_flat["genre"].nunique()), "icon": "fa-tags"},
    ]

    buckets = ratings["rating"].round().astype(int)
    dist_map = buckets.value_counts().to_dict()
    rating_distribution = [int(dist_map.get(s, 0)) for s in (5, 4, 3, 2, 1)]

    movies_by_genre = [
        {"genre": g, "count": int(c)}
        for g, c in genres_flat["genre"].value_counts().head(10).items()
    ]

    merged = ratings.merge(movies, on="movieId", how="inner")
    merged = merged.assign(genre=merged["genres"].str.split("|")).explode("genre")
    merged = merged[merged["genre"] != "(no genres listed)"]
    avg_g = (
        merged.groupby("genre")
        .agg(avg_rating=("rating", "mean"), n=("rating", "count"))
        .query("n >= 20")
        .sort_values("avg_rating", ascending=False)
        .head(10)
    )
    avg_rating_by_genre = [
        {"genre": g, "avgRating": round(float(row["avg_rating"]), 2)}
        for g, row in avg_g.iterrows()
    ]

    top = (
        ratings.groupby("movieId").size().sort_values(ascending=False)
        .head(10).reset_index(name="count")
        .merge(movies, on="movieId", how="inner")
    )
    most_rated_movies = [
        {"id": int(r["movieId"]), "title": r["title"], "ratingsCount": int(r["count"])}
        for _, r in top.iterrows()
    ]

    ratings["month"] = pd.to_datetime(ratings["timestamp"], unit="s").dt.strftime("%Y-%m")
    activity = ratings.groupby("month").size().sort_index()
    rating_activity = [{"month": m, "count": int(c)} for m, c in activity.items()]

    return {
        "analytics": {"kpis": kpis},
        "extended": {
            "averageRating": round(float(ratings["rating"].mean()), 3),
            "ratingDistribution": rating_distribution,
            "moviesByGenre": movies_by_genre,
            "avgRatingByGenre": avg_rating_by_genre,
            "mostRatedMovies": most_rated_movies,
            "ratingActivity": rating_activity,
        },
    }


# ======================================================================
# MAIN
# ======================================================================
def write_artifacts(payload: dict) -> None:
    ensure_dirs()
    with open(os.path.join(PROCESSED_DIR, "analytics.json"), "w") as f:
        json.dump(payload["analytics"], f, indent=2)
    with open(os.path.join(PROCESSED_DIR, "analytics_extended.json"), "w") as f:
        json.dump(payload["extended"], f, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=["spark", "pandas"], default="spark")
    args = parser.parse_args()

    started = time.time()
    print(f"[spark_analytics] engine={args.engine}  data_dir={DATA_DIR}")

    payload = run_spark() if args.engine == "spark" else run_pandas()
    write_artifacts(payload)

    elapsed = time.time() - started
    print(f"[spark_analytics] wrote analytics.json + analytics_extended.json in {elapsed:.1f}s")
    print(f"[spark_analytics] kpis = {payload['analytics']['kpis']}")


if __name__ == "__main__":
    main()