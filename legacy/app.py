import os
from functools import wraps

from flask import (
    Flask,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash


app = Flask(__name__)

# For local development, this fallback key is acceptable.
# In production, SECRET_KEY must be stored as an environment variable.
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-key-in-production")

# Basic secure session settings.
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False  # Set True when using HTTPS in production.


# Demo user database for coursework prototype.
# Passwords are stored as hashes instead of plain text.
USERS = {
    "student@example.com": {
        "name": "Student User",
        "password_hash": generate_password_hash("Password123"),
    },
    "admin@example.com": {
        "name": "Admin User",
        "password_hash": generate_password_hash("Admin123"),
    },
}


def login_required(view_function):
    """Protect pages that require a logged-in user."""
    @wraps(view_function)
    def wrapped_view(*args, **kwargs):
        if "user_email" not in session:
            flash("Please log in to access your account.", "warning")
            return redirect(url_for("login"))
        return view_function(*args, **kwargs)

    return wrapped_view


@app.route("/")
def index():
    """Redirect users based on their authentication status."""
    if "user_email" in session:
        return redirect(url_for("home"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    """Display the login form and process login requests."""
    if "user_email" in session:
        return redirect(url_for("home"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or not password:
            flash("Email and password are required.", "danger")
            return render_template("login.html", email=email)

        user = USERS.get(email)

        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_email"] = email
            session["user_name"] = user["name"]
            flash("Login successful.", "success")
            return redirect(url_for("home"))

        flash("Invalid email or password. Please try again.", "danger")
        return render_template("login.html", email=email)

    return render_template("login.html")


@app.route("/home")
@login_required
def home():
    """Show the homepage after successful login."""
    return render_template(
        "home.html",
        user_name=session.get("user_name"),
        user_email=session.get("user_email"),
    )


@app.route("/account")
@login_required
def account():
    """Show a protected account page."""
    return render_template(
        "account.html",
        user_name=session.get("user_name"),
        user_email=session.get("user_email"),
    )


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    """Log out the current user."""
    session.clear()
    flash("You have been logged out.", "info")
    return redirect(url_for("login"))


@app.errorhandler(404)
def page_not_found(error):
    """Handle broken or unknown links gracefully."""
    return render_template("404.html"), 404


if __name__ == "__main__":
    app.run(debug=True)
