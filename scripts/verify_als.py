"""
MovieSphere — scripts/verify_als.py
-----------------------------------
Pre-flight sanity check for ALS artifacts before flipping the
MOVIESPHERE_USE_ALS env var.

Usage:
    python scripts/verify_als.py

Exit code 0 = pass, 1 = fail.
"""

import json
import os
import random
import sys
from collections import Counter

import numpy as np
import pandas as pd


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "ml-latest-small")
MODELS_DIR = os.path.join(BASE_DIR, "data", "models", "als_output")

RECS_PATH    = os.path.join(MODELS_DIR, "recommendations.json")
USERRECS_PATH = os.path.join(MODELS_DIR, "user_recommendations.json")
META_PATH    = os.path.join(MODELS_DIR, "meta.json")
RATINGS_PATH = os.path.join(DATA_DIR, "ratings.csv")
MOVIES_PATH  = os.path.join(DATA_DIR, "movies.csv")


errors = []
warnings = []


def ok(msg):   print(f"  [OK]   {msg}")
def warn(msg): print(f"  [WARN] {msg}"); warnings.append(msg)
def fail(msg): print(f"  [FAIL] {msg}"); errors.append(msg)


def load_json(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def parse_title(raw):
    import re
    m = re.match(r"^(.*?)\s*\((\d{4})\)\s*$", str(raw).strip())
    return (m.group(1).strip(), int(m.group(2))) if m else (str(raw), 0)


def split_genres(raw):
    if not isinstance(raw, str) or raw == "(no genres listed)":
        return set()
    return {g.strip() for g in raw.split("|") if g.strip()}


# ----------------------------------------------------------------------
# Checks
# ----------------------------------------------------------------------
def check_artifacts_exist():
    print("\n[1] Artifacts exist")
    if not os.path.exists(RECS_PATH):
        fail(f"missing {RECS_PATH}")
    else:
        ok(f"recommendations.json ({os.path.getsize(RECS_PATH) // 1024} KB)")
    if not os.path.exists(USERRECS_PATH):
        fail(f"missing {USERRECS_PATH}")
    else:
        ok(f"user_recommendations.json ({os.path.getsize(USERRECS_PATH) // 1024} KB)")
    if not os.path.exists(META_PATH):
        warn("meta.json missing")
    else:
        meta = load_json(META_PATH)
        ok(f"meta.json — engine={meta.get('engine')}, rank={meta.get('rank')}")


def check_movie_coverage(movies_df, recs):
    print("\n[2] Movie coverage")
    total = len(movies_df)
    covered = len(recs)
    pct = covered / total * 100
    msg = f"{covered}/{total} movies have recommendations ({pct:.1f}%)"
    if pct >= 95:   ok(msg)
    elif pct >= 50: warn(msg + " — below 95% threshold")
    else:           fail(msg + " — below 50% threshold")


def check_user_coverage(ratings_df, user_recs):
    print("\n[3] User coverage")
    total = ratings_df["userId"].nunique()
    covered = len(user_recs)
    pct = covered / total * 100
    msg = f"{covered}/{total} users have recommendations ({pct:.1f}%)"
    if pct >= 95:   ok(msg)
    elif pct >= 50: warn(msg + " — below 95% threshold")
    else:           fail(msg + " — below 50% threshold")


def check_no_self_recursion(recs):
    print("\n[4] No self-recursion")
    bad = 0
    for key, entries in recs.items():
        mid = int(key)
        if any(int(e["movieId"]) == mid for e in entries):
            bad += 1
            if bad <= 3:
                fail(f"movie {mid} recommends itself")
    if bad == 0:
        ok("no movie recommends itself")
    elif bad > 3:
        fail(f"…and {bad - 3} more")


def check_neighbor_sanity(recs, movies_df):
    print("\n[5] Neighbour genre sanity (well-known movies)")
    movies_df = movies_df.copy()
    movies_df["genres_set"] = movies_df["genres"].apply(split_genres)
    movie_genres = dict(zip(movies_df["movieId"], movies_df["genres_set"]))

    known = [1, 2571, 858, 260, 296]  # Toy Story, Matrix, Godfather, Star Wars IV, Pulp Fiction
    passed = 0
    for mid in known:
        if str(mid) not in recs:
            continue
        top3 = recs[str(mid)][:3]
        top3_genres = [movie_genres.get(e["movieId"], set()) for e in top3]
        source_genres = movie_genres.get(mid, set())
        if not source_genres:
            continue
        shared = sum(1 for gs in top3_genres if gs & source_genres)
        if shared >= 2:
            passed += 1
        else:
            warn(f"movie {mid}: only {shared}/3 neighbours share a genre")

    if passed >= 3:
        ok(f"{passed}/{len(known)} sampled movies have genre-coherent neighbours")
    elif passed >= 1:
        warn(f"only {passed}/{len(known)} sampled movies have genre-coherent neighbours")
    else:
        fail("neighbour sanity check failed for all sampled movies")


def check_score_distribution(recs):
    print("\n[6] Score distribution")
    sample_scores = []
    rng = random.Random(1)
    sample_keys = rng.sample(list(recs.keys()), min(500, len(recs)))
    for k in sample_keys:
        for e in recs[k]:
            sample_scores.append(e["score"])
    if not sample_scores:
        fail("no scores found")
        return
    arr = np.array(sample_scores)
    std = float(arr.std())
    lo, hi = float(arr.min()), float(arr.max())
    msg = f"score range [{lo:.3f}, {hi:.3f}], std={std:.4f}"
    if std < 0.005:
        fail(msg + " — scores collapse to a near-constant value")
    elif std < 0.02:
        warn(msg + " — low variance, model may be undertrained")
    else:
        ok(msg)


def check_user_recs_valid(user_recs, movies_df, ratings_df):
    print("\n[7] User recommendations validity")
    valid_ids = set(movies_df["movieId"].astype(int))
    bad_ids = 0
    bad_scores = 0
    total_recs = 0
    for uid, entries in user_recs.items():
        for e in entries:
            total_recs += 1
            if int(e["movieId"]) not in valid_ids:
                bad_ids += 1
            if not (-5.0 <= float(e["score"]) <= 10.0):
                bad_scores += 1
    if bad_ids == 0:
        ok(f"all {total_recs} recommended movieIds exist in movies.csv")
    else:
        fail(f"{bad_ids} recommendations reference unknown movieIds")
    if bad_scores == 0:
        ok("all scores within a sensible numeric range")
    else:
        fail(f"{bad_scores} scores out of expected range")


def check_user_recs_exclude_rated(user_recs, ratings_df):
    print("\n[8] Recommendations exclude already-rated items")
    by_user = ratings_df.groupby("userId")["movieId"].apply(set).to_dict()
    violations = 0
    checked = 0
    rng = random.Random(2)
    sample = rng.sample(list(user_recs.keys()), min(50, len(user_recs)))
    for uid in sample:
        rated = by_user.get(int(uid), set())
        for e in user_recs[uid]:
            checked += 1
            if int(e["movieId"]) in rated:
                violations += 1
    if checked == 0:
        warn("no user recommendations to check")
        return
    pct = violations / checked * 100
    msg = f"{violations}/{checked} recommendations hit already-rated items ({pct:.1f}%)"
    if pct == 0:
        ok(msg)
    elif pct <= 2:
        warn(msg + " — minor leakage, acceptable")
    else:
        fail(msg + " — significant leakage")


def check_personalization(user_recs):
    print("\n[9] Personalisation (different users → different recs)")
    rng = random.Random(3)
    sample_users = rng.sample(list(user_recs.keys()), min(5, len(user_recs)))
    sets = {u: {int(e["movieId"]) for e in user_recs[u][:10]} for u in sample_users}

    jaccards = []
    for i, u1 in enumerate(sample_users):
        for u2 in sample_users[i + 1:]:
            a, b = sets[u1], sets[u2]
            if not (a | b):
                continue
            jaccards.append(len(a & b) / len(a | b))

    if not jaccards:
        warn("could not compute personalisation metric")
        return

    mean_j = sum(jaccards) / len(jaccards)
    msg = f"mean Jaccard overlap across {len(jaccards)} user pairs: {mean_j:.2f}"
    if mean_j <= 0.5:
        ok(msg + " — clear personalisation")
    elif mean_j <= 0.8:
        warn(msg + " — moderate overlap (common for popular items)")
    else:
        fail(msg + " — recommendations are near-identical across users")


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    print("=" * 60)
    print(" MovieSphere — ALS artifact verification")
    print("=" * 60)

    if not (os.path.exists(RECS_PATH) and os.path.exists(USERRECS_PATH)):
        print("\nArtifacts not found. Run the pipeline first:")
        print("  python -m spark_jobs.als_model\n")
        return 1

    recs = load_json(RECS_PATH) or {}
    user_recs = load_json(USERRECS_PATH) or {}
    movies_df = pd.read_csv(MOVIES_PATH)
    ratings_df = pd.read_csv(RATINGS_PATH)

    check_artifacts_exist()
    check_movie_coverage(movies_df, recs)
    check_user_coverage(ratings_df, user_recs)
    check_no_self_recursion(recs)
    check_neighbor_sanity(recs, movies_df)
    check_score_distribution(recs)
    check_user_recs_valid(user_recs, movies_df, ratings_df)
    check_user_recs_exclude_rated(user_recs, ratings_df)
    check_personalization(user_recs)

    print("\n" + "=" * 60)
    if errors:
        print(f" RESULT: FAIL ({len(errors)} errors, {len(warnings)} warnings)")
        for e in errors:
            print(f"   ✗ {e}")
        print("=" * 60)
        return 1
    print(f" RESULT: PASS ({len(warnings)} warnings, 0 errors)")
    if warnings:
        for w in warnings:
            print(f"   ! {w}")
    print("=" * 60)
    print("\nYou may now set MOVIESPHERE_USE_ALS=1 and restart Flask.")
    return 0


if __name__ == "__main__":
    sys.exit(main())