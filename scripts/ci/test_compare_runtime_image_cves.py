"""Tests de 18c2, sin Docker ni acceso a Internet."""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from compare_runtime_image_cves import InvalidScan, compare_scans, read_scan


def scan(*items):
    return {"Results": [{"Target": "os", "Vulnerabilities": [
        {"VulnerabilityID": ident, "PkgName": pkg, "Severity": severity}
        for ident, pkg, severity in items]}]}


class RuntimeComparisonTests(unittest.TestCase):
    def load(self, value):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "scan.json"
            target.write_text(json.dumps(value), encoding="utf-8")
            return read_scan(str(target))

    def test_count_by_severity_and_id(self):
        report = self.load(scan(("CVE-1", "package-a", "HIGH"),
                                ("CVE-1", "package-b", "HIGH"),
                                ("CVE-2", "package-c", "CRITICAL")))
        self.assertEqual(report["high"], 2)
        self.assertEqual(report["critical"], 1)
        self.assertEqual(len(report["by_id"]), 2)

    def test_ignore_lower_severities(self):
        report = self.load(scan(("CVE-1", "test", "LOW")))
        self.assertEqual(report["high"], 0)

    def test_empty_vulnerability_list_is_valid(self):
        report = self.load({"Results": [{"Target": "os", "Vulnerabilities": None}]})
        self.assertFalse(report["by_id"])

    def test_reject_incomplete_scan(self):
        with self.assertRaises(InvalidScan):
            self.load({})

    def test_empty_results_is_valid_and_represents_zero_findings(self):
        report = self.load({"Results": []})
        self.assertEqual(report["high"], 0)
        self.assertFalse(report["by_id"])

    def test_reject_non_object_vulnerability(self):
        with self.assertRaises(InvalidScan):
            self.load({"Results": [{"Vulnerabilities": ["invalid"]}]})

    def test_reject_missing_id_or_package(self):
        with self.assertRaises(InvalidScan):
            self.load({"Results": [{"Vulnerabilities": [{"Severity": "HIGH", "PkgName": "x"}]}]})

    def test_detects_removed_new_and_remaining_cves(self):
        old = self.load(scan(("CVE-1", "one", "HIGH"), ("CVE-2", "two", "HIGH")))
        new = self.load(scan(("CVE-2", "two", "HIGH"), ("CVE-3", "three", "HIGH")))
        report = compare_scans({"api_debian": old, "api_distroless": new,
                                "web_debian": old, "web_distroless": new})
        self.assertIn("no observados", report)
        self.assertIn("CVE-1", report)
        self.assertIn("CVE-3", report)
        self.assertIn("CVE-2", report)
        self.assertIn("NO publicadas", report)

    def test_does_not_grant_release_authorization(self):
        empty = self.load(scan())
        report = compare_scans(dict.fromkeys(
            ("api_debian", "api_distroless", "web_debian", "web_distroless"), empty))
        self.assertIn("no es aceptacion", report)
        self.assertIn("PENDING", report)
        self.assertNotIn("AUTORIZADO PARA GHCR", report)


if __name__ == "__main__":
    unittest.main()
