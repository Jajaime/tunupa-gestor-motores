#!/usr/bin/env python3
"""Verifica el endurecimiento efectivo de API/Web sin imprimir secretos.

Uso desde la raiz del repositorio:
    python3 scripts/security/verify_readonly_runtime.py

Comprueba contenedores efectivamente creados; no solo la config combinada.
No modifica servicios ni inspecciona variables de entorno o credenciales.
"""
from __future__ import annotations

import json
import subprocess
import sys
from typing import Any

COMPOSE = [
    "docker", "compose",
    "-f", "compose.yaml",
    "-f", "compose.docker.yaml",
    "-f", "compose.hardening.yaml",
    "-f", "compose.readonly.yaml",
]
REQUIRED_TMPFS = {
    "api": {"/tmp"},
    "web": {"/tmp", "/app/.next/cache"},
}


def validate_runtime(host: dict[str, Any], user: str, service: str) -> list[str]:
    """Retorna incumplimientos sin exponer el contenido de HostConfig."""
    errors = []
    if service not in REQUIRED_TMPFS:
        return [f"Servicio no admitido: {service}"]
    if user != "node":
        errors.append(f"{service}: USER debe ser node")
    if host.get("ReadonlyRootfs") is not True:
        errors.append(f"{service}: ReadonlyRootfs debe ser true")
    caps = host.get("CapDrop")
    if not isinstance(caps, list) or "ALL" not in caps:
        errors.append(f"{service}: falta CapDrop ALL")
    opts = host.get("SecurityOpt")
    if not isinstance(opts, list) or not any("no-new-privileges" in str(o) for o in opts):
        errors.append(f"{service}: falta no-new-privileges")
    if host.get("PidsLimit") != 256:
        errors.append(f"{service}: PidsLimit esperado 256")
    tmpfs = host.get("Tmpfs")
    if not isinstance(tmpfs, dict):
        errors.append(f"{service}: no existe configuracion tmpfs")
        return errors
    for path in REQUIRED_TMPFS[service]:
        options = tmpfs.get(path)
        if not isinstance(options, str):
            errors.append(f"{service}: falta tmpfs en {path}")
            continue
        parts = set(options.split(","))
        for required in ("nosuid", "nodev", "noexec", "uid=1000", "gid=1000"):
            if required not in parts:
                errors.append(f"{service}: tmpfs {path} sin opcion {required}")
    return errors


def run(args: list[str]) -> str:
    proc = subprocess.run(args, capture_output=True, text=True, check=True)
    return proc.stdout.strip()


def main() -> int:
    failures = []
    for service in ("api", "web"):
        try:
            cid = run(COMPOSE + ["ps", "-q", service])
            if not cid:
                failures.append(f"{service}: contenedor no encontrado")
                continue
            state = json.loads(run(["docker", "inspect", "--format", "{{json .}}", cid]))
            host = state.get("HostConfig")
            user = state.get("Config", {}).get("User")
            if not isinstance(host, dict) or not isinstance(user, str):
                failures.append(f"{service}: docker inspect devolvio datos invalidos")
                continue
            failures.extend(validate_runtime(host, user, service))
            if state.get("State", {}).get("Running") is not True:
                failures.append(f"{service}: contenedor no esta en ejecucion")
            if not any(f.startswith(service + ":") for f in failures):
                print(f"OK {service}: usuario node, solo lectura, tmpfs y endurecimiento comprobados")
        except (subprocess.CalledProcessError, OSError, ValueError, KeyError, TypeError) as exc:
            # No incluir el stderr de Docker porque puede contener detalles privados.
            failures.append(f"{service}: error al consultar Docker ({type(exc).__name__})")
    for failure in failures:
        print("ERROR " + failure, file=sys.stderr)
    if failures:
        print("No modificar ni publicar contenedores hasta corregir los incumplimientos.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
