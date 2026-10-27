#!/usr/bin/env python3
"""Manifest for exact local candidate images, Trivy JSON and CycloneDX SBOMs.

Evidence only. No publishing, risk acceptance, registry digest or attestation.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")


def read_json(path: str) -> dict:
    result = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(result, dict):
        raise ValueError(f"JSON de objeto requerido: {path}")
    return result


def sha256_file(path: str) -> str:
    checksum = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(block)
    return "sha256:" + checksum.hexdigest()


def image_identity(image: str) -> str:
    result = subprocess.run(
        ["docker", "image", "inspect", "--format", "{{.Id}}", image],
        capture_output=True, text=True, timeout=60, check=False,
    )
    if result.returncode:
        raise ValueError(f"No se pudo inspeccionar la imagen candidata {image}")
    identity = result.stdout.strip()
    if not IMAGE_ID.fullmatch(identity):
        raise ValueError(f"ID de imagen invalido para {image}")
    return identity


def runtime_identity(report: str, image: str) -> str:
    # Bind each image ID to its own Markdown section rather than looking for
    # an unscoped SHA string that could accidentally belong to the other image.
    marker = f"## `{image}`"
    sections = report.split(marker)
    if len(sections) != 2:
        raise ValueError(f"Informe runtime sin seccion unica para {image}")
    body = sections[1].split("\n## ", 1)[0]
    match = re.search(r"(?m)^- ID de imagen: `(sha256:[0-9a-f]{64})`$", body)
    if not match:
        raise ValueError(f"Informe runtime sin ID valido para {image}")
    return match.group(1)


def verify_image(image: str, actual_id: str, trivy_path: str,
                 sbom_path: str, runtime_report: str) -> dict:
    scan = read_json(trivy_path)
    if scan.get("ArtifactName") != image or not isinstance(scan.get("Results"), list):
        raise ValueError(f"Informe Trivy no corresponde a {image}")
    reported_id = (scan.get("Metadata") or {}).get("ImageID")
    if reported_id != actual_id or not IMAGE_ID.fullmatch(str(reported_id)):
        raise ValueError(f"Trivy no analizo el ID de imagen actual de {image}")
    if runtime_identity(runtime_report, image) != actual_id:
        raise ValueError(f"Inspeccion runtime no corresponde a {image}")
    sbom = read_json(sbom_path)
    comps = sbom.get("components")
    if sbom.get("bomFormat") != "CycloneDX" or not isinstance(sbom.get("specVersion"), str):
        raise ValueError(f"SBOM no es CycloneDX valido para {image}")
    if not isinstance(comps, list) or not comps or any(not isinstance(c, dict) for c in comps):
        raise ValueError(f"SBOM sin componentes validos para {image}")
    meta = sbom.get("metadata")
    if not isinstance(meta, dict) or not isinstance(meta.get("component"), dict):
        raise ValueError(f"SBOM sin metadata de componente para {image}")
    if meta["component"].get("name") != image:
        raise ValueError(f"SBOM corresponde a otra imagen: {image}")
    return {
        "tag": image,
        "image_config_id": actual_id,
        "trivy_json_sha256": sha256_file(trivy_path),
        "sbom_cyclonedx_sha256": sha256_file(sbom_path),
        "sbom_components": len(comps),
    }


def build_manifest(api_id: str, web_id: str, api: str, web: str,
                   api_sbom: str, web_sbom: str, runtime: str, sha: str) -> dict:
    if not COMMIT.fullmatch(sha):
        raise ValueError("GITHUB_SHA no es un commit hexadecimal de 40 caracteres")
    evidence = Path(runtime).read_text(encoding="utf-8")
    api_tag = "tunupa-api:release-candidate"
    web_tag = "tunupa-web:release-candidate"
    result = {
        "schema_version": 1,
        "source_commit": sha,
        "collected_at_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "EVIDENCE_ONLY_NO_PUBLISH",
        "publication_authorized": False,
        "runtime_evidence_sha256": sha256_file(runtime),
        "images": {
            "api": verify_image(api_tag, api_id, api, api_sbom, evidence),
            "web": verify_image(web_tag, web_id, web, web_sbom, evidence),
        },
        "notes": (
            "image_config_id is a LOCAL image configuration ID, not a GHCR registry "
            "manifest digest. The example.invalid Web bundle is NOT deployable. "
            "Hashes prove file bytes, not origin or risk approval."
        ),
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", required=True)
    parser.add_argument("--web", required=True)
    parser.add_argument("--api-sbom", required=True)
    parser.add_argument("--web-sbom", required=True)
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--output", required=True)
    opts = parser.parse_args()
    try:
        sha = os.environ.get("GITHUB_SHA", "")
        result = build_manifest(
            image_identity("tunupa-api:release-candidate"),
            image_identity("tunupa-web:release-candidate"),
            opts.api, opts.web, opts.api_sbom, opts.web_sbom, opts.runtime, sha,
        )
        Path(opts.output).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except (ValueError, OSError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        print(f"ERROR: no se pudo generar evidencia candidata: {exc}", file=sys.stderr)
        return 1
    print("OK: las identidades Docker coinciden con Trivy y la inspeccion runtime; SBOMs validados")
    print("NO AUTORIZADO PARA PUBLICAR: evidencia tecnica sin aprobacion de CVE")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write("### Tunupa — identidad y SBOM de imagenes candidatas (sin publicacion)\n")
            for service, info in result["images"].items():
                out.write(f"- {service}: `{info['image_config_id']}`, componentes SBOM: {info['sbom_components']}\n")
            out.write("- **Solo evidencia, no aprobacion GHCR ni digest de registro.**\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
