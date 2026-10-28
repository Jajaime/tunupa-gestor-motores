#!/usr/bin/env python3
"""Read-only check of Tunupa's *local* Distroless evaluation containers.

Does not approve CVEs, publish images, read secrets, or change containers.
Run only from the repository root after starting the 18c3 compose overlay.
"""
from __future__ import annotations

import json
import subprocess
import sys

MIB = 1024 * 1024
COMPOSE = [
    "docker", "compose", "-f", "compose.yaml", "-f", "compose.docker.yaml",
    "-f", "compose.hardening.yaml", "-f", "compose.readonly.yaml",
    "-f", "compose.resources.yaml", "-f", "compose.distroless-eval.yaml",
]
IMAGES = {"api": "tunupa-api:distroless-local-eval", "web": "tunupa-web:distroless-local-eval"}
TMPFS = {"api": {"/tmp"}, "web": {"/tmp", "/app/.next/cache"}}


def run(args: list[str]) -> str:
    result = subprocess.run(args, capture_output=True, text=True, timeout=40, check=False)
    if result.returncode:
        # Avoid emitting docker stderr (could contain local configuration).
        raise RuntimeError(f"Comando Docker falló ({result.returncode})")
    return result.stdout.strip()


def one_inspect(text: str) -> dict:
    records = json.loads(text)
    if not isinstance(records, list) or len(records) != 1 or not isinstance(records[0], dict):
        raise ValueError("Docker inspect debe devolver exactamente un objeto")
    return records[0]


def validate(service: str, data: dict, expected_image_id: str) -> list[str]:
    """Fail closed on absent or unsafe fields; never claim CVE acceptance."""
    if service not in IMAGES:
        raise ValueError("Servicio desconocido")
    if not isinstance(data, dict):
        raise ValueError("Docker inspect inválido")
    config, host, state = data.get("Config"), data.get("HostConfig"), data.get("State")
    if not all(isinstance(x, dict) for x in (config, host, state)):
        raise ValueError("Docker inspect sin Config, HostConfig o State")
    problems = []
    if data.get("Image") != expected_image_id or not str(expected_image_id).startswith("sha256:"):
        problems.append("El ID de imagen del contenedor no coincide con la imagen de evaluación")
    if config.get("Image") != IMAGES[service]:
        problems.append("Contenedor no corresponde al tag Distroless experimental")
    if config.get("User") != "1000:1000":
        problems.append("Usuario de runtime distinto de 1000:1000")
    if host.get("ReadonlyRootfs") is not True:
        problems.append("Rootfs no es de solo lectura")
    if host.get("Privileged") is not False:
        problems.append("Contenedor privilegiado o dato faltante")
    if host.get("CapAdd"):
        problems.append("Se agregaron capacidades")
    if "ALL" not in (host.get("CapDrop") or []):
        problems.append("Falta cap_drop ALL")
    if "no-new-privileges:true" not in (host.get("SecurityOpt") or []):
        problems.append("Falta no-new-privileges")
    if host.get("PidsLimit") != 256:
        problems.append("pids_limit distinto de 256")
    if host.get("PidMode") == "host" or host.get("NetworkMode") == "host":
        problems.append("Compartiendo el espacio de PID/red del host")
    if type(host.get("Memory")) is not int or host["Memory"] != 768 * MIB:
        problems.append("Límite de RAM distinto de 768 MiB")
    if state.get("Running") is not True or state.get("OOMKilled") is not False:
        problems.append("Contenedor detenido, OOMKilled o estado incompleto")
    if not isinstance(state.get("Health"), dict) or state["Health"].get("Status") != "healthy":
        problems.append("Healthcheck no saludable")
    mounts = data.get("Mounts")
    if not isinstance(mounts, list) or any(not isinstance(m, dict) for m in mounts):
        problems.append("Montajes incompletos")
    elif any(m.get("Type") == "bind" for m in mounts):
        problems.append("Existen bind mounts: revisar antes de continuar")
    tmpfs = host.get("Tmpfs")
    if not isinstance(tmpfs, dict):
        problems.append("Tmpfs faltante")
    else:
        for mount in TMPFS[service]:
            opts = tmpfs.get(mount)
            if not isinstance(opts, str):
                problems.append(f"Tmpfs obligatorio ausente: {mount}")
                continue
            parts = set(opts.split(","))
            for opt in ("nosuid", "nodev", "noexec", "uid=1000", "gid=1000"):
                if opt not in parts:
                    problems.append(f"Tmpfs {mount} sin {opt}")
    health = config.get("Healthcheck")
    health_cmd = (health or {}).get("Test") if isinstance(health, dict) else None
    if not isinstance(health_cmd, list) or health_cmd[:2] != ["CMD", "/nodejs/bin/node"]:
        problems.append("Healthcheck no utiliza /nodejs/bin/node")
    return problems


def check_service(service: str) -> list[str]:
    tag = IMAGES[service]
    cid = run(COMPOSE + ["ps", "-q", service])
    if not cid or "\n" in cid:
        raise ValueError("Contenedor único no encontrado")
    data = one_inspect(run(["docker", "inspect", cid]))
    image_id = one_inspect(run(["docker", "image", "inspect", tag])).get("Id")
    return validate(service, data, image_id)


def main() -> int:
    failed = False
    for service in IMAGES:
        try:
            problems = check_service(service)
        except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired,
                json.JSONDecodeError, KeyError, TypeError) as err:
            # Exception messages here never include Docker env/secrets.
            problems = [f"evidencia incompleta ({type(err).__name__})"]
        if problems:
            failed = True
            print(f"REVISAR {service}: " + "; ".join(problems))
        else:
            print(f"OK {service}: imagen Distroless esperada, healthy, UID 1000, "
                  "solo lectura, 768 MiB y endurecimiento")
    print("EVIDENCIA LOCAL; no se publica imagen ni se acepta ninguna CVE.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
