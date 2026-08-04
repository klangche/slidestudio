#!/usr/bin/env python3
"""
SlideStudio dev server
======================

A zero-dependency static HTTP server with live reload.

It serves the project root over HTTP (required for the Service Worker /
PWA features, which file:// blocks) and injects a tiny script into every
served HTML page that watches a project fingerprint and reloads the tab
automatically whenever a project file changes -- no manual refresh.

Run it through dev-server.ps1, or directly:

    python dev-server.py --port 8000 --root .

Only the Python standard library is used; nothing to install.
"""

import argparse
import ctypes
import hashlib
import io
import os
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

__version__ = "1.1.0"

RELOAD_ENDPOINT = "/__slide_reload_version"
BYE_ENDPOINT = "/__slide_bye"
# How long the server waits for the page to come back (e.g. after a manual
# refresh) once the tab has reported it is closing before shutting down.
AUTO_STOP_GRACE = 5.0
IGNORE_DIRS = {".git", ".hg", ".svn", "__pycache__", "node_modules", ".venv", "venv"}
IGNORE_SUFFIXES = (".pyc", ".pyo", ".tmp", ".bak")

_COLORS = False

LIVE_RELOAD_SCRIPT = """
<script>
(function () {
  "use strict";
  var EP = "__SLIDE_RELOAD_ENDPOINT__";
  var BYE = "__SLIDE_BYE_ENDPOINT__";
  var current = null;
  function poll() {
    fetch(EP, { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (version) {
        if (current === null) { current = version; return; }
        if (version !== current) { window.__slideWillReload = true; window.location.reload(); }
      })
      .catch(function () { setTimeout(poll, 1500); });
  }
  function sendBye() {
    if (window.__slideWillReload) return;
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(BYE, "bye"); }
      else { fetch(BYE, { method: "POST", keepalive: true }); }
    } catch (e) {}
  }
  window.addEventListener("pagehide", sendBye);
  setTimeout(poll, 300);
  setInterval(poll, 700);
})();
</script>
"""


def enable_vt():
    """Enable ANSI colors on Windows consoles (no-op / harmless elsewhere)."""
    global _COLORS
    if os.name == "nt":
        try:
            handle = ctypes.windll.kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
            mode = ctypes.c_uint32()
            if ctypes.windll.kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
                ctypes.windll.kernel32.SetConsoleMode(
                    handle, mode.value | 0x0004  # ENABLE_VIRTUAL_TERMINAL_PROCESSING
                )
                _COLORS = True
        except Exception:
            _COLORS = False
    else:
        _COLORS = sys.stdout.isatty()


def paint(text, code):
    return "\033[%sm%s\033[0m" % (code, text) if _COLORS else text


def make_fingerprint(root):
    """Return a closure that computes a hash of every project file's
    mtime/size, so the browser can detect changes in real time."""

    def compute():
        h = hashlib.sha256()
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [
                d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")
            ]
            for name in filenames:
                if name.startswith(".") or name.lower().endswith(IGNORE_SUFFIXES):
                    continue
                full = os.path.join(dirpath, name)
                try:
                    st = os.stat(full)
                except OSError:
                    continue
                rel = os.path.relpath(full, root).replace(os.sep, "/")
                h.update(rel.encode("utf-8", "replace"))
                h.update(("%d:%d;" % (st.st_mtime_ns, st.st_size)).encode("ascii"))
        return h.hexdigest()[:20]

    return compute


class SlideStudioHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, root=None, fingerprint=None, activity=None, **kwargs):
        self._root = root or os.getcwd()
        self._fingerprint = fingerprint or (lambda: "")
        self._activity = activity or {"last": time.monotonic(), "bye": False}
        super().__init__(*args, directory=self._root, **kwargs)

    # -- logging ----------------------------------------------------------

    def log_message(self, fmt, *args):
        # Every request counts as page activity, including the live-reload
        # heartbeat and the goodbye beacon.
        self._activity["last"] = time.monotonic()
        try:
            code = int(args[1])
            requestline = args[0]
        except (IndexError, ValueError, TypeError):
            return
        parts = requestline.split()
        method = parts[0] if parts else "?"
        path = parts[1] if len(parts) > 1 else "?"
        if path.startswith(RELOAD_ENDPOINT) or path.startswith(BYE_ENDPOINT):
            return
        if code < 300:
            color = "32"
        elif code < 400:
            color = "93"
        elif code < 500:
            color = "91"
        else:
            color = "35"
        print(
            "%s %s %s %s"
            % (
                paint(time.strftime("%H:%M:%S"), "90"),
                paint(method.ljust(4), "96"),
                path,
                paint(str(code), color),
            ),
            flush=True,
        )

    # -- response headers -------------------------------------------------

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # -- routes -----------------------------------------------------------

    def _is_reload_request(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        return path == RELOAD_ENDPOINT

    def do_GET(self):
        if self._is_reload_request():
            body = self._fingerprint().encode("ascii")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_HEAD(self):
        if self._is_reload_request():
            body = self._fingerprint().encode("ascii")
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return
        super().do_HEAD()

    def do_POST(self):
        """Goodbye beacon from the page on close - triggers auto-stop."""
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == BYE_ENDPOINT:
            self._activity["bye"] = True
            self._activity["last"] = time.monotonic()
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_error(501, "POST not supported")

    def send_head(self):
        """Inject the live-reload script into HTML files; delegate the rest."""
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for index in ("index.html", "index.htm"):
                candidate = os.path.join(path, index)
                if os.path.isfile(candidate):
                    path = candidate
                    break
        if os.path.isfile(path) and path.lower().endswith((".html", ".htm")):
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    content = fh.read()
                script = LIVE_RELOAD_SCRIPT.replace(
                    "__SLIDE_RELOAD_ENDPOINT__", RELOAD_ENDPOINT
                )
                idx = content.lower().rfind("</body>")
                if idx != -1:
                    content = content[:idx] + script + content[idx:]
                else:
                    content += script
                data = content.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return io.BytesIO(data)
            except OSError:
                pass
        return super().send_head()

    def list_directory(self, path):
        # No directory listings in dev mode -- keeps logs clean.
        self.send_error(404, "Directory listing is disabled")
        return None


def auto_stop_monitor(server, activity, grace):
    """Shut the server down shortly after the last open page reports it is
    closing (and no new page takes its place)."""
    while True:
        time.sleep(0.5)
        now = time.monotonic()
        if activity["bye"] and (now - activity["last"]) >= grace:
            print()
            print(paint("  No page connected - server stopped.", "90"))
            server.shutdown()
            return


def print_banner(args, root, url):
    print()
    print(paint("  SlideStudio", "1;96") + paint(" dev server", "1") + paint("  v%s" % __version__, "90"))
    print(paint("  " + "-" * 48, "90"))
    print("  Serving      %s" % root)
    print("  URL          %s" % paint(url, "36"))
    print(
        "  Live reload  %s"
        % (paint("ON  (auto-refresh on change)", "32") if not args.no_reload else paint("OFF", "90"))
    )
    print(
        "  Auto-stop    %s"
        % (
            paint("ON  (exits when the tab is closed)", "32")
            if not args.no_auto_stop
            else paint("OFF", "90")
        )
    )
    print("  Stop         Ctrl+C")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="SlideStudio dev server (static files + live reload)"
    )
    parser.add_argument("--port", type=int, default=8000, help="port to listen on (default: 8000)")
    parser.add_argument("--host", default="127.0.0.1", help="interface to bind (default: 127.0.0.1)")
    parser.add_argument("--root", default=os.getcwd(), help="directory to serve (default: cwd)")
    parser.add_argument("--no-reload", action="store_true", help="disable auto-reload injection")
    parser.add_argument(
        "--no-auto-stop",
        action="store_true",
        help="keep running after the browser tab is closed",
    )
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        parser.error("root directory does not exist: %s" % root)

    enable_vt()
    activity = {"last": time.monotonic(), "bye": False}
    handler = partial(
        SlideStudioHandler,
        root=root,
        fingerprint=None if args.no_reload else make_fingerprint(root),
        activity=activity,
    )

    try:
        server = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as exc:
        print(paint("  ERROR: cannot bind %s:%d - %s" % (args.host, args.port, exc), "1;91"))
        print(paint("  Is the port already in use?", "93"))
        sys.exit(1)

    server.daemon_threads = True
    url = "http://%s:%d/" % (args.host, server.server_port)

    print_banner(args, root, url)

    if not args.no_auto_stop:
        threading.Thread(
            target=auto_stop_monitor, args=(server, activity, AUTO_STOP_GRACE), daemon=True
        ).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        print(paint("  Server stopped. Goodbye!", "90"))
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
