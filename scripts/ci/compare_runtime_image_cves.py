#!/usr/bin/env python3
"""Comparacion descriptiva de CVE en imagenes de prueba; NUNCA aprueba GHCR.

Ejemplo:
 python3 scripts/ci/compare_runtime_image_cves.py \
   trivy-api-debian.json trivy-api-distroless.json \
   trivy-web-debian.json trivy-web-distroless.json
"""
from __future__ import annotations

from collections import Counter
import json
import os
from pathlib import Path
import sys


class InvalidScan(ValueError):
    """El escaneo Trivy es parcial o no permite una comparacion confiable."""


def read_scan(filename: str) -> dict:
    data = json.loads(Path(filename).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("Results"), list):
        raise InvalidScan(f"Trivy JSON sin resultados: {filename}")
    counts = Counter()
    by_id: dict[str, set[str]] = {}
    for part in data["Results"]:
        if not isinstance(part, dict):
            raise InvalidScan(f"Seccion Trivy no es objeto: {filename}")
        vulns = part.get("Vulnerabilities") or []
        if not isinstance(vulns, list):
            raise InvalidScan(f"Vulnerabilities no es lista: {filename}")
        for v in vulns:
            if not isinstance(v, dict):
                raise InvalidScan(f"Vulnerabilidad no es objeto: {filename}")
            severity = v.get("Severity")
            if severity not in ("HIGH", "CRITICAL"):
                continue
            ident = v.get("VulnerabilityID")
            package = v.get("PkgName")
            if not isinstance(ident, str) or not ident or not isinstance(package, str) or not package:
                raise InvalidScan(f"Hallazgo sin ID o paquete: {filename}")
            counts[severity] += 1
            by_id.setdefault(ident, set()).add(package)
    return {"high": counts["HIGH"], "critical": counts["CRITICAL"], "by_id": by_id}


def compare_scans(scans: dict[str, dict]) -> str:
    labels = (("API Debian", "api_debian"), ("API Distroless", "api_distroless"),
              ("Web Debian", "web_debian"), ("Web Distroless", "web_distroless"))
    lines = [
        "## Tunupa 18c2 — Comparacion experimental de imagenes (NO publicadas)", "",
        "**Resultado informativo, no es aceptacion de CVE ni autorizacion para GHCR.**", "",
        "| Imagen | HIGH | CRITICAL | IDs distintos (CVE/GHSA) |",
        "|---|---:|---:|---:|",
    ]
    for label, key in labels:
        s = scans[key]
        lines.append(f"| {label} | {s['high']} | {s['critical']} | {len(s['by_id'])} |")
    for service in ("api", "web"):
        baseline = set(scans[f"{service}_debian"]["by_id"])
        alternative = set(scans[f"{service}_distroless"]["by_id"])
        removed = sorted(baseline - alternative)
        introduced = sorted(alternative - baseline)
        remaining = sorted(baseline & alternative)
        lines += ["", f"### {service.upper()}",
                  f"- IDs no observados en Distroless respecto de Debian: {', '.join(removed) or 'ninguno'}",
                  f"- IDs nuevos respecto de Debian: {', '.join(introduced) or 'ninguno'}",
                  f"- IDs presentes en ambas alternativas: {', '.join(remaining) or 'ninguno'}"]
    lines += ["", "**Limitaciones:** ausencia en Trivy puede corresponder a paquetes eliminados, "
              "diferencias de identificacion o base de datos. Se requiere confirmar SBOM, "
              "dependencias nativas, funcionalidad y pruebas reales antes de adoptar el runtime.",
              "No se crea ninguna excepcion; `security/release-risk-reviews.json` sigue con estados PENDING.",
              "Las imagenes Web de prueba usan `example.invalid` y NO deben desplegarse.", ""]
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print("Uso: compare_runtime_image_cves.py API_DEBIAN API_DISTROLESS WEB_DEBIAN WEB_DISTROLESS", file=sys.stderr)
        return 2
    try:
        scans = {name: read_scan(path) for name, path in zip(
            ("api_debian", "api_distroless", "web_debian", "web_distroless"), argv[1:])}
        report = compare_scans(scans)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: no se pudo comparar Trivy: {exc}", file=sys.stderr)
        return 1
    print(report)
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fp:
            fp.write(report + "\n")
    # La decision es humana. Este informe solo falla por datos incompletos.
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
