import os
import re
from datetime import datetime, timezone


def new_id(prefix, directory=None, extension=""):
    base = datetime.now(timezone.utc).strftime(f"{prefix}-%Y%m%d-%H%M%S-%f")
    if directory is None:
        return base
    candidate = base + extension
    if not os.path.exists(os.path.join(directory, candidate)):
        return base
    i = 1
    while True:
        alt = f"{base}-{i}"
        candidate = alt + extension
        if not os.path.exists(os.path.join(directory, candidate)):
            return alt
        i += 1


def _shorten(text, max_chars):
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n...[truncated]"


def slugify(text):
    value = re.sub(r"[^a-zA-Z0-9\-]+", "-", text.strip().lower())
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "page"
