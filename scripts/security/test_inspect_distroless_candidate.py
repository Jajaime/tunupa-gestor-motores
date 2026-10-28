"""Pruebas puras: no requieren Docker ni acceso de red."""
from __future__ import annotations

import unittest
from inspect_distroless_candidate import IMAGES, NAMES, render, validate

ID = "sha256:" + "a" * 64


def example_data():
    return {"Id": ID, "Config": {"User": "1000:1000", "Entrypoint": ["/nodejs/bin/node"]}}


def example_probe():
    return {"uid": 1000, "cap_eff": "0000000000000000", "no_new_privs": "1",
            "seccomp": "2", "binaries": {key: False for key in NAMES}}


class InspectorTests(unittest.TestCase):
    def test_valid_image(self):
        item = validate(IMAGES[0], example_data(), example_probe())
        self.assertEqual(item["id"], ID)
        self.assertEqual(item["probe"]["uid"], 1000)

    def test_invalid_image_tag(self):
        with self.assertRaises(ValueError):
            validate("untrusted:image", example_data(), example_probe())

    def test_bad_id(self):
        image = example_data()
        image["Id"] = "sha256:wrong"
        with self.assertRaises(ValueError):
            validate(IMAGES[0], image, example_probe())

    def test_unprivileged_user_required(self):
        image = example_data()
        image["Config"]["User"] = "root"
        with self.assertRaises(ValueError):
            validate(IMAGES[0], image, example_probe())

    def test_distroless_entrypoint_required(self):
        image = example_data()
        image["Config"]["Entrypoint"] = ["/bin/sh"]
        with self.assertRaises(ValueError):
            validate(IMAGES[0], image, example_probe())

    def test_zero_caps_required(self):
        probe = example_probe()
        probe["cap_eff"] = "0000000000000001"
        with self.assertRaises(ValueError):
            validate(IMAGES[0], example_data(), probe)

    def test_seccomp_and_privilege_flags(self):
        probe = example_probe()
        probe["seccomp"] = "0"
        with self.assertRaises(ValueError):
            validate(IMAGES[0], example_data(), probe)
        probe = example_probe()
        probe["no_new_privs"] = "0"
        with self.assertRaises(ValueError):
            validate(IMAGES[0], example_data(), probe)

    def test_all_risk_binaries_required_in_report(self):
        probe = example_probe()
        del probe["binaries"]["mount"]
        with self.assertRaises(ValueError):
            validate(IMAGES[0], example_data(), probe)

    def test_report_matches_existing_candidate_parser(self):
        api = validate(IMAGES[0], example_data(), example_probe())
        webdata = example_data()
        webdata["Id"] = "sha256:" + "b" * 64
        web = validate(IMAGES[1], webdata, example_probe())
        output = render([api, web])
        self.assertEqual(output.count(f"## `{IMAGES[0]}`"), 1)
        self.assertIn(f"- ID de imagen: `{ID}`", output)
        self.assertIn("NO AUTORIZA GHCR", output)
        self.assertNotIn("APPROVED_EXCEPTION", output)


if __name__ == "__main__":
    unittest.main()
