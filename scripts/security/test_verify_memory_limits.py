"""Tests for 18b5 resource-limit checks; no Docker dependency."""
import unittest

from verify_memory_limits import MIB, validate


def sample(**overrides):
    info = {
        "HostConfig": {"Memory": 768 * MIB},
        "State": {"Running": True, "OOMKilled": False, "Health": {"Status": "healthy"}},
    }
    for key, value in overrides.items():
        if key == "memory":
            info["HostConfig"]["Memory"] = value
        elif key == "running":
            info["State"]["Running"] = value
        elif key == "oom":
            info["State"]["OOMKilled"] = value
        elif key == "health":
            info["State"]["Health"] = value
    return info


class LimitsTests(unittest.TestCase):
    def test_expected_limit_healthy(self):
        self.assertEqual(validate(sample(), 768), [])

    def test_memory_limit_missing(self):
        self.assertIn("Memory", " ".join(validate(sample(memory=0), 768)))

    def test_different_memory_limit_rejected(self):
        self.assertTrue(validate(sample(memory=512 * MIB), 768))

    def test_not_running(self):
        self.assertTrue(validate(sample(running=False), 768))

    def test_oom_was_detected(self):
        self.assertTrue(validate(sample(oom=True), 768))

    def test_missing_health_information(self):
        self.assertTrue(validate(sample(health=None), 768))

    def test_malformed_inspect(self):
        with self.assertRaises(ValueError):
            validate({"HostConfig": {}}, 768)

    def test_too_small_limit(self):
        with self.assertRaises(ValueError):
            validate(sample(), 100)

    def test_failure_when_missing_oom_field(self):
        item = sample()
        del item["State"]["OOMKilled"]
        self.assertTrue(validate(item, 768))


if __name__ == "__main__":
    unittest.main()
