"""Pruebas sin acceso a Docker; la prueba real requiere los contenedores locales."""
import unittest
from check_live_cve_conditions import LIBRARY_MARKERS, render, validate_container, validate_processes


def example_process(**updates):
    value = {
        "uid": "1000", "cap_eff": "0000000000000000", "no_new_privs": "1", "seccomp": "2",
        "loaded_libraries": {name: False for name in LIBRARY_MARKERS},
    }
    value.update(updates)
    return value


def example_container(**changes):
    value = {
        "Image": "sha256:abc", "Config": {"User": "node"}, "Mounts": [],
        "HostConfig": {
            "Privileged": False, "ReadonlyRootfs": True, "PidMode": "", "NetworkMode": "tunupa_default",
            "CapAdd": None, "CapDrop": ["ALL"], "SecurityOpt": ["no-new-privileges:true"],
            "PidsLimit": 256, "Memory": 0,
        },
    }
    value["HostConfig"].update(changes)
    return value


class RuntimeCheckTests(unittest.TestCase):
    def test_valid_container_reports_memory_observation(self):
        img, issues, warnings = validate_container(example_container())
        self.assertEqual(img, "sha256:abc")
        self.assertFalse(issues)
        self.assertTrue(any("memoria" in x for x in warnings))

    def test_privilege_and_missing_hardening_are_errors(self):
        _, issues, _ = validate_container(example_container(Privileged=True, CapDrop=[], ReadonlyRootfs=False))
        self.assertEqual(len(issues), 3)

    def test_binds_are_flagged_without_printing_sources(self):
        c = example_container()
        c["Mounts"] = [{"Type": "bind", "Source": "/private/secret", "Destination": "/app/data"}]
        _, issues, _ = validate_container(c)
        self.assertEqual(len(issues), 1)
        self.assertNotIn("/private/secret", str(issues))

    def test_host_modes_and_capadd_are_errors(self):
        _, issues, _ = validate_container(example_container(PidMode="host", NetworkMode="host", CapAdd=["SYS_ADMIN"]))
        self.assertEqual(len(issues), 3)

    def test_valid_node_process(self):
        processes, errors = validate_processes({"processes": [example_process()]})
        self.assertEqual(len(processes), 1)
        self.assertFalse(errors)

    def test_process_with_effective_capabilities_is_flagged(self):
        _, errors = validate_processes({"processes": [example_process(cap_eff="0000000000000001")]})
        self.assertEqual(len(errors), 1)

    def test_missing_or_partial_process_rejected(self):
        with self.assertRaises(ValueError):
            validate_processes({"processes": []})
        with self.assertRaises(ValueError):
            validate_processes({"processes": [{"uid": "1000", "loaded_libraries": {}}]})

    def test_report_does_not_authorize_publish(self):
        item = {"service": "api", "image_id": "sha256:abc", "processes": [example_process()], "failures": [], "observations": []}
        output = render([item])
        self.assertIn("NO APRUEBA", output)
        self.assertIn("sha256:abc", output)
        self.assertNotIn("APROBADO PARA GHCR", output)


if __name__ == "__main__":
    unittest.main()
