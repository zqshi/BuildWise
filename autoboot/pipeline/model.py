import json
import os

from .constants import MODEL_FILE


def load_model():
    if not os.path.exists(MODEL_FILE):
        return {"entities": [], "rules": [], "pages": []}
    with open(MODEL_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_model(model):
    with open(MODEL_FILE, "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, indent=2)
