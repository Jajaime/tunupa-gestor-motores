"""Pruebas sin Docker de la comprobación de identidad y SBOM de candidatos."""
from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from candidate_evidence import build_manifest, runtime_identity, verify_image

ID_API = "sha256:" + "a" * 64
ID_WEB = "sha256:" + "b" * 64
SHA = "c" * 40
API = "tunupa-api:release-candidate"
WEB = "tunupa-web:release-candidate"


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.apijson = self._write("trivy-api.json", {"ArtifactName": API, "Results": [], "Metadata": {"ImageID": ID_API}})
        self.webjson = self._write("trivy-web.json", {"ArtifactName": WEB, "Results": [], "Metadata": {"ImageID": ID_WEB}})
        self.apisbom = self._write("sbom-api.json", {"bomFormat": "CycloneDX", "specVersion": "1.6", "metadata": {"component": {"name": API}}, "components": [{"name": "node"}]})
        self.websbom = self._write("sbom-web.json", {"bomFormat": "CycloneDX", "specVersion": "1.6", "metadata": {"component": {"name": WEB}}, "components": [{"name": "node"}]})
        self.report = str(self.folder / "report.md")
        Path(self.report).write_text(f"## `{API}`\n\n- ID de imagen: `{ID_API}`\n\n## `{WEB}`\n\n- ID de imagen: `{ID_WEB}`\n", encoding="utf-8")

    def _write(self, name, obj):
        path = self.folder / name
        path.write_text(json.dumps(obj), encoding="utf-8")
        return str(path)

    def _manifest(self):
        return build_manifest(ID_API, ID_WEB, self.apijson, self.webjson, self.apisbom, self.websbom, self.report, SHA)

    def test_valid_manifest_never_authorizes(self):
        m = self._manifest()
        self.assertFalse(m["publication_authorized"])
        self.assertEqual(m["images"]["api"]["image_config_id"], ID_API)
        self.assertEqual(m["images"]["web"]["sbom_components"], 1)
        self.assertTrue(m["images"]["api"]["trivy_json_sha256"].startswith("sha256:"))

    def test_wrong_trivy_id_fails(self):
        with self.assertRaisesRegex(ValueError, "Trivy no analizo"):
            verify_image(API, ID_WEB, self.apijson, self.apisbom, Path(self.report).read_text())

    def test_wrong_artifact_name_fails(self):
        obj = json.loads(Path(self.apijson).read_text())
        obj["ArtifactName"] = WEB
        Path(self.apijson).write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError, "Informe Trivy"):
            self._manifest()

    def test_mismatched_runtime_report_fails(self):
        report = Path(self.report).read_text().replace(ID_API, ID_WEB)
        Path(self.report).write_text(report)
        with self.assertRaisesRegex(ValueError, "Inspeccion runtime"):
            self._manifest()

    def test_invalid_sbom_rejected(self):
        obj = json.loads(Path(self.websbom).read_text())
        obj["components"] = []
        Path(self.websbom).write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError, "SBOM sin componentes"):
            self._manifest()

    def test_wrong_sbom_image_rejected(self):
        obj = json.loads(Path(self.websbom).read_text())
        obj["metadata"]["component"]["name"] = API
        Path(self.websbom).write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError, "SBOM corresponde"):
            self._manifest()

    def test_invalid_sha_rejected(self):
        with self.assertRaisesRegex(ValueError, "GITHUB_SHA"):
            build_manifest(ID_API, ID_WEB, self.apijson, self.webjson, self.apisbom, self.websbom, self.report, "not-a-sha")

    def test_ambiguous_runtime_sections_rejected(self):
        report = Path(self.report).read_text() + f"\n## `{API}`\n- ID de imagen: `{ID_API}`\n"
        with self.assertRaisesRegex(ValueError, "seccion unica"):
            runtime_identity(report, API)


if __name__ == "__main__":
    unittest.main()
