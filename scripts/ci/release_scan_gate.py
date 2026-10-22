#!/usr/bin/env python3
"""Clasifica los hallazgos Trivy de imagenes candidatas sin aprobar su publicacion.

Politica preliminar: bloquear CRITICAL (con o sin correccion) y HIGH con
FixedVersion. Los HIGH sin correccion son riesgos pendientes de revision humana;
no se convierten automaticamente en una excepcion aceptada ni permiten deploy.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys


def assess(path: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    report = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(report, dict) or not isinstance(report.get("Results"), list):
        raise ValueError(f"Informe Trivy incompleto o invalido: {path}")
    blocking: list[dict[str, str]] = []
    pending: list[dict[str, str]] = []
    for result in report["Results"]:
        if not isinstance(result, dict):
            raise ValueError("Results debe contener objetos")
        vulnerabilities = result.get("Vulnerabilities") or []
        if not isinstance(vulnerabilities, list):
            raise ValueError("Vulnerabilities debe ser una lista")
        for finding in vulnerabilities:
            if not isinstance(finding, dict):
                raise ValueError("Vulnerability invalida")
            severity = str(finding.get("Severity", "")).upper()
            if severity not in {"HIGH", "CRITICAL"}:
                continue
            item = {
                "id": str(finding.get("VulnerabilityID") or "UNKNOWN"),
                "pkg": str(finding.get("PkgName") or "UNKNOWN"),
                "severity": severity,
                "fixed": str(finding.get("FixedVersion") or "").strip(),
            }
            if severity == "CRITICAL" or item["fixed"]:
                blocking.append(item)
            else:
                pending.append(item)
    return blocking, pending


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: release_scan_gate.py TRIVY_API.json TRIVY_WEB.json", file=sys.stderr)
        return 2
    summary = [
        "## Tunupa - resultado de imagenes candidatas (NO publicadas)",
        "Las CVE HIGH sin version corregida requieren evaluacion y aceptacion externa;",
        "este workflow **no autoriza** publicacion ni despliegue.",
    ]
    total_blocking = 0
    total_pending = 0
    try:
        for path in sys.argv[1:]:
            blocking, pending = assess(path)
            total_blocking += len(blocking)
            total_pending += len(pending)
            summary.append(f"### `{Path(path).name}`")
            summary.append(f"- Bloqueantes: **{len(blocking)}** (CRITICAL o HIGH con version corregida)")
            summary.append(f"- HIGH sin version corregida indicada: **{len(pending)}**")
            grouped: dict[str, set[str]] = {}
            for item in pending:
                grouped.setdefault(item["id"], set()).add(item["pkg"])
            if grouped:
                summary.append("- CVE pendientes y paquetes afectados:")
                for cve, pkgs in sorted(grouped.items()):
                    summary.append(f"  - `{cve}`: {', '.join(sorted(pkgs))}")
            for item in blocking:
                summary.append(f"- BLOQUEO: `{item['id']}` / `{item['pkg']}` "
                               f"({item['severity']}, fixed: {item['fixed'] or 'no indicada'})")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Error en reporte de Trivy: {exc}", file=sys.stderr)
        return 1
    summary.append(f"\n**Resultado:** {total_blocking} hallazgos bloqueantes; "
                   f"{total_pending} HIGH pendientes de evaluacion.")
    text = "\n".join(summary) + "\n"
    print(text)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as file:
            file.write(text)
    return 1 if total_blocking else 0


if __name__ == "__main__":
    sys.exit(main())
