#!/usr/bin/env python3
"""Local embedding script using fastembed (BAAI/bge-small-en-v1.5, 384 dim).
Usage:
  echo "some text" | python3 embed.py
  python3 embed.py "some text"
Outputs: JSON array of floats
"""
import sys, json
from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-en-v1.5"
_model = None

def get_model():
    global _model
    if _model is None:
        _model = TextEmbedding(MODEL_NAME)
    return _model

if __name__ == "__main__":
    if len(sys.argv) > 1:
        text = " ".join(sys.argv[1:])
    else:
        text = sys.stdin.read()
    text = text.strip()
    if not text:
        print("[]")
        sys.exit(0)
    model = get_model()
    embedding = list(list(model.embed([text]))[0])
    print(json.dumps([float(x) for x in embedding]))
