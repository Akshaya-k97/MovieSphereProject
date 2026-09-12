"""
MovieSphere — spark_jobs.common
Shared Spark session builder and file path helpers.
"""

import os
from pyspark.sql import SparkSession


_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get(
    "MOVIELENS_DIR",
    os.path.join(_BASE_DIR, "data", "ml-latest-small"),
)
PROCESSED_DIR = os.path.join(_BASE_DIR, "data", "processed")
MODELS_DIR = os.path.join(_BASE_DIR, "data", "models", "als_output")


def ensure_dirs() -> None:
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)


def build_spark(app_name: str) -> SparkSession:
    """
    Local Spark session tuned for the MovieLens-small dataset.
    Override master with SPARK_MASTER env var for cluster runs later.
    """
    return (
        SparkSession.builder
        .appName(app_name)
        .master(os.environ.get("SPARK_MASTER", "local[*]"))
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.driver.memory", os.environ.get("SPARK_DRIVER_MEM", "2g"))
        .config("spark.ui.showConsoleProgress", "false")
        .getOrCreate()
    )