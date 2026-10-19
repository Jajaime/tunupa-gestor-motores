#!/usr/bin/env python3
"""Comprueba sesión, resumen e histórico contra la API local (patch 01 requerido)."""

import argparse
import getpass
import math
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlencode

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'auth'))
from smoke_test import AuthProbe, CheckFailed, require  # noqa: E402


def timestamp(value):
    require(isinstance(value, str), 'Falta una fecha de medición.')
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise CheckFailed('La API devolvió una fecha inválida.') from error


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def check_dashboard(probe, device_code, email, password):
    email = email.strip().lower()
    csrf = probe.request('GET', '/auth/csrf', 200)
    probe.csrf = csrf.get('csrfToken') if isinstance(csrf, dict) else None
    cookie = probe.cookie('tunupa_csrf')
    require(bool(probe.csrf) and cookie is not None and cookie.value == probe.csrf,
            'No se pudo preparar el token CSRF.')
    body = probe.request('POST', '/auth/login', 200,
                         payload={'email': email, 'password': password}, csrf=True)
    user_id = probe.check_user(body, expected_email=email)
    probe.check_user(probe.request('GET', '/auth/me', 200), user_id, email)
    print('OK 01: autenticación y consulta de sesión.')

    motors = probe.request('GET', '/dashboard/motors', 200)
    require(isinstance(motors, list), 'El resumen no es un listado.')
    matches = [motor for motor in motors
               if isinstance(motor, dict) and isinstance(motor.get('device'), dict)
               and motor['device'].get('code') == device_code]
    require(len(matches) == 1,
            'No aparece el dispositivo en el resumen. Publica con ese código y verifica su asociación al motor.')
    motor = matches[0]
    require(motor.get('operationalStatus') in ('RUNNING', 'WARNING', 'CRITICAL'),
            'El motor no figura transmitiendo. Ejecuta el simulador antes de esta prueba.')
    timestamp(motor.get('lastTelemetryAt'))
    print('OK 02: el resumen contiene el motor con telemetría.')

    latest = motor.get('latestMeasurements')
    require(isinstance(latest, dict), 'Faltan las últimas mediciones.')
    expected = ('TEMPERATURE', 'CURRENT', 'VIBRATION', 'ROTATION_SPEED', 'VOLTAGE', 'FREQUENCY')
    for measurement_type in expected:
        point = latest.get(measurement_type)
        require(isinstance(point, dict) and number(point.get('value')),
                f'Falta una medición numérica de {measurement_type}.')
        require(bool(point.get('unit')) and point.get('quality') in ('GOOD', 'UNCERTAIN', 'BAD'),
                f'Unidad o calidad inválida en {measurement_type}.')
        timestamp(point.get('measuredAt'))
    print('OK 03: seis variables con valores, unidades, calidad y fechas.')

    motor_path = quote(str(motor['id']), safe='')
    query = urlencode({'measurementType': 'TEMPERATURE', 'limit': 20})
    history_path = f'/dashboard/motors/{motor_path}/history'
    history = probe.request('GET', f'{history_path}?{query}', 200)
    require(isinstance(history, list) and 0 < len(history) <= 20,
            'El histórico está vacío o excede el límite solicitado.')
    dates = []
    for point in history:
        require(isinstance(point, dict) and point.get('measurementType') == 'TEMPERATURE'
                and number(point.get('value')), 'El histórico contiene una medición inválida.')
        dates.append(timestamp(point.get('measuredAt')))
    require(dates == sorted(dates), 'El histórico no está ordenado cronológicamente.')
    print('OK 04: histórico de temperatura no vacío, numérico y cronológico.')

    probe.request('GET', f'{history_path}?measurementType=INVALID', 400)
    print('OK 05: la API rechaza un tipo de medición inválido (400).')
    probe.request('POST', '/auth/logout', 204, csrf=True)
    probe.request('GET', '/dashboard/motors', 401)
    print('OK 06: logout de la sesión de prueba y resumen protegido (401).')
    print('RESULTADO: sesión, resumen e histórico verificados por HTTP.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-url', default='http://localhost:3001/api/v1')
    parser.add_argument('--device', default='ESP32-DEMO-001')
    args = parser.parse_args()
    probe = None
    try:
        require(sys.stdin.isatty(), 'Ejecuta la prueba desde una terminal interactiva.')
        probe = AuthProbe(args.api_url)
        email = input('Correo del administrador: ').strip()
        password = getpass.getpass('Contraseña (oculta): ')
        require(bool(email) and bool(password), 'Debes ingresar correo y contraseña.')
        check_dashboard(probe, args.device, email, password)
        return 0
    except (CheckFailed, EOFError, ValueError, TypeError) as error:
        print(f'FALLO: {error}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('\nPrueba interrumpida.', file=sys.stderr)
        return 130
    finally:
        if probe and probe.csrf and probe.cookie('tunupa_access'):
            try:
                probe.request('POST', '/auth/logout', 204, csrf=True)
            except CheckFailed:
                print('AVISO: no se pudo cerrar la sesión de prueba.', file=sys.stderr)


if __name__ == '__main__':
    raise SystemExit(main())
