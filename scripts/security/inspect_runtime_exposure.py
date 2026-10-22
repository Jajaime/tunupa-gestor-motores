#!/usr/bin/env python3
"""Collect limited, non-sensitive evidence from Tunupa runtime images.

This tool does NOT determine exploitability or accept CVE risk. It inspects an
isolated one-off container, not the currently running API/Web processes.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys

BINARIES = (
    "node", "npm", "infocmp", "nsenter", "mount", "umount", "perl",
    "homectl", "systemd-homed", "setfacl", "getfacl",
)
PACKAGES = (
    "libtinfo6", "ncurses-base", "ncurses-bin", "libsystemd0", "libudev1",
    "libacl1", "bsdutils", "libblkid1", "liblastlog2-2", "libmount1",
    "libsmartcols1", "libuuid1", "login", "mount", "util-linux", "perl-base",
)

# Only fixed names defined above are interpreted by the shell. No user input
# is interpolated into this string, and Docker runs without network or mounts.
PROBE = r'''
set -eu
printf 'uid\t%s\n' "$(id -u)"
for name in node npm infocmp nsenter mount umount perl homectl systemd-homed setfacl getfacl; do
  if command -v "$name" >/dev/null 2>&1; then
    printf 'binary\t%s\tpresent\n' "$name"
  else
    printf 'binary\t%s\tabsent\n' "$name"
  fi
done
for name in libtinfo6 ncurses-base ncurses-bin libsystemd0 libudev1 libacl1 bsdutils libblkid1 liblastlog2-2 libmount1 libsmartcols1 libuuid1 login mount util-linux perl-base; do
  if version=$(dpkg-query -W -f='${Version}' "$name" 2>/dev/null); then
    printf 'package\t%s\t%s\n' "$name" "$version"
  else
    printf 'package\t%s\tnot-installed\n' "$name"
  fi
done
'''


def run_command(arguments: list[str]) -> str:
    result = subprocess.run(arguments, capture_output=True, text=True, check=False, timeout=60)
    if result.returncode:
        raise RuntimeError(f"El comando Docker falló (código {result.returncode}); "
                           "comprueba que Docker está ejecutándose y que la imagen existe. "
                           + result.stderr.strip()[:500])
    return result.stdout


def parse_probe(output: str) -> dict:
    parsed: dict = {"binaries": {}, "packages": {}}
    for line in output.splitlines():
        fields = line.split("\t")
        if len(fields) == 2 and fields[0] == "uid":
            parsed["uid"] = fields[1]
        elif len(fields) == 3 and fields[0] == "binary" and fields[1] in BINARIES and fields[2] in ("present", "absent"):
            parsed["binaries"][fields[1]] = fields[2]
        elif len(fields) == 3 and fields[0] == "package" and fields[1] in PACKAGES:
            parsed["packages"][fields[1]] = fields[2]
        else:
            raise ValueError("Salida de inspección inesperada; no se puede generar evidencia fiable")
    if (not parsed.get("uid") or set(parsed["binaries"]) != set(BINARIES)
            or set(parsed["packages"]) != set(PACKAGES)):
        raise ValueError("Inspección incompleta; no aceptar resultados parciales")
    return parsed


def inspect(image: str) -> dict:
    raw = run_command(["docker", "image", "inspect", image])
    data = json.loads(raw)
    if not isinstance(data, list) or len(data) != 1:
        raise ValueError("La inspección de imagen no devolvió un registro único")
    image_data = data[0]
    config = image_data.get("Config") or {}
    declared_user = config.get("User") or "root (implícito)"
    identity = image_data.get("Id") or "(sin ID)"
    probe_out = run_command([
        "docker", "run", "--rm", "--pull=never", "--network", "none",
        "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
        "--pids-limit", "64", "--entrypoint", "/bin/sh", image, "-c", PROBE,
    ])
    return {"image": image, "image_id": identity, "declared_user": declared_user,
            **parse_probe(probe_out)}


def render(reports: list[dict]) -> str:
    lines = [
        "# Tunupa — evidencia de superficie de ejecución",
        "",
        f"Generado (UTC): {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "**EVIDENCIA TÉCNICA, NO APROBACIÓN DE RIESGO NI AUTORIZACIÓN DE GHCR.**",
        "",
        "La inspección ejecuta contenedores desechables, sin red, en modo solo lectura. "
        "No observa las llamadas reales de la aplicación ni prueba la imposibilidad de explotación.",
        "",
    ]
    for r in reports:
        lines += [f"## `{r['image']}`", "", f"- ID de imagen: `{r['image_id']}`",
                  f"- Usuario declarado por Dockerfile: `{r['declared_user']}`",
                  f"- UID observado en prueba aislada: `{r['uid']}`", "",
                  "| Comando | Disponible en PATH |", "|---|---|"]
        lines += [f"| `{k}` | {v} |" for k, v in r["binaries"].items()]
        lines += ["", "| Paquete Debian | Versión o estado |", "|---|---|"]
        lines += [f"| `{k}` | `{v}` |" for k, v in r["packages"].items()]
        lines += [""]
    lines += [
        "## Revisiones humanas obligatorias", "",
        "- Correlacionar paquete/binario con función vulnerable, rutas de invocación y entradas no confiables.",
        "- Verificar `cap_drop`, `no-new-privileges` y usuario **en los contenedores en ejecución** de Compose; esta prueba NO los valida.",
        "- Comparar el ID con la imagen exacta que se evalúa para GHCR; una reconstrucción invalida la evidencia anterior.",
        "- Registrar responsable, decisión explícita y fecha de revisión de cada CVE antes de habilitar una publicación.",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-image", default="tunupa-api:local")
    parser.add_argument("--web-image", default="tunupa-web:local")
    parser.add_argument("--output", help="Ruta de reporte Markdown opcional (no debe incluir secretos)")
    args = parser.parse_args()
    try:
        report = render([inspect(args.api_image), inspect(args.web_image)])
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        print(f"ERROR: no se generó evidencia completa: {exc}", file=sys.stderr)
        return 1
    if args.output:
        path = Path(args.output)
        path.write_text(report, encoding="utf-8")
        print(f"Informe generado: {path}")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
