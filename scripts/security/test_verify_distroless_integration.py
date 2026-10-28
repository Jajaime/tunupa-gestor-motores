"""Unit tests for the local Distroless integration inspector, without Docker."""
from __future__ import annotations

import unittest
from verify_distroless_integration import IMAGES, TMPFS, MIB, one_inspect, validate


def sample(service: str = "api") -> dict:
    tmpfs = {
        p: "rw,nosuid,nodev,noexec,size=64m,uid=1000,gid=1000,mode=1777"
        for p in TMPFS[service]
    }
    return {
        "Image": "sha256:test",
        "Config": {
            "User": "1000:1000", "Image": IMAGES[service],
            "Healthcheck": {"Test": ["CMD", "/nodejs/bin/node", "-e", "fetch('http://127.0.0.1/')"]},
        },
        "HostConfig": {
            "Memory": 768 * MIB, "ReadonlyRootfs": True, "Privileged": False,
            "CapAdd": None, "CapDrop": ["ALL"], "SecurityOpt": ["no-new-privileges:true"],
            "PidsLimit": 256, "PidMode": "", "NetworkMode": "bridge", "Tmpfs": tmpfs,
        },
        "State": {"Running": True, "OOMKilled": False, "Health": {"Status": "healthy"}},
        "Mounts": [],
    }


class DistrolessTests(unittest.TestCase):
    def test_api_valid(self):
        self.assertEqual(validate("api", sample(), "sha256:test"), [])

    def test_web_valid(self):
        self.assertEqual(validate("web", sample("web"), "sha256:test"), [])

    def test_image_mismatch_fails(self):
        self.assertTrue(any("ID de imagen" in x for x in validate("api", sample(), "sha256:old")))

    def test_original_debian_image_fails(self):
        value = sample()
        value["Config"]["Image"] = "tunupa-api:local"
        self.assertTrue(validate("api", value, "sha256:test"))

    def test_nonroot_user_must_be_numeric(self):
        value = sample()
        value["Config"]["User"] = "root"
        self.assertTrue(validate("api", value, "sha256:test"))

    def test_healthcheck_absolute_node_required(self):
        value = sample()
        value["Config"]["Healthcheck"]["Test"][1] = "node"
        self.assertTrue(validate("api", value, "sha256:test"))

    def test_hardening_required(self):
        value = sample()
        value["HostConfig"].update({"Privileged": True, "ReadonlyRootfs": False,
                                    "CapDrop": [], "Memory": 0})
        self.assertGreaterEqual(len(validate("api", value, "sha256:test")), 4)

    def test_web_cache_mount_required(self):
        value = sample("web")
        del value["HostConfig"]["Tmpfs"]["/app/.next/cache"]
        self.assertTrue(any("cache" in x for x in validate("web", value, "sha256:test")))

    def test_bad_docker_inspect_rejected(self):
        with self.assertRaises(ValueError):
            one_inspect("[]")
        with self.assertRaises(ValueError):
            one_inspect("[{},{}]")

    def test_no_publication_or_approval_paths(self):
        self.assertNotIn("ghcr.io", str(IMAGES))
        self.assertNotIn("APPROVED_EXCEPTION", str(sample()))


if __name__ == "__main__":
    unittest.main()
