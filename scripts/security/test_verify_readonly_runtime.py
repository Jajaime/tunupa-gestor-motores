import unittest

from verify_readonly_runtime import validate_runtime


def valid_host():
    return {
        "ReadonlyRootfs": True,
        "CapDrop": ["ALL"],
        "SecurityOpt": ["no-new-privileges:true"],
        "PidsLimit": 256,
        "Tmpfs": {
            "/tmp": "rw,nosuid,nodev,noexec,size=64m,uid=1000,gid=1000,mode=1777",
            "/app/.next/cache": "rw,nosuid,nodev,noexec,size=128m,uid=1000,gid=1000,mode=0700",
        },
    }


class RuntimeChecksTest(unittest.TestCase):
    def test_api_valid(self):
        self.assertEqual(validate_runtime(valid_host(), "node", "api"), [])

    def test_web_valid(self):
        self.assertEqual(validate_runtime(valid_host(), "node", "web"), [])

    def test_read_only_is_mandatory(self):
        h = valid_host()
        h["ReadonlyRootfs"] = False
        self.assertTrue(any("ReadonlyRootfs" in e for e in validate_runtime(h, "node", "api")))

    def test_cache_mount_is_required_in_web(self):
        h = valid_host()
        del h["Tmpfs"]["/app/.next/cache"]
        self.assertTrue(any(".next/cache" in e for e in validate_runtime(h, "node", "web")))

    def test_no_new_privileges_and_cap_drop_are_required(self):
        h = valid_host()
        h["CapDrop"] = []
        h["SecurityOpt"] = []
        errors = validate_runtime(h, "node", "api")
        self.assertEqual(len(errors), 2)

    def test_user_and_tmpfs_security_flags_are_required(self):
        h = valid_host()
        h["Tmpfs"]["/tmp"] = "rw,uid=1000,gid=1000"
        errors = validate_runtime(h, "root", "api")
        self.assertTrue(any("USER" in e for e in errors))
        self.assertTrue(any("noexec" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
