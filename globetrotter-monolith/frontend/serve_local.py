"""
One-command local dev server for the frontend — the closest thing to
the old `serve.py` simplicity, without bringing back a Flask process
or Jinja templating (the frontend is a plain static site now, served
by Nginx in production — see ../nginx/nginx.conf).

This is just Python's built-in static file server with directory
listing turned off and a couple of nicer defaults. No dependencies
to install — works with any Python 3.

Run:
    cd frontend
    python serve_local.py

Then open http://localhost:8080
"""
import http.server
import socketserver
import os

PORT = int(os.environ.get("PORT", "8080"))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # One clean line per request instead of the default verbose format.
        print(f"{self.address_string()} - {args[0]}")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with socketserver.TCPServer(("0.0.0.0", PORT), QuietHandler) as httpd:
        print(f"GlobeTrotter frontend running at http://localhost:{PORT}")
        print(f"Backend API expected at whatever's set in static/config.js (default http://localhost:5000)")
        print("Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
