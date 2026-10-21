#!/usr/bin/env python3
"""Validacion ESTATICA de Compose HTTPS: no inicia servicios ni imprime secretos.

Uso en modo plantilla (todavia sin dominio real):
  CADDY_DOMAIN=motores.example.com python3 scripts/deployment/preflight_vps.py --template

Uso final, con dominio real y .env de produccion:
  python3 scripts/deployment/preflight_vps.py
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

FILES = ('compose.yaml', 'compose.docker.yaml', 'compose.https.yaml')


def check_config(config: dict, template: bool) -> list[str]:
    errors: list[str] = []
    services = config.get('services', {})

    def environment(name: str) -> dict:
        value = services.get(name, {}).get('environment', {})
        return value if isinstance(value, dict) else {}

    def require(ok: bool, description: str) -> None:
        if not ok:
            errors.append(description)

    caddy_env = environment('caddy')
    api_env = environment('api')
    grafana_env = environment('grafana')
    domain = str(caddy_env.get('CADDY_DOMAIN', ''))
    is_dns = re.fullmatch(r'(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}', domain) is not None
    invalid = domain.lower().endswith(('.local', '.localhost', '.internal', '.invalid', '.test'))
    placeholder = domain.lower() in {'example.com', 'motores.example.com', 'example.org', 'example.net'}
    require(is_dns and not invalid, 'CADDY_DOMAIN debe ser un nombre DNS completo, sin esquema ni puerto')
    require(template or not placeholder, 'No desplegar con dominios de ejemplo')

    expected = 'https://' + domain
    require(api_env.get('WEB_ORIGIN') == expected, 'WEB_ORIGIN no coincide con el dominio HTTPS')
    require(str(api_env.get('AUTH_COOKIE_SECURE', '')).lower() == 'true', 'AUTH_COOKIE_SECURE no es true')
    require(str(api_env.get('NODE_ENV', '')).lower() == 'production', 'API no esta en NODE_ENV=production')
    token = str(api_env.get('AUTH_ACCESS_SECRET', ''))
    require(len(token) >= 32 and 'CAMBIAR' not in token.upper(), 'AUTH_ACCESS_SECRET no cumple minima longitud o es placeholder')
    web_args = services.get('web', {}).get('build', {}).get('args', {})
    require(web_args.get('NEXT_PUBLIC_API_URL') == expected + '/api/v1', 'El build de Next.js no apunta a la API HTTPS')

    require(grafana_env.get('GF_SERVER_ROOT_URL') == expected + '/grafana/', 'Grafana: root URL HTTPS incorrecta')
    require(str(grafana_env.get('GF_SERVER_SERVE_FROM_SUB_PATH', '')).lower() == 'true', 'Grafana: serve_from_sub_path no esta activo')
    require(str(grafana_env.get('GF_AUTH_ANONYMOUS_ENABLED', '')).lower() == 'false', 'Grafana: acceso anonimo no esta deshabilitado')

    def port_list(name: str) -> list[dict]:
        return services.get(name, {}).get('ports', []) or []

    def port_number(port: dict, name: str) -> int:
        try:
            return int(port.get(name, 0))
        except (ValueError, TypeError):
            return -1

    for name in ('api', 'web', 'grafana'):
        require(not port_list(name), f'{name}: no debe publicar puertos del host')

    for name, expected_port in (('timescaledb', 5432), ('mosquitto', 1883)):
        ports = port_list(name)
        require(bool(ports), f'{name}: revisar binding esperado en localhost')
        for port in ports:
            require(port.get('host_ip') == '127.0.0.1', f'{name}: puerto publicado fuera de 127.0.0.1')
            require(port_number(port, 'target') == expected_port, f'{name}: destino de puerto inesperado')

    caddy = port_list('caddy')
    tcp = {(port_number(p, 'published'), (p.get('protocol') or 'tcp').lower()) for p in caddy}
    require((80, 'tcp') in tcp and (443, 'tcp') in tcp, 'Caddy debe publicar 80/tcp y 443/tcp')
    for p in caddy:
        require(port_number(p, 'published') in (80, 443), 'Caddy: puerto publico no esperado')
    volumes = services.get('caddy', {}).get('volumes', []) or []
    require(any(v.get('target') == '/data' for v in volumes if isinstance(v, dict)), 'Caddy: falta almacenamiento persistente en /data para TLS')

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description='Auditoria estatica de Compose para VPS; no levanta servicios')
    parser.add_argument('--template', action='store_true', help='Permite dominio motores.example.com solo para verificar estructura local')
    args = parser.parse_args()
    missing = [f for f in FILES if not Path(f).is_file()]
    if missing:
        print('ERROR: ejecutar desde la raiz del repositorio; faltan archivos Compose.', file=sys.stderr)
        return 2
    command = ['docker', 'compose']
    for file in FILES:
        command.extend(('-f', file))
    command.extend(('config', '--format', 'json'))
    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=45)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print('ERROR: Docker Compose no disponible o agoto el tiempo.', file=sys.stderr)
        return 2
    if result.returncode != 0:
        print('ERROR: docker compose config no fue valido. Usa config --quiet para diagnosticar.', file=sys.stderr)
        return 2
    try:
        configuration = json.loads(result.stdout)
    except json.JSONDecodeError:
        print('ERROR: no se pudo leer JSON de Docker Compose.', file=sys.stderr)
        return 2
    errors = check_config(configuration, args.template)
    if errors:
        for error in errors:
            print('ERROR: ' + error)
        print('Resultado: NO APTO para despliegue.')
        return 1
    print('OK: rutas, puertos, cookie Secure, origen HTTPS y persistencia TLS consistentes.')
    print('No se mostraron secretos.')
    if args.template:
        print('MODO PLANTILLA: esta validacion NO autoriza publicar en Internet.')
    else:
        print('PRECHECK TECNICO OK: faltan validar DNS, firewall, backup, accesos y TLS real.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
