#!/usr/bin/env python3
"""Persistent local embedding server. Keeps model in memory for fast responses.
Listens on 127.0.0.1:9430, accepts POST /embed with JSON {"text": "..."}.
Returns JSON {"embedding": [...384 floats...]}.
"""
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-en-v1.5"
PORT = 9430

print(f"Loading {MODEL_NAME}...", flush=True)
model = TextEmbedding(MODEL_NAME)
# Warm up
list(model.embed(["warmup"]))
print(f"Model ready. Listening on 127.0.0.1:{PORT}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # suppress access logs

    def do_POST(self):
        if self.path != "/embed":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
            text = str(data.get("text", ""))[:8192]
            embedding = list(list(model.embed([text]))[0])
            resp = json.dumps({"embedding": [float(x) for x in embedding]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(resp))
            self.end_headers()
            self.wfile.write(resp)
        except Exception as e:
            self.send_error(500, str(e))

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_error(404)


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()
