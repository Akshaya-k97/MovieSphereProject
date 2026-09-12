"""
MovieSphere — spark_jobs.als_model
----------------------------------
Trains ALS on the ratings matrix and derives:
  1. Item-item similarity from learned item factors
     → data/models/als_output/recommendations.json
  2. Per-user top-N recommendations
     → data/models/als_output/user_recommendations.json

Run:
    python -m spark_jobs.als_model                  # Spark
    python -m spark_jobs.als_model --engine pandas  # SVD fallback
"""

import argparse
import json
import os
import time

import numpy as np

from .common import DATA_DIR, MODELS_DIR, build_spark, ensure_dirs


# ----------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------
RANK = 50
MAX_ITER = 10
REG_PARAM = 0.1
TOP_N = 20          # similar movies / recommendations stored per key


# ======================================================================
# SPARK ENGINE
# ======================================================================
def run_spark() -> dict:
    from pyspark.ml.recommendation import ALS
    from pyspark.sql.types import StructType, StructField, IntegerType, DoubleType, LongType

    spark = build_spark("MovieSphere_ALS")
    spark.sparkContext.setLogLevel("WARN")

    ratings_schema = StructType([
        StructField("userId", IntegerType(), True),
        StructField("movieId", IntegerType(), True),
        StructField("rating", DoubleType(), True),
        StructField("timestamp", LongType(), True),
    ])

    ratings = spark.read.csv(os.path.join(DATA_DIR, "ratings.csv"),
                             header=True, schema=ratings_schema)

    # ---- Train ----
    als = ALS(
        userCol="userId", itemCol="movieId", ratingCol="rating",
        rank=RANK, maxIter=MAX_ITER, regParam=REG_PARAM,
        coldStartStrategy="drop", nonnegative=True, implicitPrefs=False,
        seed=42,
    )
    model = als.fit(ratings)
    model.write().overwrite().save(os.path.join(MODELS_DIR, "als_model"))

    # ---- Item factors (for movie-to-movie similarity) ----
    item_rows = model.itemFactors.collect()
    movie_ids = np.array([r["id"] for r in item_rows], dtype=np.int64)
    F = np.array([r["features"].toArray() for r in item_rows], dtype=np.float32)

    # ---- Per-user recommendations (Spark computes natively) ----
    user_recs_rows = model.recommendForAllUsers(TOP_N).collect()
    user_recs: dict[str, list[dict]] = {}
    for row in user_recs_rows:
        uid = int(row["userId"])
        user_recs[str(uid)] = [
            {"movieId": int(r["movieId"]), "score": round(float(r["rating"]), 4)}
            for r in row["recommendations"]
        ]

    spark.stop()

    return _write_artifacts(movie_ids, F, engine="spark", user_recs=user_recs)


# ======================================================================
# PANDAS / SVD FALLBACK
# ======================================================================
def run_pandas() -> dict:
    import pandas as pd
    from scipy.sparse import csr_matrix
    from sklearn.decomposition import TruncatedSVD

    ratings = pd.read_csv(os.path.join(DATA_DIR, "ratings.csv"))

    user_ids, user_index = np.unique(ratings["userId"].values, return_inverse=True)
    movie_ids, item_index = np.unique(ratings["movieId"].values, return_inverse=True)

    matrix = csr_matrix(
        (ratings["rating"].values.astype(np.float32), (user_index, item_index)),
        shape=(len(user_ids), len(movie_ids)),
    )

    svd = TruncatedSVD(n_components=RANK, random_state=42)
    user_factors = svd.fit_transform(matrix).astype(np.float32)   # (n_users, rank)
    item_factors = svd.components_.T.astype(np.float32)           # (n_items, rank)

    # ---- Per-user recommendations ----
    # Score every (user, item) pair, mask already-rated items, keep top-N.
    scores = user_factors @ item_factors.T                        # (n_users, n_items)
    rated_mask = (matrix != 0).toarray()                          # bool (n_users, n_items)
    scores[rated_mask] = -np.inf

    top_k = min(TOP_N, len(movie_ids) - 1)
    top_idx = np.argpartition(-scores, top_k, axis=1)[:, :top_k]
    top_scores = np.take_along_axis(scores, top_idx, axis=1)
    order = np.argsort(-top_scores, axis=1)
    top_idx = np.take_along_axis(top_idx, order, axis=1)
    top_scores = np.take_along_axis(top_scores, order, axis=1)

    user_recs: dict[str, list[dict]] = {}
    for i, uid in enumerate(user_ids):
        entries = []
        for j, s in zip(top_idx[i], top_scores[i]):
            if not np.isfinite(s):
                continue
            entries.append({
                "movieId": int(movie_ids[j]),
                "score": round(float(s), 4),
            })
        user_recs[str(int(uid))] = entries

    return _write_artifacts(movie_ids, item_factors, engine="pandas", user_recs=user_recs)


# ======================================================================
# SHARED WRITER
# ======================================================================
def _write_artifacts(
    movie_ids: np.ndarray,
    F: np.ndarray,
    engine: str,
    user_recs: dict | None = None,
) -> dict:
    ensure_dirs()

    # ---- Movie-movie similarity via cosine on item factors ----
    norms = np.linalg.norm(F, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    Fn = F / norms
    S = Fn @ Fn.T
    np.fill_diagonal(S, -np.inf)

    top_k = min(TOP_N, len(movie_ids) - 1)
    top_idx = np.argpartition(-S, top_k, axis=1)[:, :top_k]
    top_scores = np.take_along_axis(S, top_idx, axis=1)
    order = np.argsort(-top_scores, axis=1)
    top_idx = np.take_along_axis(top_idx, order, axis=1)
    top_scores = np.take_along_axis(top_scores, order, axis=1)

    movie_recs = {}
    for i, movie_id in enumerate(movie_ids):
        movie_recs[str(int(movie_id))] = [
            {"movieId": int(movie_ids[j]), "score": round(float(s), 4)}
            for j, s in zip(top_idx[i], top_scores[i])
        ]

    with open(os.path.join(MODELS_DIR, "recommendations.json"), "w") as f:
        json.dump(movie_recs, f)

    has_user_recs = False
    if user_recs:
        with open(os.path.join(MODELS_DIR, "user_recommendations.json"), "w") as f:
            json.dump(user_recs, f)
        has_user_recs = True

    meta = {
        "engine": engine,
        "rank": RANK,
        "maxIter": MAX_ITER if engine == "spark" else None,
        "regParam": REG_PARAM if engine == "spark" else None,
        "topN": TOP_N,
        "movies": int(len(movie_ids)),
        "has_user_recs": has_user_recs,
        "userCount": len(user_recs) if user_recs else 0,
        "generatedAt": int(time.time()),
    }
    with open(os.path.join(MODELS_DIR, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"[als_model] engine={engine}  movies={len(movie_ids)}  "
          f"users={len(user_recs) if user_recs else 0}  top_n={TOP_N}")
    print("[als_model] wrote recommendations.json"
          + (" + user_recommendations.json" if has_user_recs else "")
          + " + meta.json")

    return meta


# ======================================================================
# MAIN
# ======================================================================
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=["spark", "pandas"], default="spark")
    args = parser.parse_args()

    print(f"[als_model] engine={args.engine}  data_dir={DATA_DIR}")
    if args.engine == "spark":
        run_spark()
    else:
        run_pandas()


if __name__ == "__main__":
    main()