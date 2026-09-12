#!/usr/bin/env bash
# MovieSphere — run the analytics + ALS pipeline.
#
# Usage:
#   bash scripts/run_pipeline.sh               # Spark engine
#   bash scripts/run_pipeline.sh --engine pandas
#
set -euo pipefail

ENGINE="${1:-}"
if [[ "$ENGINE" == "--engine" ]]; then
  shift
  ENGINE="$1"
else
  ENGINE="spark"
fi

echo "==================================================="
echo " MovieSphere pipeline  —  engine: ${ENGINE}"
echo "==================================================="

echo
echo "[1/2] Analytics → data/processed/"
python -m spark_jobs.spark_analytics --engine "$ENGINE"

echo
echo "[2/2] ALS model → data/models/als_output/"
python -m spark_jobs.als_model --engine "$ENGINE"

echo
echo "Done. Restart Flask to pick up artifacts (Flask caches on import)."