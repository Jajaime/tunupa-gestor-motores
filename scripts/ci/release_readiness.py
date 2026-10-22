#!/usr/bin/env python3
"""Revision de preparacion de GHCR. No realiza publicaciones ni acepta riesgos.

report: muestra riesgos pendientes (no es una aprobacion de release).
check: prerrequisito tecnico para un futuro publisher; requiere Trivy,
       origen HTTPS y constancias de revision. NO sustituye aprobacion
       verificable mediante GitHub Environments con revisores obligatorios.
"""
from __future__ import annotations

import argparse
from datetime import date
import ipaddress
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

CVE = re.compile(r"^CVE-\d{4}-\d{4,}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ALLOWED = {"PENDING", "APPROVED_EXCEPTION"}


def read_obj(filename: str) -> dict:
    value = json.loads(Path(filename).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Objeto JSON requerido: {filename}")
    return value


def get_items(value: dict, field: str) -> list[dict]:
    items = value.get(field)
    if not isinstance(items, list):
        raise ValueError(f"Campo de lista ausente: {field}")
    if any(not isinstance(item, dict) for item in items):
        raise ValueError(f"Elementos invalidos: {field}")
    return items


def load_inventory(path: str) -> dict[str, dict]:
    value = read_obj(path)
    if value.get("schema_version") != 1 or value.get("status") != "PENDING_REVIEW_NOT_APPROVED":
        raise ValueError("Inventario no aprobado esperado en schema_version=1")
    items = get_items(value, "cves")
    result = {}
    for entry in items:
        ident = entry.get("id")
        if not isinstance(ident, str) or not CVE.fullmatch(ident) or ident in result:
            raise ValueError(f"CVE invalida o duplicada: {ident}")
        result[ident] = entry
    if not result:
        raise ValueError("Inventario de CVE vacio")
    return result


def load_reviews(path: str, expected_ids: set[str]) -> dict[str, dict]:
    value = read_obj(path)
    if value.get("schema_version") != 1 or value.get("publication_authorized") is not False:
        raise ValueError("Las revisiones preliminares deben indicar publication_authorized=false")
    result = {}
    for entry in get_items(value, "reviews"):
        ident = entry.get("id")
        if not isinstance(ident, str) or not CVE.fullmatch(ident) or ident in result:
            raise ValueError(f"Revision CVE invalida o duplicada: {ident}")
        if entry.get("status") not in ALLOWED:
            raise ValueError(f"Estado de revision desconocido: {ident}")
        result[ident] = entry
    if set(result) != expected_ids:
        raise ValueError(f"Revisiones incompletas o ajenas al inventario; faltan={sorted(expected_ids-set(result))}; extras={sorted(set(result)-expected_ids)}")
    return result


def validate_origin(origin: str) -> bool:
    try:
        url = urlsplit(origin)
    except ValueError:
        return False
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        return False
    if url.path not in ("", "/") or url.query or url.fragment:
        return False
    try:
        if url.port not in (None, 443):
            return False
    except ValueError:
        return False
    host = url.hostname.lower().rstrip(".")
    if host in {"localhost", "example.com", "example.org", "example.net"}:
        return False
    if host.endswith((".localhost", ".local", ".invalid", ".test", ".example")):
        return False
    if "." not in host or len(host) > 253 or not all(
        0 < len(label) <= 63 and re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", label)
        for label in host.split(".")
    ):
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        return True


def read_findings(path: str) -> tuple[set[str], list[str]]:
    value = read_obj(path)
    result_list = get_items(value, "Results")
    high_without_fix: set[str] = set()
    blockers: list[str] = []
    for section in result_list:
        findings = section.get("Vulnerabilities") or []
        if not isinstance(findings, list) or any(not isinstance(v, dict) for v in findings):
            raise ValueError(f"Vulnerabilities invalidas: {path}")
        for finding in findings:
            level = finding.get("Severity")
            if level not in ("HIGH", "CRITICAL"):
                continue
            ident = finding.get("VulnerabilityID")
            if not isinstance(ident, str) or not CVE.fullmatch(ident):
                raise ValueError(f"CVE incompleta en {path}")
            fixed = finding.get("FixedVersion") or ""
            if not isinstance(fixed, str):
                raise ValueError(f"FixedVersion invalida en {path}")
            if level == "CRITICAL" or fixed.strip():
                blockers.append(f"{ident} [{level}, version corregida: {fixed or 'no indicada'}]")
            else:
                high_without_fix.add(ident)
    return high_without_fix, blockers


def approval_problems(entry: dict, today: date) -> list[str]:
    ident = entry["id"]
    if entry["status"] != "APPROVED_EXCEPTION":
        return [f"{ident}: revision pendiente"]
    failures = []
    for field in ("risk_owner", "approver", "technical_justification", "evidence_url", "approved_at", "review_by"):
        value = entry.get(field)
        if not isinstance(value, str) or not value.strip():
            failures.append(f"{ident}: falta {field}")
    if failures:
        return failures
    if len(entry["technical_justification"].strip()) < 40:
        failures.append(f"{ident}: justificacion insuficiente")
    ev = urlsplit(entry["evidence_url"])
    if ev.scheme != "https" or not ev.netloc:
        failures.append(f"{ident}: evidencia debe tener URL HTTPS")
    for field in ("approved_at", "review_by"):
        val = entry[field]
        try:
            if not DATE.fullmatch(val):
                raise ValueError()
            parsed = date.fromisoformat(val)
        except ValueError:
            failures.append(f"{ident}: fecha invalida {field}")
            continue
        if field == "approved_at" and parsed > today:
            failures.append(f"{ident}: aprobacion fechada en el futuro")
        if field == "review_by" and parsed < today:
            failures.append(f"{ident}: excepcion vencida")
    return failures


def assess(inventory: dict[str, dict], reviews: dict[str, dict], today: date,
           origin: str | None, scan_api: str | None, scan_web: str | None, require_release: bool) -> tuple[list[str], list[str]]:
    errors = []
    scanned: set[str] = set()
    if scan_api and scan_web:
        for name, path in (("API", scan_api), ("Web", scan_web)):
            high, blocking = read_findings(path)
            scanned |= high
            errors += [f"{name}: hallazgo bloqueante {x}" for x in blocking]
        unlisted = scanned - set(inventory)
        errors += [f"CVE nueva no inventariada: {x}" for x in sorted(unlisted)]
    elif require_release:
        errors.append("Faltan informes Trivy de API y Web de las imagenes candidatas")
    elif bool(scan_api) != bool(scan_web):
        errors.append("Los informes Trivy API/Web deben proporcionarse juntos")
    if require_release and (not origin or not validate_origin(origin)):
        errors.append("Se requiere un origen HTTPS real, sin example.invalid ni localhost")
    needed = scanned if (scan_api and scan_web) else set(inventory)
    pending = []
    for ident in sorted(needed & set(reviews)):
        pending.extend(approval_problems(reviews[ident], today))
    return errors, pending


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", default="security/pending-high-cves.json")
    parser.add_argument("--reviews", default="security/release-risk-reviews.json")
    parser.add_argument("--mode", choices=("report", "check"), default="report")
    parser.add_argument("--origin", help="Origen real HTTPS del frontend; obligatorio en check")
    parser.add_argument("--api", help="Informe Trivy JSON de la imagen API")
    parser.add_argument("--web", help="Informe Trivy JSON de la imagen Web")
    args = parser.parse_args()
    try:
        inventory = load_inventory(args.inventory)
        reviews = load_reviews(args.reviews, set(inventory))
        errors, pending = assess(inventory, reviews, date.today(), args.origin, args.api, args.web, args.mode == "check")
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: revision de release invalida: {exc}", file=sys.stderr)
        return 1
    lines = [
        "### Tunupa — preparacion de GHCR (SIN publicacion)",
        f"- CVE inventariadas: **{len(inventory)}**",
        f"- Problemas tecnicos adicionales: **{len(errors)}**",
        f"- Revisiones pendientes o invalidas: **{len(pending)}**",
    ]
    lines.extend(f"- ERROR: {x}" for x in errors)
    lines.extend(f"- PENDIENTE: {x}" for x in pending)
    lines.append("- No publica imagenes ni valida la identidad del aprobador. GitHub Environment con revisores obligatorios es un control adicional indispensable.")
    if errors or pending:
        lines.append("- **ESTADO: NO AUTORIZADO PARA GHCR**")
    else:
        lines.append("- **Prerequisitos tecnicos presentes, sujeto a verificacion humana y proteccion de entorno**")
    summary = "\n".join(lines) + "\n"
    print(summary)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fp:
            fp.write(summary)
    return 1 if errors or (args.mode == "check" and pending) else 0


if __name__ == "__main__":
    sys.exit(main())
