"""Pruebas unitarias sin base de datos, Docker ni credenciales."""
import json
from pathlib import Path
import tempfile
import unittest

from cve_risk_inventory import evaluate, load_baseline, read_scan


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.reference = {
            "schema_version": 1,
            "status": "PENDING_REVIEW_NOT_APPROVED",
            "cves": [{"id": "CVE-2026-76642", "source_package": "util-linux"}],
        }

    def file(self, name, data):
        path = self.root / name
        path.write_text(json.dumps(data))
        return str(path)

    def test_known_remains_pending_not_approved(self):
        known = load_baseline(self.file("ref.json", self.reference))
        high, block = read_scan(self.file("scan.json", {"Results": [{"Vulnerabilities": [
            {"VulnerabilityID": "CVE-2026-76642", "Severity": "HIGH", "PkgName": "mount"}
        ]}]}))
        report, ok = evaluate(known, [("API", high, block), ("Web", {}, [])])
        self.assertTrue(ok)
        self.assertIn("NO aprueba GHCR", report)
        self.assertIn("CVE-2026-76642", report)

    def test_unknown_cve_fails(self):
        known = load_baseline(self.file("ref.json", self.reference))
        result, ok = evaluate(known, [("API", {"CVE-2026-98765": {"mount"}}, []), ("Web", {}, [])])
        self.assertFalse(ok)
        self.assertIn("CVE nuevas, fuera del inventario: **1**", result)

    def test_critical_or_fixed_high_fail(self):
        high, block = read_scan(self.file("scan.json", {"Results": [{"Vulnerabilities": [
            {"VulnerabilityID": "CVE-2026-76642", "Severity": "CRITICAL", "PkgName": "mount"},
            {"VulnerabilityID": "CVE-2026-78408", "Severity": "HIGH", "PkgName": "libmount1", "FixedVersion": "2.43"}
        ]}]}))
        self.assertEqual(high, {})
        self.assertEqual(set(block), {"CVE-2026-76642", "CVE-2026-78408"})

    def test_missing_results_fails(self):
        with self.assertRaises(ValueError):
            read_scan(self.file("invalid.json", {"ArtifactName": "not-scan"}))

    def test_approval_status_not_supported(self):
        self.reference["status"] = "APPROVED"
        with self.assertRaises(ValueError):
            load_baseline(self.file("ref.json", self.reference))


if __name__ == "__main__":
    unittest.main()
