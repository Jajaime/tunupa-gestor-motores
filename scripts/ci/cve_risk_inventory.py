#!/usr/bin/env python3
"""Revisar desvio de CVE HIGH conocidas. NO autoriza publicar imagenes.

Uso: python3 scripts/ci/cve_risk_inventory.py BASELINE.json API.json WEB.json

La lista inicial de CVE es un *inventario de investigacion*, no una allowlist
ni un mecanismo de aceptacion de riesgos. Una CVE nueva, un CRITICAL o un HIGH
con FixedVersion hace fallar el paso. Una CVE conocida sigue pendiente de
aprobacion humana aunque este programa termine con codigo 0.
"""
from __future__ import annotations

from collections import defaultdict
import json
import os
from pathlib import Path
import re
import sys

CVE_FORMAT = re.compile(r"^CVE-\d{4}-\d{4,}$")


def load_baseline(filename: str) -> dict[str, dict]:
    data = json.loads(Path(filename).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ValueError("Inventario sin version de esquema reconocida")
    if data.get("status") != "PENDING_REVIEW_NOT_APPROVED":
        raise ValueError("La lista es solo para riesgos pendientes; no acepta aprobaciones")
    cves = data.get("cves")
    if not isinstance(cves, list) or not cves:
        raise ValueError("Faltan CVE de referencia")
    known = {}
    for item in cves:
        if not isinstance(item, dict):
            raise ValueError("CVE de referencia no es un objeto")
        ident = item.get("id")
        if not isinstance(ident, str) or not CVE_FORMAT.fullmatch(ident):
            raise ValueError("Identificador CVE invalido")
        if ident in known:
            raise ValueError(f"CVE duplicada en el inventario: {ident}")
        known[ident] = item
    return known


def read_scan(filename: str) -> tuple[dict[str, set[str]], list[str]]:
    report = json.loads(Path(filename).read_text(encoding="utf-8"))
    if not isinstance(report, dict) or not isinstance(report.get("Results"), list):
        raise ValueError(f"Trivy no produjo un informe valido: {filename}")
    high = defaultdict(set)
    blocking = []
    for result in report["Results"]:
        if not isinstance(result, dict):
            raise ValueError("Registro Trivy invalido")
        vulns = result.get("Vulnerabilities") or []
        if not isinstance(vulns, list):
            raise ValueError("Vulnerabilities debe ser una lista")
        for finding in vulns:
            if not isinstance(finding, dict):
                raise ValueError("Vulnerabilidad invalida")
            severity = finding.get("Severity")
            if severity not in ("HIGH", "CRITICAL"):
                continue
            ident = finding.get("VulnerabilityID")
            if not isinstance(ident, str) or not CVE_FORMAT.fullmatch(ident):
                raise ValueError("Hallazgo alto/critico sin CVE valida")
            fixed = finding.get("FixedVersion") or ""
            if not isinstance(fixed, str):
                raise ValueError("FixedVersion invalida")
            if severity == "CRITICAL" or fixed.strip():
                blocking.append(ident)
            elif severity == "HIGH":
                pkg = finding.get("PkgName") or "(sin paquete)"
                high[ident].add(str(pkg))
    return dict(high), blocking


def evaluate(baseline: dict[str, dict], reports: list[tuple[str, dict[str, set[str]], list[str]]]) -> tuple[str, bool]:
    discovered = set()
    blockers = set()
    for _, cves, errors in reports:
        discovered.update(cves)
        blockers.update(errors)
    unexpected = discovered - set(baseline)
    lines = [
        "## Tunupa — inventario de CVE HIGH sin correccion indicada",
        "**ESTADO: PENDIENTE. Esta verificacion NO aprueba GHCR ni despliegue.**",
        "",
        "El preflight de seguridad continua siendo obligatorio y separado de la aceptacion humana.",
        "",
        "| CVE | Paquete fuente | " + " | ".join(name for name, _, _ in reports) + " |",
        "| --- | --- | " + " | ".join("---" for _ in reports) + " |",
    ]
    for ident in sorted(discovered):
        src = baseline.get(ident, {}).get("source_package", "NUEVA CVE: REVISAR")
        cells = [", ".join(sorted(cves.get(ident, []))) or "—" for _, cves, _ in reports]
        lines.append("| `" + ident + "` | " + str(src) + " | " + " | ".join(cells) + " |")
    if not discovered:
        lines.append("| — | Sin HIGH pendientes detectadas en estos informes | " + " | ".join("—" for _ in reports) + " |")
    lines.extend([
        "",
        f"CVE distintas HIGH sin FixedVersion: **{len(discovered)}**.",
        f"CVE nuevas, fuera del inventario: **{len(unexpected)}**.",
        f"CVE criticas o con correccion indicada: **{len(blockers)}**.",
        "Las CVE conocidas que permanecen en la imagen NO estan aceptadas automaticamente.",
        "Revisar los registros oficiales, la explotabilidad, las mitigaciones y obtener aprobacion expresa fuera de este script.",
    ])
    if unexpected:
        lines.append("NUEVAS: " + ", ".join(f"`{x}`" for x in sorted(unexpected)))
    if blockers:
        lines.append("BLOQUEANTES: " + ", ".join(f"`{x}`" for x in sorted(blockers)))
    return "\n".join(lines) + "\n", not unexpected and not blockers


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print("Uso: cve_risk_inventory.py BASELINE.json API.json WEB.json", file=sys.stderr)
        return 2
    try:
        baseline = load_baseline(argv[1])
        reports = []
        for name, file in zip(("API", "Web"), argv[2:]):
            cves, blockers = read_scan(file)
            reports.append((name, cves, blockers))
        summary, ok = evaluate(baseline, reports)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Error de validacion: {exc}", file=sys.stderr)
        return 1
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as handle:
            handle.write(summary + "\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
