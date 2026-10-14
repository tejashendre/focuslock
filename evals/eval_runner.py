"""
Zero-dependency Automated Eval Runner for Agentic Systems.
Evaluates agent outputs against deterministic test cases and assertions.
"""
import json
import time
import re
import sys
from pathlib import Path

def run_evals(dataset_path="evals/golden_dataset.json"):
    data_file = Path(dataset_path)
    if not data_file.exists():
        print(f"[ERROR] Golden dataset not found at {dataset_path}")
        sys.exit(1)

    with open(data_file, "r", encoding="utf-8") as f:
        cases = json.load(f)

    total = len(cases)
    passed = 0
    results = []

    print(f"\n=== RUNNING AUTOMATED EVALS ({total} Test Cases) ===")
    start_time = time.time()

    for idx, case in enumerate(cases, 1):
        test_id = case.get("id", f"case_{idx}")
        input_prompt = case.get("input", "")
        assertions = case.get("assertions", {})
        
        # Simulated or integrated agent response
        candidate = case.get("mock_output", "")
        case_passed = True
        failures = []

        # Assertion 1: Max length
        if "max_length" in assertions:
            max_len = assertions["max_length"]
            if len(candidate) > max_len:
                case_passed = False
                failures.append(f"Length {len(candidate)} exceeds max {max_len}")

        # Assertion 2: Required substrings
        if "contains" in assertions:
            for req in assertions["contains"]:
                if req.lower() not in candidate.lower():
                    case_passed = False
                    failures.append(f"Missing required text: '{req}'")

        # Assertion 3: Forbidden patterns (e.g. banned words, em dashes)
        if "forbidden" in assertions:
            for bad in assertions["forbidden"]:
                if bad in candidate:
                    case_passed = False
                    failures.append(f"Contains forbidden text: '{bad}'")

        if case_passed:
            passed += 1
            status = "PASS"
        else:
            status = "FAIL"

        results.append({
            "id": test_id,
            "status": status,
            "failures": failures
        })
        print(f"[{status}] {test_id}: {failures if failures else 'All assertions passed'}")

    elapsed = round(time.time() - start_time, 3)
    pass_rate = round((passed / total) * 100, 1)

    print("\n=== EVALUATION REPORT ===")
    print(f"Total Cases: {total}")
    print(f"Passed:      {passed}")
    print(f"Failed:      {total - passed}")
    print(f"Pass Rate:   {pass_rate}%")
    print(f"Duration:    {elapsed}s")

    # Generate Markdown Summary
    report_file = Path("evals/eval_report.md")
    report_content = f"# Automated Eval Benchmark Report\n\n"
    report_content += f"- **Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
    report_content += f"- **Pass Rate:** {pass_rate}% ({passed}/{total})\n"
    report_content += f"- **Duration:** {elapsed}s\n\n"
    report_content += "## Test Case Breakdown\n\n"
    report_content += "| Test ID | Status | Details |\n|---|---|---|\n"
    for r in results:
        details = ", ".join(r["failures"]) if r["failures"] else "Clean"
        report_content += f"| {r['id']} | {r['status']} | {details} |\n"

    report_file.parent.mkdir(parents=True, exist_ok=True)
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(report_content)

    print(f"[OK] Report written to {report_file}")
    if passed < total:
        sys.exit(1)

if __name__ == "__main__":
    run_evals()
