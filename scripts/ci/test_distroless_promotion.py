"""18c5: Tests estáticos para la promoción y reversión (sin Docker)."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


def source(path):
    return (ROOT / path).read_text(encoding="utf-8")


class PromotionTests(unittest.TestCase):
    def test_api_is_distroless_nonroot(self):
        s = source("apps/api/Dockerfile")
        self.assertIn("FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner", s)
        self.assertIn("USER 1000:1000", s)
        self.assertIn('CMD ["dist/main.js"]', s)
        self.assertIn("npm ci --omit=dev", s)

    def test_web_is_distroless_and_build_arg(self):
        s = source("apps/web/Dockerfile")
        self.assertIn("FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner", s)
        self.assertIn("USER 1000:1000", s)
        self.assertIn("ARG NEXT_PUBLIC_API_URL", s)
        self.assertIn('CMD ["server.js"]', s)

    def test_original_dockerfiles_preserved(self):
        for service in ("api", "web"):
            s = source(f"apps/{service}/Dockerfile.debian-rollback")
            self.assertIn("FROM node:24-trixie-slim AS runner", s)
            self.assertNotIn("distroless/nodejs24-debian13", s)

    def test_compose_healthchecks_absolute_node(self):
        s = source("compose.docker.yaml")
        self.assertEqual(s.count("        - /nodejs/bin/node"), 2)
        self.assertNotIn("        - node\n", s)

    def test_rollback_overrides_default_images_and_health(self):
        s = source("compose.debian-rollback.yaml")
        for service in ("api", "web"):
            self.assertIn("dockerfile: Dockerfile.debian-rollback", s)
            self.assertIn(f"image: tunupa-{service}:debian-rollback-local", s)
        self.assertEqual(s.count("        - node\n"), 2)

    def test_candidate_uses_distroless_probe(self):
        s = source(".github/workflows/release-candidate.yml")
        self.assertIn("scripts/security/inspect_distroless_candidate.py", s)
        self.assertNotIn("scripts/security/inspect_runtime_exposure.py", s)
        self.assertIn("scripts/ci/candidate_evidence.py", s)
        self.assertIn("trivy-release-api.json", s)
        self.assertIn("sbom-release-web.cdx.json", s)

    def test_candidate_does_not_publish_and_web_not_deployable(self):
        s = source(".github/workflows/release-candidate.yml")
        self.assertIn("contents: read", s)
        self.assertNotIn("packages: write", s)
        self.assertNotIn("docker push", s)
        self.assertIn("https://example.invalid/api/v1", s)
        self.assertIn("NO AUTORIZADO PARA GHCR", s)

    def test_hardening_preserved(self):
        self.assertIn("cap_drop:", source("compose.hardening.yaml"))
        self.assertIn("read_only: true", source("compose.readonly.yaml"))
        self.assertIn("mem_limit: 768m", source("compose.resources.yaml"))


if __name__ == '__main__':
    unittest.main()
