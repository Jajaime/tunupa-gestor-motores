#!/usr/bin/env python3
"""Verify optional 18b5 memory bounds on actual running API/Web containers.

Only the selected Docker fields are interpreted or printed. This is runtime
operational evidence, not proof of CVE non-exploitability or GHCR approval.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

MIB = 1024 * 1024
COMPOSE = [
    "docker", "compose", "-f", "compose.yaml", "-f", "compose.docker.yaml",
    "-f", "compose.hardening.yaml", "-f", "compose.readonly.yaml",
    "-f", "compose.resources.yaml",
]


def validate(info: object, expected_mib: int) -> list[str]:
    """Return reasons for failed checks; never trust missing Docker fields."""
    if not isinstance(info, dict):
        raise ValueError("docker inspect no entrego un objeto")
    host = info.get("HostConfig")
    state = info.get("State")
    if not isinstance(host, dict) or not isinstance(state, dict):
        raise ValueError("Faltan HostConfig/State en docker inspect")
    if not isinstance(expected_mib, int) or expected_mib < 128:
        raise ValueError("El limite esperado debe ser al menos 128 MiB")
    problems: list[str] = []
    memory = host.get("Memory")
    if type(memory) is not int or memory != expected_mib * MIB:
        problems.append(f"Memory no coincide con {expected_mib} MiB")
    if state.get("Running") is not True:
        problems.append("Contenedor no esta en ejecucion")
    if state.get("OOMKilled") is not False:
        problems.append("OOMKilled true o sin dato fiable")
    health = state.get("Health")
    if not isinstance(health, dict) or health.get("Status") != "healthy":
        problems.append("Health.Status no es healthy")
    return problems


def run(argv: list[str]) -> str:
    res = subprocess.run(argv, check=False, capture_output=True, text=True, timeout=35)
    if res.returncode:
        # Do not echo arbitrary stderr from Docker; it might contain environment context.
        raise RuntimeError(f"Comando Docker falló (codigo {res.returncode})")
    return res.stdout.strip()


def check_service(name: str, expected_mib: int) -> list[str]:
    cid = run(COMPOSE + ["ps", "-q", name])
    if not cid or "\n" in cid:
        raise ValueError(f"Contenedor unico no encontrado para {name}")
    data = json.loads(run(["docker", "inspect", cid]))
    if not isinstance(data, list) or len(data) != 1:
        raise ValueError(f"docker inspect incompleto para {name}")
    return validate(data[0], expected_mib)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-mib", type=int, default=768)
    parser.add_argument("--web-mib", type=int, default=768)
    args = parser.parse_args()
    failed = False
    for name, expected in (("api", args.api_mib), ("web", args.web_mib)):
        try:
            problems = check_service(name, expected)
        except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            problems = [str(exc)]
        if problems:
            failed = True
            print(f"REVISAR {name}: " + "; ".join(problems))
        else:
            print(f"OK {name}: {expected} MiB RAM, contenedor healthy, OOMKilled=false")
    print("Esta prueba NO aprueba excepciones CVE ni autoriza GHCR.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
