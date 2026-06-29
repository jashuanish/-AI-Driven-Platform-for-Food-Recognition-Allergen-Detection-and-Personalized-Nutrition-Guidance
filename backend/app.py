from flask import Flask
from flask_cors import CORS

from config import CORS_ORIGIN, FLASK_PORT
from routes.analyze import analyze_bp


def create_app():
    app = Flask(__name__)
    CORS(app, origins=[CORS_ORIGIN])
    app.register_blueprint(analyze_bp, url_prefix="/api")
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=True, use_reloader=False)
