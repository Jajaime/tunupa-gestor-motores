#!/usr/bin/env python3
"""Evidence-only inspection of exact Distroless candidate images (no shell/dpkg).

No publication, risk acceptance, exposed credentials, or dependency execution.
The probe runs as Node inside a disposable, restricted container without network.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys

IMAGES = ("tunupa-api:release-candidate", "tunupa-web:release-candidate")
IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}\Z")
NAMES = ("infocmp", "nsenter", "mount", "perl", "homectl", "systemd-homed")
PATHS = {
    "infocmp": ("/usr/bin/infocmp", "/bin/infocmp"),
    "nsenter": ("/usr/bin/nsenter", "/bin/nsenter"),
    "mount": ("/usr/bin/mount", "/bin/mount"),
    "perl": ("/usr/bin/perl", "/bin/perl"),
    "homectl": ("/usr/bin/homectl", "/bin/homectl"),
    "systemd-homed": ("/usr/lib/systemd/systemd-homed", "/lib/systemd/systemd-homed"),
}

# Probe is a constant, with no user or environment strings interpolated into it.
NODE_PROBE = r'''
const fs = require('node:fs');
const paths = {
  infocmp:['/usr/bin/infocmp','/bin/infocmp'],
  nsenter:['/usr/bin/nsenter','/bin/nsenter'],
  mount:['/usr/bin/mount','/bin/mount'],
  perl:['/usr/bin/perl','/bin/perl'],
  homectl:['/usr/bin/homectl','/bin/homectl'],
  'systemd-homed':['/usr/lib/systemd/systemd-homed','/lib/systemd/systemd-homed'],
};
const status=fs.readFileSync('/proc/self/status','utf8');
function value(k){const m=status.match(new RegExp('^'+k+':\\s*(.+)$','m'));if(!m)throw Error('missing '+k);return m[1].trim().split(/\s+/)[0];}
const found=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,p.some(path=>fs.existsSync(path))]));
console.log(JSON.stringify({uid:process.getuid(), cap_eff:value('CapEff'), no_new_privs:value('NoNewPrivs'), seccomp:value('Seccomp'), binaries:found}));
'''


def run(args: list[str]) -> str:
    completed = subprocess.run(args, capture_output=True, text=True, timeout=80, check=False)
    if completed.returncode:
        # Avoid dumping error output that could contain paths or environment context.
        raise RuntimeError(f"Comando Docker falló (codigo {completed.returncode})")
    return completed.stdout.strip()


def parse_inspect(output: str) -> dict:
    records = json.loads(output)
    if not isinstance(records, list) or len(records) != 1 or not isinstance(records[0], dict):
        raise ValueError("Docker image inspect debe devolver un objeto único")
    return records[0]


def validate(image: str, data: dict, probe: dict) -> dict:
    if image not in IMAGES:
        raise ValueError("Tag no permitido")
    ident = data.get("Id")
    if not isinstance(ident, str) or not IMAGE_ID.fullmatch(ident):
        raise ValueError("ID de imagen Docker inválido")
    config = data.get("Config")
    if not isinstance(config, dict) or config.get("User") != "1000:1000":
        raise ValueError("Imagen candidata no declara UID 1000:1000")
    entry = config.get("Entrypoint")
    if not isinstance(entry, list) or not entry or entry[0] != "/nodejs/bin/node":
        raise ValueError("Imagen candidata no usa el entrypoint Node de Distroless")
    if not isinstance(probe, dict) or type(probe.get("uid")) is not int or probe["uid"] != 1000:
        raise ValueError("El proceso de prueba no es UID 1000")
    caps = probe.get("cap_eff")
    if not isinstance(caps, str) or not re.fullmatch(r"[0-9a-fA-F]{1,16}", caps) or int(caps, 16) != 0:
        raise ValueError("CapEff inválido o distinto de cero")
    if probe.get("no_new_privs") != "1" or probe.get("seccomp") != "2":
        raise ValueError("Falta no-new-privileges o seccomp")
    binaries = probe.get("binaries")
    if not isinstance(binaries, dict) or set(binaries) != set(NAMES) or any(type(v) is not bool for v in binaries.values()):
        raise ValueError("Inspección de rutas incompleta")
    return {"image": image, "id": ident, "user": config["User"], "probe": probe}


def inspect(image: str) -> dict:
    data = parse_inspect(run(["docker", "image", "inspect", image]))
    result = run([
        "docker", "run", "--rm", "--pull=never", "--network", "none", "--read-only",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
        "--pids-limit", "64", "--memory", "768m",
        "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=64m,uid=1000,gid=1000,mode=1777",
        "--entrypoint", "/nodejs/bin/node", image, "-e", NODE_PROBE,
    ])
    return validate(image, data, json.loads(result))


def render(evidence: list[dict]) -> str:
    lines = [
        "# Tunupa — inspección aislada de candidatos Distroless", "",
        f"Fecha UTC: {datetime.now(timezone.utc).isoformat()}", "",
        "**SOLO EVIDENCIA; NO AUTORIZA GHCR NI APRUEBA CVE.**", "",
        "La prueba consulta el proceso Node en un contenedor temporal sin red. No ejecuta shell ni dpkg.",
        "La ausencia de ejecutables en rutas conocidas NO demuestra que un componente vulnerable no exista.", "",
    ]
    for item in evidence:
        probe = item["probe"]
        lines.extend([
            f"## `{item['image']}`", "",
            f"- ID de imagen: `{item['id']}`",  # Exact format used by candidate_evidence.py
            f"- Usuario declarado: `{item['user']}`", f"- UID observado: `{probe['uid']}`",
            f"- CapEff: `{probe['cap_eff']}`", f"- NoNewPrivs: `{probe['no_new_privs']}`",
            f"- Seccomp: `{probe['seccomp']}`", "",
            "| Ejecutable (rutas conocidas) | Presente |", "|---|---|",
        ])
        lines.extend(f"| `{name}` | {'sí' if probe['binaries'][name] else 'no observado'} |" for name in NAMES)
        lines.append("")
    lines.extend([
        "## Limitaciones", "",
        "- Esta inspección NO prueba login, MQTT, WebSocket ni llamadas indirectas de dependencias.",
        "- Los IDs mostrados son IDs de configuración Docker locales al runner, NO digests de GHCR.",
        "- La imagen Web compilada con example.invalid NO es desplegable.",
        "- Verificar SBOM y Trivy del mismo ID, mantener análisis de riesgos y revisión independiente.",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    opts = parser.parse_args()
    try:
        result = render([inspect(image) for image in IMAGES])
        Path(opts.output).write_text(result, encoding="utf-8")
        print("OK: inspección Distroless completa (sin publicación ni aprobación)")
    except (ValueError, OSError, RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"ERROR: evidencia Distroless incompleta ({type(exc).__name__}): {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
