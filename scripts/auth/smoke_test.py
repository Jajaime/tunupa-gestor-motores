#!/usr/bin/env python3
"""Verificación interactiva de autenticación local; solo biblioteca estándar."""

import argparse
import copy
import getpass
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


class CheckFailed(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None


def require(condition, message):
    if not condition:
        raise CheckFailed(message)


class AuthProbe:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        parsed = urllib.parse.urlsplit(self.base_url)
        require(
            parsed.scheme in ("http", "https")
            and parsed.hostname in ("localhost", "127.0.0.1", "::1")
            and not parsed.username
            and not parsed.password
            and not parsed.query
            and not parsed.fragment,
            "Usa una URL local, por ejemplo http://localhost:3001/api/v1.",
        )
        self.cookies = http.cookiejar.CookieJar()
        self.csrf = None

    def request(self, method, path, expected, *, payload=None, csrf=False, jar=None):
        cookies = self.cookies if jar is None else jar
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            NoRedirect(),
            urllib.request.HTTPCookieProcessor(cookies),
        )
        headers = {"Accept": "application/json"}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if csrf:
            headers["X-CSRF-Token"] = self.csrf
        request = urllib.request.Request(
            self.base_url + path, data=data, headers=headers, method=method
        )
        try:
            try:
                response = opener.open(request, timeout=10)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                status = response.code
                body = response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise CheckFailed(
                f"{method} {path}: no fue posible contactar la API local."
            ) from error
        require(
            status == expected,
            f"{method} {path}: esperado HTTP {expected}, recibido HTTP {status}.",
        )
        if not body:
            return None
        try:
            return json.loads(body)
        except (ValueError, UnicodeError) as error:
            raise CheckFailed(f"{method} {path}: respuesta JSON inválida.") from error

    def cookie(self, name):
        return next((cookie for cookie in self.cookies if cookie.name == name), None)

    def snapshot(self):
        # CookieJar contiene un lock: copiar las cookies, no el contenedor.
        jar = http.cookiejar.CookieJar()
        for cookie in self.cookies:
            jar.set_cookie(copy.copy(cookie))
        return jar

    def check_user(self, body, expected_id=None, expected_email=None):
        user = body.get("user") if isinstance(body, dict) else None
        require(isinstance(user, dict) and bool(user.get("id")), "Falta el usuario en la respuesta.")
        require(user.get("role") == "ADMIN", "La cuenta utilizada no tiene rol ADMIN.")
        if expected_id:
            require(user["id"] == expected_id, "La identidad cambió durante la sesión.")
        if expected_email:
            require(user.get("email") == expected_email, "El correo de la sesión no coincide.")
        return user["id"]

    def run(self, email, password):
        self.request("GET", "/auth/me", 401)
        self.request("GET", "/dashboard/motors", 401)
        print("OK 01: sesión y dashboard rechazan acceso anónimo (401).")

        body = self.request("GET", "/auth/csrf", 200)
        self.csrf = body.get("csrfToken") if isinstance(body, dict) else None
        cookie = self.cookie("tunupa_csrf")
        require(isinstance(self.csrf, str) and bool(self.csrf), "Falta el token CSRF.")
        require(cookie is not None and cookie.value == self.csrf, "Cookie y token CSRF no coinciden.")
        print("OK 02: token CSRF y cookie coinciden.")

        payload = {"email": email, "password": password}
        self.request("POST", "/auth/login", 403, payload=payload)
        print("OK 03: login sin cabecera CSRF rechazado (403).")

        body = self.request("POST", "/auth/login", 200, payload=payload, csrf=True)
        user_id = self.check_user(body, expected_email=email)
        for name in ("tunupa_access", "tunupa_refresh"):
            cookie = self.cookie(name)
            require(cookie is not None and bool(cookie.value), f"Falta la cookie {name}.")
            require(cookie.has_nonstandard_attr("HttpOnly"), f"La cookie {name} no es HttpOnly.")
        print("OK 04: login de administrador y cookies HttpOnly.")

        self.check_user(self.request("GET", "/auth/me", 200), user_id, email)
        motors = self.request("GET", "/dashboard/motors", 200)
        require(isinstance(motors, list), "El dashboard no devolvió un listado.")
        print("OK 05: consulta de sesión y dashboard autenticados (200).")

        previous_jar = self.snapshot()
        old_refresh = self.cookie("tunupa_refresh").value
        body = self.request("POST", "/auth/refresh", 200, csrf=True)
        self.check_user(body, user_id, email)
        new_refresh = self.cookie("tunupa_refresh")
        require(new_refresh is not None and new_refresh.value != old_refresh, "El refresh token no fue rotado.")
        self.check_user(self.request("GET", "/auth/me", 200), user_id, email)
        print("OK 06: renovación de sesión, rotación y acceso posterior.")

        self.request("POST", "/auth/refresh", 401, csrf=True, jar=previous_jar)
        print("OK 07: refresh token anterior rechazado (401).")

        before_logout = self.snapshot()
        self.request("POST", "/auth/logout", 204, csrf=True)
        require(
            self.cookie("tunupa_access") is None and self.cookie("tunupa_refresh") is None,
            "Logout no eliminó las cookies de sesión.",
        )
        self.request("GET", "/auth/me", 401)
        self.request("GET", "/dashboard/motors", 401)
        print("OK 08: logout, eliminación de cookies y acceso anónimo rechazado.")

        self.request("POST", "/auth/refresh", 401, csrf=True, jar=before_logout)
        print("OK 09: refresh token revocado por logout rechazado (401).")
        print("RESULTADO: autenticación HTTP verificada en la API indicada.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://localhost:3001/api/v1")
    args = parser.parse_args()
    probe = None
    try:
        probe = AuthProbe(args.api_url)
        require(sys.stdin.isatty(), "Ejecuta la prueba desde una terminal interactiva.")
        email = input("Correo del administrador: ").strip().lower()
        require(bool(email), "Debes ingresar el correo.")
        password = getpass.getpass("Contraseña (oculta): ")
        require(bool(password), "Debes ingresar la contraseña.")
        probe.run(email, password)
        return 0
    except (CheckFailed, EOFError, ValueError) as error:
        print(f"FALLO: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nPrueba interrumpida.", file=sys.stderr)
        return 130
    finally:
        # Intenta cerrar la sesión propia si una comprobación falló tras el login.
        if probe and probe.csrf and probe.cookie("tunupa_access"):
            try:
                probe.request("POST", "/auth/logout", 204, csrf=True)
            except CheckFailed:
                print("AVISO: no se pudo cerrar la sesión de prueba.", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
