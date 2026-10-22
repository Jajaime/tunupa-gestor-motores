"""Tests independientes de Docker para el formato de evidencia 18a4."""
from __future__ import annotations

import unittest
from inspect_runtime_exposure import BINARIES, PACKAGES, parse_probe, render


class ProbeTests(unittest.TestCase):
    @staticmethod
    def sample() -> str:
        return "\n".join(["uid\t1000"] +
                         [f"binary\t{x}\tabsent" for x in BINARIES] +
                         [f"package\t{x}\tnot-installed" for x in PACKAGES])

    def test_parses_complete_probe(self):
        result = parse_probe(self.sample())
        self.assertEqual(result["uid"], "1000")
        self.assertEqual(len(result["packages"]), len(PACKAGES))
        self.assertEqual(len(result["binaries"]), len(BINARIES))

    def test_incomplete_probe_fails(self):
        with self.assertRaises(ValueError):
            parse_probe("uid\t1000\n")

    def test_unexpected_command_fails(self):
        with self.assertRaises(ValueError):
            parse_probe(self.sample() + "\nbinary\tunknown\tpresent")

    def test_report_never_grants_approval(self):
        item = {"image": "tunupa-api:local", "image_id": "sha256:test", "declared_user": "node", **parse_probe(self.sample())}
        output = render([item])
        self.assertIn("NO APROBACIÓN", output)
        self.assertIn("sha256:test", output)


if __name__ == "__main__":
    unittest.main()
