#!/usr/bin/env python3
"""Pruebas para la puerta npm de ejecución y la línea base SARIF."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("security_report.py")


class SecurityReportTest(unittest.TestCase):
    def invoke(self, kind, report):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            src = folder / "report.json"
            summary = folder / "summary.md"
            src.write_text(json.dumps(report), encoding="utf-8")
            env = dict(os.environ)
            env["GITHUB_STEP_SUMMARY"] = str(summary)
            result = subprocess.run(
                [sys.executable, str(SCRIPT), kind, str(src), "Tunupa test"],
                text=True, capture_output=True, env=env, check=False,
            )
            return result, summary.read_text(encoding="utf-8") if summary.exists() else ""

    @staticmethod
    def audit(total=0, critical=0, high=0, moderate=0, low=0):
        return {"metadata": {"vulnerabilities": {
            "total": total, "critical": critical, "high": high,
            "moderate": moderate, "low": low,
        }}}

    def test_clean_npm_passes(self):
        response, summary = self.invoke("npm", self.audit())
        self.assertEqual(response.returncode, 0, response.stderr)
        self.assertIn("**0**", summary)

    def test_high_npm_fails_but_keeps_summary(self):
        response, summary = self.invoke("npm", self.audit(total=1, high=1))
        self.assertEqual(response.returncode, 1)
        self.assertIn("Bloqueante", summary)
        self.assertIn("**1**", summary)

    def test_moderate_npm_also_fails(self):
        response, _ = self.invoke("npm", self.audit(total=1, moderate=1))
        self.assertEqual(response.returncode, 1)

    def test_audit_query_error_fails(self):
        response, _ = self.invoke("npm", {"error": {"code": "ENOAUDIT"}})
        self.assertEqual(response.returncode, 1)

    def test_sarif_remains_informational(self):
        response, summary = self.invoke("sarif", {"runs": [{"results": [{"ruleId": "CVE-TEST"}]}]})
        self.assertEqual(response.returncode, 0, response.stderr)
        self.assertIn("Hallazgos incluidos en SARIF: **1**", summary)

    def test_invalid_total_fails(self):
        response, _ = self.invoke("npm", self.audit(total="not-number"))
        self.assertEqual(response.returncode, 1)


if __name__ == "__main__":
    unittest.main()
