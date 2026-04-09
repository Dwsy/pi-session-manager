#!/usr/bin/env python3
"""
scripts/test_report.py

Parse libtest JSON output into a compact, machine-readable JSON report.

Intended input:
  cargo test --all-targets -- \
    -Z unstable-options \
    --format json \
    --report-time \
    --show-output

The libtest JSON stream is JSONL (one JSON object per line). This script
extracts per-test status + duration, and optionally merges extra per-test
metrics emitted via stdout lines of the form:

  CASR_TEST_METRIC:{"trace_events_count":123,"files_written":2,"files_read":7}
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from typing import Any


def _utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _parse_optional_metrics(stdout: str) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    for line in stdout.splitlines():
        if not line.startswith("CASR_TEST_METRIC:"):
            continue
        payload = line[len("CASR_TEST_METRIC:") :].strip()
        try:
            decoded = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(decoded, dict):
            metrics.update(decoded)
    return metrics


def _status_from_event(event: str) -> str | None:
    # libtest emits: started, ok, failed, ignored (and potentially timeout).
    if event == "ok":
        return "pass"
    if event in {"failed", "timeout"}:
        return "fail"
    if event == "ignored":
        return "ignored"
    return None


def _duration_ms(exec_time_seconds: Any) -> int | None:
    if exec_time_seconds is None:
        return None
    try:
        seconds = float(exec_time_seconds)
    except (TypeError, ValueError):
        return None
    if seconds < 0:
        return None
    return int(round(seconds * 1000.0))


def _open_input(path: str):
    if path == "-":
        return sys.stdin
    return open(path, "r", encoding="utf-8")


def _open_output(path: str):
    if path == "-":
        return sys.stdout
    return open(path, "w", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a JSON test report from libtest JSONL.")
    parser.add_argument(
        "--input",
        default="-",
        help="Path to libtest JSONL input (default: stdin). Use '-' for stdin.",
    )
    parser.add_argument(
        "--output",
        default="-",
        help="Path to write JSON report (default: stdout). Use '-' for stdout.",
    )
    args = parser.parse_args()

    results_by_name: dict[str, dict[str, Any]] = {}
    total_lines = 0
    parse_errors = 0

    with _open_input(args.input) as f:
        for raw in f:
            total_lines += 1
            line = raw.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                parse_errors += 1
                continue

            if not isinstance(event, dict):
                continue
            if event.get("type") != "test":
                continue

            name = event.get("name")
            if not isinstance(name, str) or not name:
                continue

            status = _status_from_event(str(event.get("event", "")))
            if status is None:
                continue

            duration_ms = _duration_ms(event.get("exec_time"))
            metrics = _parse_optional_metrics(event.get("stdout", "") or "")

            results_by_name[name] = {
                "test_name": name,
                "status": status,
                "duration_ms": duration_ms,
                "assertions_count": metrics.get("assertions_count"),
                "trace_events_count": metrics.get("trace_events_count"),
                "files_written": metrics.get("files_written"),
                "files_read": metrics.get("files_read"),
            }

    tests = [results_by_name[k] for k in sorted(results_by_name.keys())]
    summary = {
        "total_tests": len(tests),
        "passed": sum(1 for t in tests if t["status"] == "pass"),
        "failed": sum(1 for t in tests if t["status"] == "fail"),
        "ignored": sum(1 for t in tests if t["status"] == "ignored"),
        "input_lines": total_lines,
        "input_parse_errors": parse_errors,
    }

    report = {
        "generated_at": _utc_now_iso(),
        "summary": summary,
        "tests": tests,
    }

    with _open_output(args.output) as out:
        json.dump(report, out, indent=2, sort_keys=True)
        out.write("\n")

    # Fail fast if we couldn't parse most of the input.
    if total_lines > 0 and parse_errors > max(5, total_lines // 10):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
