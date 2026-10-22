"""Pruebas del precontrol de publicacion; no autorizan releases."""
import sys
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

sys.path.insert(0, str(Path(__file__).parent))
from release_readiness import validate_origin, approval_problems, assess, read_findings, load_reviews  # noqa: E402


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.today = date(2026, 10, 22)
        self.review = {
            "id": "CVE-2026-78410", "status": "APPROVED_EXCEPTION",
            "risk_owner": "Responsable del servicio", "approver": "Revisor autorizado",
            "technical_justification": "Aprobacion documentada del vector de riesgo con mitigaciones comprobadas.",
            "evidence_url": "https://github.com/owner/repo/issues/123",
            "approved_at": "2026-10-20", "review_by": "2026-11-22",
        }

    def test_rejects_example_and_http_origins(self):
        for value in ["https://example.invalid", "http://tunupa.cl", "https://localhost", "https://192.168.0.1", "https://tunupa.cl/secret", "https://tunupa.cl:8443", "https://tunupa.cl:bad", "https://-tunupa.cl"]:
            with self.subTest(value=value):
                self.assertFalse(validate_origin(value))

    def test_valid_public_domain(self):
        self.assertTrue(validate_origin("https://motores.example.cl"))

    def test_pending_not_approved(self):
        record = dict(self.review, status="PENDING")
        self.assertTrue(approval_problems(record, self.today))

    def test_expired_and_future_approval_rejected(self):
        record = dict(self.review, review_by="2026-10-21", approved_at="2026-10-23")
        self.assertEqual(len(approval_problems(record, self.today)), 2)

    def test_missing_evidence_rejected(self):
        record = dict(self.review, evidence_url="")
        self.assertTrue(approval_problems(record, self.today))

    def test_valid_review_fields_are_only_prerequisite(self):
        self.assertEqual(approval_problems(self.review, self.today), [])

    def test_scanner_detects_critical_and_fixed_high(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / "scan.json"
            path.write_text(json.dumps({"Results": [{"Vulnerabilities": [
                {"Severity": "CRITICAL", "VulnerabilityID": "CVE-2026-55555"},
                {"Severity": "HIGH", "VulnerabilityID": "CVE-2026-66666", "FixedVersion": "2.0"},
                {"Severity": "HIGH", "VulnerabilityID": "CVE-2026-78410"}
            ]}]}))
            high, blocking = read_findings(str(path))
        self.assertEqual(high, {"CVE-2026-78410"})
        self.assertEqual(len(blocking), 2)

    def test_new_cve_fails_even_if_known_cve_is_reviewed(self):
        with TemporaryDirectory() as folder:
            api = Path(folder) / "api.json"
            web = Path(folder) / "web.json"
            api.write_text(json.dumps({"Results": [{"Vulnerabilities": [
                {"Severity": "HIGH", "VulnerabilityID": "CVE-2026-77777"}
            ]}]}))
            web.write_text(json.dumps({"Results": []}))
            errors, pending = assess(
                {self.review["id"]: {}}, {self.review["id"]: self.review}, self.today,
                "https://motores.example.cl", str(api), str(web), True,
            )
        self.assertTrue(any("CVE nueva" in e for e in errors))
        self.assertEqual(pending, [])

    def test_pending_with_scanned_known_high_prevents_check(self):
        with TemporaryDirectory() as folder:
            api = Path(folder) / "api.json"
            web = Path(folder) / "web.json"
            api.write_text(json.dumps({"Results": [{"Vulnerabilities": [
                {"Severity": "HIGH", "VulnerabilityID": self.review["id"]}
            ]}]}))
            web.write_text(json.dumps({"Results": []}))
            not_approved = dict(self.review, status="PENDING")
            errors, pending = assess(
                {self.review["id"]: {}}, {self.review["id"]: not_approved}, self.today,
                "https://motores.example.cl", str(api), str(web), True,
            )
        self.assertFalse(errors)
        self.assertEqual(len(pending), 1)

    def test_missing_cve_review_fails(self):
        with TemporaryDirectory() as folder:
            filename = Path(folder) / "approvals.json"
            filename.write_text(json.dumps({"schema_version": 1, "publication_authorized": False, "reviews": []}))
            with self.assertRaises(ValueError):
                load_reviews(str(filename), {self.review["id"]})

    def test_check_requires_scans_and_real_origin(self):
        inv = {self.review["id"]: {"id": self.review["id"]}}
        errors, _ = assess(inv, {self.review["id"]: self.review}, self.today, None, None, None, True)
        self.assertEqual(len(errors), 2)


if __name__ == "__main__":
    unittest.main()
