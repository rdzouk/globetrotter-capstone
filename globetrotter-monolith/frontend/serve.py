"""
GlobeTrotter — Frontend page server
------------------------------------
This is NOT the API. It has zero business logic and zero data access —
its only job is to render the HTML templates and hand back the static
CSS/JS. Every page's JavaScript then calls the real backend (see
../backend/app.py) directly over HTTP using API_BASE_URL, defined in
static/app.js.

Run:
    python serve.py
Then open http://localhost:5173

Why a separate tiny Flask app instead of just opening the HTML files
directly? Two reasons: (1) Jinja templating (the {% extends %} /
{% block %} pattern used across these pages) needs a template engine
to render, and (2) browsers block some fetch() behavior on file://
URLs. A lightweight local server sidesteps both.
"""
from flask import Flask, render_template

app = Flask(__name__)


@app.route("/")
def page_home():
    return render_template("index.html")


@app.route("/login")
def page_login():
    return render_template("login.html")


@app.route("/register")
def page_register():
    return render_template("register.html")


@app.route("/recommendations-page")
def page_recommendations():
    return render_template("recommendations.html")


@app.route("/itineraries-page")
def page_itineraries():
    return render_template("itineraries.html")


@app.route("/planner-page")
def page_planner():
    return render_template("planner.html")


@app.route("/map-page")
def page_map():
    return render_template("map.html")


@app.route("/favorites-page")
def page_favorites():
    return render_template("favorites.html")


@app.route("/profile-page")
def page_profile():
    return render_template("profile.html")


@app.route("/feedback-page")
def page_feedback():
    return render_template("feedback.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5173, debug=True)
