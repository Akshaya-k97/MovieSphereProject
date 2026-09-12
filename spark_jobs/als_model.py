"""
MovieSphere — spark_jobs.als_model
----------------------------------
Trains an ALS model on the ratings matrix and derives item-item
recommendations from the learned item factors.

Output (data/models/als_output/):
    recommendations.json   → { "<movieId>": [{"movieId": N, "score": S}, ...] }
    meta.json              → model hyperparameters + counts
    als_model/             → Spark ALS model (only when --engine spark)

This is NOT yet wired into /api/recommendations by default — service.py
prefers it automatically once recommendations.json exists.

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
TOP_N = 20          # similar movies stored per input movie


# ======================================================================
# SPARK ENGINE
# ======================================================================
def run_spark() -> dict:
    from pyspark.ml.recommendation import ALS
    from pyspark.sql import functions as F
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

    # ---- Train ALS ----
    als = ALS(
        userCol="userId", itemCol="movieId", ratingCol="rating",
        rank=RANK, maxIter=MAX_ITER, regParam=REG_PARAM,
        coldStartStrategy="drop", nonnegative=True, implicitPrefs=False,
        seed=42,
    )
    model = als.fit(ratings)

    # Save the Spark model alongside the JSON output
    model_path = os.path.join(MODELS_DIR, "als_model")
    model.write().overwrite().save(model_path)

    # ---- Extract item factors ----
    item_factors = model.itemFactors.collect()   # [Row(id=movieId, features=DenseVector)]
    movie_ids = np.array([row["id"] for row in item_factors], dtype=np.int64)
    F = np.array([row["features"].toArray() for row in item_factors], dtype=np.float32)

    spark.stop()

    return _write_from_factors(movie_ids, F, engine="spark")


# ======================================================================
# PANDAS / SVD FALLBACK
# ======================================================================
def run_pandas() -> dict:
    """
    Truncated-SVD on the mean-centered rating matrix as a surrogate
    for ALS item factors. Used only when PySpark is unavailable.
    """
    import pandas as pd
    from scipy.sparse import csr_matrix
    from sklearn.decomposition import TruncatedSVD

    ratings = pd.read_csv(os.path.join(DATA_DIR, "ratings.csv"))

    user_ids, user_index = np.unique(ratings["userId"].values, return_inverse=True)
    movie_ids, item_index = np.unique(ratings["movieId"].values, return_inverse=True)

    rows = user_index
    cols = item_index
    vals = ratings["rating"].values.astype(np.float32)

    matrix = csr_matrix((vals, (rows, cols)),
                        shape=(len(user_ids), len(movie_ids)))

    svd = TruncatedSVD(n_components=RANK, random_state=42)
    svd.fit(matrix)

    # Item factors live in svd.components_.T  (n_items x rank)
    F = svd.components_.T.astype(np.float32)

    return _write_from_factors(movie_ids, F, engine="pandas")


# ======================================================================
# SHARED: item-item cosine similarity + artifact write
# ======================================================================
def _write_from_factors(movie_ids: np.ndarray, F: np.ndarray, engine: str) -> dict:
    ensure_dirs()

    # L2-normalise rows so dot product == cosine similarity
    norms = np.linalg.norm(F, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    Fn = F / norms

    # Full similarity matrix. 9K x 9K floats = ~324 MB @ float32.
    # For larger catalogues, replace this block with a Spark windowed
    # top-N per item (documented in the module docstring).
    S = Fn @ Fn.T
    np.fill_diagonal(S, -np.inf)

    top_k = min(TOP_N, len(movie_ids) - 1)
    top_idx = np.argpartition(-S, top_k, axis=1)[:, :top_k]
    top_scores = np.take_along_axis(S, top_idx, axis=1)

    # Sort each row's top-K by score descending
    order = np.argsort(-top_scores, axis=1)
    top_idx = np.take_along_axis(top_idx, order, axis=1)
    top_scores = np.take_along_axis(top_scores, order, axis=1)

    recs = {}
    for i, movie_id in enumerate(movie_ids):
        recs[str(int(movie_id))] = [
            {"movieId": int(movie_ids[j]), "score": round(float(s), 4)}
            for j, s in zip(top_idx[i], top_scores[i])
        ]

    with open(os.path.join(MODELS_DIR, "recommendations.json"), "w") as f:
        json.dump(recs, f)

    meta = {
        "engine": engine,
        "rank": RANK,
        "maxIter": MAX_ITER if engine == "spark" else None,
        "regParam": REG_PARAM if engine == "spark" else None,
        "topN": TOP_N,
        "movies": int(len(movie_ids)),
        "generatedAt": int(time.time()),
    }
    with open(os.path.join(MODELS_DIR, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"[als_model] engine={engine}  movies={len(movie_ids)}  top_n={TOP_N}")
    print(f"[als_model] wrote recommendations.json + meta.json")

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