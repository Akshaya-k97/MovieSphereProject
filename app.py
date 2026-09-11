from flask import Flask, render_template

app = Flask(__name__)


# ---------------- Pages ----------------
@app.route("/")
def home():
    return render_template("index.html")


@app.route("/explore")
def explore():
    return render_template("explore.html")


@app.route("/movie/<int:movie_id>")
def movie(movie_id):
    return render_template("movie.html", movie_id=movie_id)


@app.route("/recommendations")
def recommendations():
    return render_template("recommendations.html")


# Keep as placeholders for now — Phase 3/4 will fill them
@app.route("/analytics")
def analytics():
    return render_template("analytics.html")


@app.route("/cloud")
def cloud():
    return render_template("cloud.html")


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/user")
def user():
    return render_template("user.html")

@app.route("/api/user/<int:user_id>/insights")
def api_user_insights(user_id):
    # TODO: replace with real computation from ratings.csv
    # For now returns a plausible profile so the frontend can be demoed
    import random
    rng = random.Random(user_id * 7919)

    genres = ['Sci-Fi','Drama','Action','Comedy','Thriller','Romance','Crime','Animation']
    favorite = rng.choice(genres)
    most_active = rng.choice([g for g in genres if g != favorite])

    return {
        "userId": user_id,
        "displayName": f"User #{user_id}",
        "moviesRated": rng.randint(60, 280),
        "avgRating": round(rng.uniform(3.3, 4.6), 2),
        "favoriteGenre": favorite,
        "mostActiveGenre": most_active,
        "favoriteGenres": [
            {"genre": g, "count": rng.randint(6, 70)} for g in genres
        ][:6],
        "ratingBehaviour": [rng.randint(10, 80) for _ in range(5)],
    }


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)