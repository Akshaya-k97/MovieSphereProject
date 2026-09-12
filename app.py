"""
MovieSphere — Flask application
Phase 6A: real MovieLens data served via Pandas.
"""

from flask import Flask, render_template, jsonify, request

from data_layer import loader as data_loader
from data_layer import service as data_service
from data_layer import artifacts as data_artifacts

app = Flask(__name__)


# ======================================================================
# PAGE ROUTES  (unchanged from Phase 5)
# ======================================================================
@app.route("/")
def home():
    return render_template("index.html")


@app.route("/explore")
def explore():
    return render_template("explore.html")


@app.route("/movie/<int:movie_id>")
def movie_page(movie_id):
    return render_template("movie.html", movie_id=movie_id)


@app.route("/recommendations")
def recommendations_page():
    return render_template("recommendations.html")


@app.route("/analytics")
def analytics_page():
    return render_template("analytics.html")


@app.route("/cloud")
def cloud_page():
    return render_template("cloud.html")


@app.route("/about")
def about_page():
    return render_template("about.html")


@app.route("/user")
def user_page():
    return render_template("user.html")


# ======================================================================
# API ROUTES  (Phase 6A)
# ======================================================================
def _dataset_unavailable():
    return jsonify({"error": "dataset_unavailable"}), 503


@app.route("/api/movies")
def api_movies():
    if not data_loader.data_available():
        return _dataset_unavailable()
    return jsonify(data_service.all_movies())


@app.route("/api/movies/search")
def api_movies_search():
    if not data_loader.data_available():
        return _dataset_unavailable()
    q = request.args.get("q", "")
    return jsonify(data_service.search_movies(q, limit=20))


@app.route("/api/movies/<int:movie_id>")
def api_movie_details(movie_id):
    if not data_loader.data_available():
        return _dataset_unavailable()
    movie = data_service.get_movie(movie_id)
    if movie is None:
        return jsonify({"error": "not_found"}), 404
    return jsonify(movie)


@app.route("/api/analytics")
def api_analytics():
    if not data_loader.data_available():
        return _dataset_unavailable()
    return jsonify(data_service.analytics_kpis())


@app.route("/api/user/<int:user_id>/insights")
def api_user_insights(user_id):
    if not data_loader.data_available():
        return _dataset_unavailable()
    insights = data_service.user_insights(user_id)
    if insights is None:
        return jsonify({"error": "user_not_found"}), 404
    return jsonify(insights)


@app.route("/api/recommendations/<int:movie_id>")
def api_recommendations(movie_id):
    """
    Phase 6A: genre-based stub so the Recommendations page shows real
    MovieLens titles. Will be replaced by ALS in Phase 6B.
    """
    if not data_loader.data_available():
        return _dataset_unavailable()
    recs = data_service.recommendations(movie_id, limit=10)
    if recs is None:
        return jsonify({"error": "not_found"}), 404
    return jsonify(recs)

@app.route("/api/artifacts/status")
def api_artifacts_status():
    meta = data_artifacts.als_meta() or {}
    return jsonify({
        "analytics": {
            "available": data_artifacts.has_analytics(),
            "source": "precomputed" if data_artifacts.has_analytics() else "live_pandas",
        },
        "recommendations": {
            "movie_to_movie": {
                "available": data_artifacts.has_recommendations(),
                "engine": meta.get("engine"),
            },
            "user_to_movie": {
                "available": data_artifacts.has_user_recommendations(),
                "userCount": meta.get("userCount", 0),
            },
            "als_enabled": data_artifacts.als_enabled(),
            "active_source": (
                "als_artifacts"
                if (data_artifacts.has_recommendations() and data_artifacts.als_enabled())
                else "genre_stub"
            ),
        },
    })

@app.route("/api/user/<int:user_id>/recommendations")
def api_user_recommendations(user_id):
    """
    Personalized ALS recommendations for a specific user.

    200 → array of movie objects (with relative 'match' field)
    404 → ALS disabled, user not in model, or dataset missing
    """
    if not data_loader.data_available():
        return _dataset_unavailable()

    limit = request.args.get("limit", 10, type=int)
    limit = max(1, min(limit, 50))

    recs = data_service.user_recommendations(user_id, limit=limit)
    if recs is None:
        return jsonify({
            "error": "unavailable",
            "reason": "als_disabled_or_user_not_in_model",
        }), 404
    return jsonify(recs)

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)