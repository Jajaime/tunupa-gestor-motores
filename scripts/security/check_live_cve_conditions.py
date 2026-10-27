#!/usr/bin/env python3
"""Gather narrowly scoped evidence about Tunupa's currently running Node processes.

Does not access container environment variables, modify containers, or approve CVEs.
All Docker subprocess commands use fixed argument lists (no host shell).
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys

COMPOSE = [
    "docker", "compose", "-f", "compose.yaml", "-f", "compose.docker.yaml",
    "-f", "compose.hardening.yaml", "-f", "compose.readonly.yaml",
]
SERVICES = ("api", "web")
LIBRARY_MARKERS = ("libacl", "libsystemd", "libudev", "libtinfo")

# Inspect Node executables rather than PID 1: compose.docker.yaml uses init:true,
# so PID 1 can be tini, not the NestJS / Next.js process.
# No process command lines, environment, or /proc/mountinfo are printed.
NODE_PROBE = r'''
const fs = require('node:fs');
const libraries = ['libacl', 'libsystemd', 'libudev', 'libtinfo'];
const records = [];
for (const item of fs.readdirSync('/proc')) {
  if (!/^\d+$/.test(item) || Number(item) === process.pid) continue;
  const prefix = '/proc/' + item;
  let exe;
  try { exe = fs.readlinkSync(prefix + '/exe'); } catch { continue; }
  if (!/\/node(?: \(deleted\))?$/.test(exe)) continue;
  let status, maps;
  try {
    status = fs.readFileSync(prefix + '/status', 'utf8');
    maps = fs.readFileSync(prefix + '/maps', 'utf8');
  } catch (error) {
    console.error('No se pudo leer el proceso Node ' + item + ': ' + error.code);
    process.exit(2);
  }
  function field(name) {
    const found = status.match(new RegExp('^' + name + ':\\s*(.+)$', 'm'));
    if (!found) throw Error('Falta /proc status ' + name);
    return found[1].trim().split(/\s+/)[0];
  }
  records.push({
    uid: field('Uid'), cap_eff: field('CapEff'),
    no_new_privs: field('NoNewPrivs'), seccomp: field('Seccomp'),
    loaded_libraries: Object.fromEntries(libraries.map(name => [name, maps.includes(name)]))
  });
}
if (records.length < 1) {
  console.error('No se encontraron procesos de aplicacion Node; la evidencia es incompleta');
  process.exit(3);
}
console.log(JSON.stringify({processes: records}));
'''


def run(arguments: list[str]) -> str:
    completed = subprocess.run(arguments, capture_output=True, text=True, timeout=35, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"Falló el comando de inspección ({completed.returncode}): "
                           + completed.stderr.strip()[:250])
    return completed.stdout.strip()


def validate_processes(value: object) -> tuple[list[dict], list[str]]:
    if not isinstance(value, dict) or not isinstance(value.get("processes"), list) or not value["processes"]:
        raise ValueError("Inspección de procesos Node ausente o incompleta")
    problems = []
    processes = value["processes"]
    for number, p in enumerate(processes, 1):
        if not isinstance(p, dict) or set(p.get("loaded_libraries", {})) != set(LIBRARY_MARKERS) or any(
                type(v) is not bool for v in p["loaded_libraries"].values()):
            raise ValueError("Información de bibliotecas incompleta")
        for field in ("uid", "cap_eff", "no_new_privs", "seccomp"):
            if not isinstance(p.get(field), str):
                raise ValueError(f"Campo de proceso ausente: {field}")
        if p["uid"] != "1000":
            problems.append(f"Proceso Node {number}: UID no esperado: {p['uid']}")
        try:
            has_caps = int(p["cap_eff"], 16) != 0
        except ValueError as exc:
            raise ValueError("CapEff inválido") from exc
        if has_caps:
            problems.append(f"Proceso Node {number}: CapEff distinto de cero")
        if p["no_new_privs"] != "1":
            problems.append(f"Proceso Node {number}: NoNewPrivs distinto de 1")
        if p["seccomp"] != "2":
            problems.append(f"Proceso Node {number}: Seccomp no indica filtrado")
    return processes, problems


def validate_container(info: object) -> tuple[str, list[str], list[str]]:
    if not isinstance(info, dict) or not isinstance(info.get("HostConfig"), dict):
        raise ValueError("docker inspect no devolvió HostConfig")
    cfg, host = info.get("Config") or {}, info["HostConfig"]
    if not isinstance(cfg, dict):
        raise ValueError("Docker Config inválida")
    image = info.get("Image")
    if not isinstance(image, str) or not image.startswith("sha256:"):
        raise ValueError("Falta imagen Docker exacta")
    failures = []
    if cfg.get("User") != "node":
        failures.append("Config.User no es node")
    if host.get("Privileged") is not False:
        failures.append("Contenedor privilegiado o dato ausente")
    if host.get("ReadonlyRootfs") is not True:
        failures.append("Rootfs no es de solo lectura")
    if (host.get("PidMode") or "") == "host":
        failures.append("Espacio PID del host compartido")
    if host.get("NetworkMode") == "host":
        failures.append("Red del host compartida")
    if host.get("CapAdd"):
        failures.append("Capacidades adicionales configuradas")
    if "ALL" not in (host.get("CapDrop") or []):
        failures.append("No se retiraron todas las capacidades")
    if "no-new-privileges:true" not in (host.get("SecurityOpt") or []):
        failures.append("Falta no-new-privileges")
    if host.get("PidsLimit") != 256:
        failures.append("PidsLimit distinto de 256")
    mounts = info.get("Mounts") or []
    if not isinstance(mounts, list):
        raise ValueError("Mounts inválido")
    if any(not isinstance(m, dict) for m in mounts):
        raise ValueError("Mounts contiene una entrada inválida")
    bind_destinations = [str(m.get("Destination", "(sin destino)")) for m in mounts if m.get("Type") == "bind"]
    if bind_destinations:
        failures.append("Montajes bind detectados; revisar autorización")
    observations = []
    if not host.get("Memory"):
        observations.append("Sin límite de memoria Docker: revisar riesgo de agotamiento de memoria")
    return image, failures, observations


def examine(service: str) -> dict:
    cid = run(COMPOSE + ["ps", "-q", service])
    if not cid or "\n" in cid:
        raise ValueError(f"No existe un contenedor único en ejecución para {service}")
    details = json.loads(run(["docker", "inspect", cid]))
    if not isinstance(details, list) or len(details) != 1:
        raise ValueError("docker inspect no devolvió un contenedor único")
    image, failures, observations = validate_container(details[0])
    result = json.loads(run(["docker", "exec", cid, "node", "-e", NODE_PROBE]))
    processes, proc_failures = validate_processes(result)
    return {"service": service, "image_id": image, "processes": processes,
            "failures": failures + proc_failures, "observations": observations}


def render(results: list[dict]) -> str:
    lines = [
        "# Tunupa — condiciones observadas en procesos Node de Docker Compose", "",
        f"Fecha UTC: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}", "",
        "**EVIDENCIA INSTANTÁNEA; NO APRUEBA LAS CVE NI AUTORIZA GHCR.**", "",
        "Se consultaron únicamente configuraciones de Docker y `/proc` de procesos Node. "
        "No se examinaron secretos, argumentos de procesos ni variables de entorno. "
        "La ausencia de una biblioteca en mapas de memoria no prueba que jamás vaya a cargarse.", "",
    ]
    for item in results:
        lines.extend([f"## {item['service']}", "", f"- Imagen del contenedor ACTUAL: `{item['image_id']}`",
                      f"- Procesos Node observados: {len(item['processes'])}", "",
                      "| Proceso | UID | CapEff | NoNewPrivs | Seccomp |",
                      "|---|---|---|---|---|"])
        for index, proc in enumerate(item["processes"], 1):
            lines.append(f"| {index} | {proc['uid']} | `{proc['cap_eff']}` | {proc['no_new_privs']} | {proc['seccomp']} |")
        lines.extend(["", "| Biblioteca | ¿Cargada en algún proceso Node al inspeccionar? |", "|---|---|"])
        for lib in LIBRARY_MARKERS:
            state = any(proc["loaded_libraries"][lib] for proc in item["processes"])
            lines.append(f"| `{lib}` | {'sí' if state else 'no observada'} |")
        for problem in item["failures"]:
            lines.append(f"- **REVISAR**: {problem}")
        for observation in item["observations"]:
            lines.append(f"- **Observación**: {observation}")
        lines.append("")
    lines += [
        "## Límites y próximos controles", "",
        "- Este reporte describe los contenedores locales actuales; su imagen puede diferir del release candidate de GitHub.",
        "- Las bibliotecas pueden ejecutarse indirectamente o cargarse con posterioridad; esta captura no comprueba rutas de ataque.",
        "- Comprobar los riesgos en el host de despliegue y bajo carga antes de una aceptación humana de cada CVE.",
        "- No cambiar `security/release-risk-reviews.json` a `APPROVED_EXCEPTION` basándose únicamente en este reporte.",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", help="Ruta de salida Markdown opcional")
    args = parser.parse_args()
    try:
        results = [examine(s) for s in SERVICES]
        report = render(results)
        if args.output:
            Path(args.output).write_text(report, encoding="utf-8")
            print("Informe generado: " + args.output)
        else:
            print(report)
        if any(s["failures"] for s in results):
            print("ADVERTENCIA: una condición de seguridad esperada no se cumple", file=sys.stderr)
            return 1
        return 0
    except (OSError, subprocess.TimeoutExpired, RuntimeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: evidencia incompleta: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
