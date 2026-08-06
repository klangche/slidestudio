#!/usr/bin/env python3
"""
SlideStudio dev server
======================

A zero-dependency static HTTP server with live reload.

It serves the project root over HTTP (required for the Service Worker /
PWA features, which file:// blocks) and keeps an EventSource (SSE)
connection open to the open page. Whenever a project file changes, a
"reload" event is pushed over that connection and the tab refreshes
itself -- no manual refresh, no polling.

The same SSE connection doubles as the page-presence signal: when the
last tab is closed the connection drops and the server shuts itself down
automatically (just like Ctrl+C). Refreshing the page simply opens a new
connection, so it never stops the server. A slow fingerprint scan runs on
a background thread, so editing files never blocks or stalls the server.

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

__version__ = "1.2.0"

LIVE_ENDPOINT = "/__slide_live"
SCAN_INTERVAL = 1.0
# How long the server keeps running after the last page's SSE connection
# closes. Long enough to survive a slow page reload and EventSource
# auto-reconnects; short enough to feel responsive after the tab is closed.
AUTO_STOP_GRACE = 10.0
IGNORE_DIRS = {".git", ".hg", ".svn", "__pycache__", "node_modules", ".venv", "venv"}
IGNORE_SUFFIXES = (".pyc", ".pyo", ".tmp", ".bak")

_COLORS = False

LIVE_RELOAD_SCRIPT = """
<script>
(function () {
  "use strict";
  var es = new EventSource("__SLIDE_LIVE_ENDPOINT__");
  es.onmessage = function (ev) {
    if (ev.data === "reload") { window.location.reload(); }
  };
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
    mtime/size, so the scanner can detect changes in real time."""

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


def broadcast(activity, message):
    """Send a message to every open SSE connection."""
    with activity["lock"]:
        targets = list(activity["clients"].items())
    for wfile, lock in targets:
        try:
            with lock:
                wfile.write(("data: %s\n\n" % message).encode("utf-8"))
                wfile.flush()
        except OSError:
            with activity["lock"]:
                activity["clients"].pop(wfile, None)


def scanner_loop(activity, fingerprint, interval):
    """Watch the project on a background thread and push a reload event
    whenever the fingerprint changes. Runs off the request threads, so
    heavy scans never stall the server."""
    last = None
    while True:
        try:
            version = fingerprint()
        except Exception:
            version = None
        if last is not None and version != last:
            broadcast(activity, "reload")
        last = version
        time.sleep(interval)


def auto_stop_monitor(activity, server, grace):
    """Shut the server down once the last page's SSE connection has been
    gone for the grace period (tab closed for real, not just refreshed)."""
    while True:
        time.sleep(0.5)
        now = time.monotonic()
        with activity["lock"]:
            present = activity["present"]
            open_clients = len(activity["clients"])
            last = activity["last"]
        if present and open_clients == 0 and (now - last) >= grace:
            print()
            print(paint("  No page open - server stopped.", "90"))
            server.shutdown()
            return


class SlideStudioServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # Aborting an idle keep-alive connection is normal when the browser
        # closes a tab -- not an error worth printing a traceback for.
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


class SlideStudioHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, root=None, activity=None, **kwargs):
        self._root = root or os.getcwd()
        self._activity = activity
        super().__init__(*args, directory=self._root, **kwargs)

    # -- logging ----------------------------------------------------------

    def log_message(self, fmt, *args):
        if self._activity is not None:
            self._activity["last"] = time.monotonic()
        try:
            code = int(args[1])
            requestline = args[0]
        except (IndexError, ValueError, TypeError):
            return
        parts = requestline.split()
        method = parts[0] if parts else "?"
        path = parts[1] if len(parts) > 1 else "?"
        if path.startswith(LIVE_ENDPOINT):
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

    def _stream(self):
        """Keep an SSE connection open while the page is alive. Doubles as
        the auto-stop presence signal: when the tab closes, the browser
        drops this connection and the monitor shuts the server down."""
        activity = self._activity
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        wfile = self.wfile
        lock = threading.Lock()
        with activity["lock"]:
            activity["clients"][wfile] = lock
            activity["present"] = True
            activity["last"] = time.monotonic()
        try:
            while True:
                time.sleep(2.0)
                try:
                    with lock:
                        wfile.write(b": ping\n\n")
                        wfile.flush()
                except OSError:
                    break
        finally:
            with activity["lock"]:
                activity["clients"].pop(wfile, None)
                activity["last"] = time.monotonic()

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == LIVE_ENDPOINT:
            self._stream()
            return
        super().do_GET()

    def do_HEAD(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == LIVE_ENDPOINT:
            self.send_response(405)
            self.end_headers()
            return
        super().do_HEAD()

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
                    "__SLIDE_LIVE_ENDPOINT__", LIVE_ENDPOINT
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
    activity = {
        "clients": {},
        "lock": threading.Lock(),
        "present": False,
        "last": time.monotonic(),
    }
    handler = partial(
        SlideStudioHandler,
        root=root,
        activity=activity,
    )

    try:
        server = SlideStudioServer((args.host, args.port), handler)
    except OSError as exc:
        print(paint("  ERROR: cannot bind %s:%d - %s" % (args.host, args.port, exc), "1;91"))
        print(paint("  Is the port already in use?", "93"))
        sys.exit(1)

    server.daemon_threads = True
    url = "http://%s:%d/" % (args.host, server.server_port)

    print_banner(args, root, url)

    if not args.no_reload:
        threading.Thread(
            target=scanner_loop,
            args=(activity, make_fingerprint(root), SCAN_INTERVAL),
            daemon=True,
        ).start()

    if not args.no_auto_stop:
        threading.Thread(
            target=auto_stop_monitor,
            args=(activity, server, AUTO_STOP_GRACE),
            daemon=True,
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
