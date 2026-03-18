import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DOCS_DIR = os.path.join(ROOT, "docs")
STATE_FILE = os.path.join(ROOT, "autoboot", "state.json")
PLANS_DIR = os.path.join(ROOT, "autoboot", "plans")
RUNS_DIR = os.path.join(ROOT, "autoboot", "runs")
REPORTS_DIR = os.path.join(ROOT, "autoboot", "reports")
CONTEXT_DIR = os.path.join(ROOT, "autoboot", "context")
CONTEXT_MANIFEST_FILE = os.path.join(CONTEXT_DIR, "context_manifest.json")
MODEL_FILE = os.path.join(ROOT, "v2", "model.json")
LAYOUT_GATE_FILE = os.path.join(ROOT, "autoboot", "gates", "layout_gate.v1.json")
