#!/usr/bin/env python3

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def contains_pattern(text, pattern):
    return re.search(re.escape(pattern), text) is not None


def evaluate_rule(rule, baseline_text, target_text):
    baseline_patterns = rule.get("baseline_patterns", [])
    target_patterns = rule.get("target_patterns", [])
    weight = float(rule.get("weight", 1))
    critical = bool(rule.get("critical", False))

    baseline_hits = [p for p in baseline_patterns if contains_pattern(baseline_text, p)]
    target_hits = [p for p in target_patterns if contains_pattern(target_text, p)]

    baseline_ok = len(baseline_hits) == len(baseline_patterns)
    ratio = 0.0 if len(target_patterns) == 0 else len(target_hits) / len(target_patterns)
    score = weight * ratio
    target_ok = len(target_hits) == len(target_patterns)

    return {
        "id": rule.get("id", "unknown"),
        "title": rule.get("title", ""),
        "weight": weight,
        "critical": critical,
        "baseline_ok": baseline_ok,
        "baseline_missing": [p for p in baseline_patterns if p not in baseline_hits],
        "target_ok": target_ok,
        "target_missing": [p for p in target_patterns if p not in target_hits],
        "target_ratio": round(ratio, 4),
        "score": round(score, 4),
    }


def evaluate_contract(contract, threshold):
    baseline_path = os.path.join(ROOT, contract["baseline_file"])
    target_path = os.path.join(ROOT, contract["target_file"])

    baseline_text = read_text(baseline_path)
    target_text = read_text(target_path)

    rule_reports = []
    total_weight = 0.0
    total_score = 0.0
    critical_failures = []

    for rule in contract.get("rules", []):
        rep = evaluate_rule(rule, baseline_text, target_text)
        rule_reports.append(rep)
        total_weight += rep["weight"]
        total_score += rep["score"]
        if rep["critical"] and not rep["target_ok"]:
            critical_failures.append(rep["id"])

    normalized = 0.0 if total_weight == 0 else total_score / total_weight
    passed = normalized >= threshold and len(critical_failures) == 0

    return {
        "contract": contract.get("name", "unknown"),
        "version": contract.get("version", ""),
        "evaluated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "baseline_file": contract["baseline_file"],
        "target_file": contract["target_file"],
        "threshold": threshold,
        "score": round(normalized, 4),
        "passed": passed,
        "critical_failures": critical_failures,
        "rules": rule_reports,
    }


def main():
    parser = argparse.ArgumentParser(description="Compare current layout against legacy contract.")
    parser.add_argument("--contract", default="autoboot/contracts/layout_contract.v1.json")
    parser.add_argument("--threshold", type=float, default=0.82)
    parser.add_argument("--out")
    args = parser.parse_args()

    contract_path = os.path.join(ROOT, args.contract)
    with open(contract_path, "r", encoding="utf-8") as f:
        contract = json.load(f)

    report = evaluate_contract(contract, args.threshold)
    output = json.dumps(report, ensure_ascii=False, indent=2)
    print(output)

    if args.out:
        out_path = os.path.join(ROOT, args.out)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(output + "\n")

    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
