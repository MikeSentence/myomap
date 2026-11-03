#!/usr/bin/env python3
"""Tiny zero-dependency server for MyoMap.

ES modules and GLB loading do not work reliably from file:// URLs, so this
script serves the app locally and opens the default browser.

Run:
    python server.py
"""

from __future__ import annotations

import http.server
import mimetypes
import os
import socket
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
START_PORT = 4173
MAX_PORT = 4195


class MyoMapHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".wasm": "application/wasm",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console readable; errors still go to stderr via the base class.
        if str(args[0] if args else "").startswith("4"):
            super().log_message(fmt, *args)


def port_is_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def main() -> None:
    if not (ROOT / "index.html").exists():
        raise SystemExit("index.html not found next to server.py")

    port = next((candidate for candidate in range(START_PORT, MAX_PORT) if port_is_available(candidate)), None)
    if port is None:
        raise SystemExit("No free local port found between 4173 and 4194.")

    url = f"http://127.0.0.1:{port}/"
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), MyoMapHandler)

    print()
    print("  M Y O M A P   ·   肌源")
    print("  3D 肌肉疼痛自查")
    print()
    print(f"  Open: {url}")
    print("  Press Ctrl+C to stop.")
    print(flush=True)

    if os.environ.get("MYOMAP_NO_BROWSER") != "1":
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping MyoMap.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
