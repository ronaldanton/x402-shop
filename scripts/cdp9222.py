#!/usr/bin/env python3
"""Minimal CDP client for the persistent cloakbrowser on 127.0.0.1:9222.

Used to reuse the LinkedIn/Glama/GitHub profile that already exists there
instead of a fresh browser with no sessions.
"""
import json
import urllib.request

WS = None  # lazily imported


def http(path, method="GET"):
    req = urllib.request.Request(f"http://127.0.0.1:9222{path}", method=method)
    with urllib.request.urlopen(req, timeout=15) as r:
        body = r.read().decode("utf-8", "replace")
    try:
        return json.loads(body)
    except Exception:
        return body


def new_tab(url):
    try:
        return http(f"/json/new?{urllib.parse.quote(url, safe='')}", method="PUT")
    except Exception:
        return http(f"/json/new?{urllib.parse.quote(url, safe='')}")


import urllib.parse  # noqa: E402


class Tab:
    """One CDP page session."""

    def __init__(self, ws_url):
        import websockets.sync.client as wsc

        self.ws = wsc.connect(ws_url, max_size=64 * 1024 * 1024)
        self._id = 0

    def call(self, method, **params):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def ev(self, expr):
        r = self.call(
            "Runtime.evaluate",
            expression=expr,
            returnByValue=True,
            awaitPromise=True,
            userGesture=True,
        )
        if "exceptionDetails" in r:
            return {"__error__": str(r["exceptionDetails"])[:400]}
        return r.get("result", {}).get("value")

    def goto(self, url, wait=3.0):
        self.call("Page.navigate", url=url)
        import time

        time.sleep(wait)

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def tab_for(url_substr=None, create=None):
    """Return a Tab for an existing target matching url_substr, else create."""
    targets = [t for t in http("/json/list") if t.get("type") == "page"]
    if url_substr:
        for t in targets:
            if url_substr in (t.get("url") or ""):
                return Tab(t["webSocketDebuggerUrl"]), t
    if create:
        t = new_tab(create)
        import time

        time.sleep(2.5)
        return Tab(t["webSocketDebuggerUrl"]), t
    if targets:
        return Tab(targets[0]["webSocketDebuggerUrl"]), targets[0]
    raise RuntimeError("no page targets")
