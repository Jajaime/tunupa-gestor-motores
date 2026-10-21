#!/usr/bin/env python3
"""Publica resúmenes seguros de npm audit / Trivy SARIF en GitHub Actions.

No modifica el resultado de seguridad por vulnerabilidades conocidas (baseline).
Un informe ausente, inválido o un error de auditoría sí hace fallar el job.
"""

import json
import os
import pathlib
import sys


def main() -> int:
    if len(sys.argv) != 4 or sys.argv[1] not in {"npm", "sarif"}:
        print("Uso: security_report.py npm|sarif ARCHIVO TITULO", file=sys.stderr)
        return 2
    kind, filename, title = sys.argv[1:4]
    try:
        report = json.loads(pathlib.Path(filename).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"Informe ausente o inválido: {exc}", file=sys.stderr)
        return 1
    if not isinstance(report, dict):
        print("El informe no es un objeto JSON", file=sys.stderr)
        return 1

    if kind == "npm":
        if report.get("error"):
            print("npm audit devolvió error de consulta (no es un resultado limpio)", file=sys.stderr)
            return 1
        counts = report.get("metadata", {}).get("vulnerabilities")
        if not isinstance(counts, dict):
            print("npm audit no devolvió el resumen de vulnerabilidades", file=sys.stderr)
            return 1
        keys = ("critical", "high", "moderate", "low")
        if any(not isinstance(counts.get(key), int) for key in keys):
            print("Resumen npm audit incompleto", file=sys.stderr)
            return 1
        total = counts.get("total", sum(counts[key] for key in keys))
        lines = [
            f"### {title}",
            f"- Vulnerabilidades registradas: **{total}**",
            f"- Críticas: **{counts['critical']}**, altas: **{counts['high']}**, "
            f"moderadas: **{counts['moderate']}**, bajas: **{counts['low']}**",
            "- **Línea base informativa**: un hallazgo existente todavía no bloquea este job.",
            "- Consultar el artefacto JSON para los paquetes y avisos concretos.",
        ]
    else:
        runs = report.get("runs")
        if not isinstance(runs, list):
            print("SARIF sin runs; el escaneo no se pudo verificar", file=sys.stderr)
            return 1
        try:
            count = sum(len(run.get("results", [])) for run in runs)
        except (TypeError, KeyError):
            print("SARIF con resultados inválidos", file=sys.stderr)
            return 1
        lines = [
            f"### {title}",
            f"- Hallazgos incluidos en SARIF: **{count}** (filtrados a HIGH/CRITICAL).",
            "- **Línea base informativa**: hallazgos existentes no bloquean este job.",
            "- Consultar el artefacto SARIF y GitHub Security > Code scanning.",
        ]
    message = "\n".join(lines) + "\n"
    print(message)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write(message + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
