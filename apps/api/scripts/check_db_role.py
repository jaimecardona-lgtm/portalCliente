"""Comprobación de solo lectura del rol con el que la API se conecta a la base de datos.

Responsabilidad: verificar, antes del primer arranque real, que la conexión `DATABASE_URL` cumple lo que la
API y la RLS necesitan. No crea roles, no cambia privilegios y no escribe datos. Todo ocurre dentro de una
transacción que se revierte.

Comprueba:
- El rol conectado no es superusuario, no tiene BYPASSRLS ni CREATEROLE, y no es `postgres`.
- Existe el rol de aplicación (`DATABASE_APP_ROLE`, por defecto `portal_app`), sin LOGIN y sin BYPASSRLS.
- El rol conectado es miembro de `portal_app` y puede hacer `SET LOCAL ROLE portal_app`, como cada petición.
- `anon` y `authenticated` no tienen privilegios sobre las tablas del portal (si existen).

Uso (desde apps/api; la URL solo en el entorno, nunca en argumentos):

    $env:DATABASE_URL = "postgresql+psycopg://portal_api.<ref>:<clave>@<host>:6543/postgres"
    .\\.venv\\Scripts\\python.exe scripts\\check_db_role.py

Salida: una línea por comprobación. Código 0 si todo cumple, 1 si hay problemas, 2 si falta configuración.
Nunca imprime la URL, contraseñas ni el mensaje completo de una excepción de conexión.
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import Connection, create_engine, text

PORTAL_TABLES = (
    "tenants",
    "profiles",
    "tenant_memberships",
    "operation_refs",
    "operation_events",
    "event_comments",
    "requests",
    "attachments",
)
SUPABASE_API_ROLES = ("anon", "authenticated")
FORBIDDEN_CONNECTED_ROLES = frozenset({"postgres", "service_role"})


@dataclass
class RoleFacts:
    """Hechos leídos de PostgreSQL. Se evalúan sin conexión para poder probar las reglas."""

    connected_role: str
    connected_superuser: bool = False
    connected_bypassrls: bool = False
    connected_createrole: bool = False
    app_role: str = "portal_app"
    app_role_exists: bool = False
    app_role_login: bool = False
    app_role_bypassrls: bool = False
    member_of_app_role: bool = False
    set_role_works: bool = False
    api_roles_present: tuple[str, ...] = ()
    api_roles_with_table_privileges: tuple[str, ...] = ()


@dataclass
class Report:
    problems: list[str] = field(default_factory=list)
    checks: list[str] = field(default_factory=list)


def evaluate(facts: RoleFacts) -> Report:
    """Aplica las reglas a los hechos. Devuelve las comprobaciones correctas y los problemas."""
    report = Report()

    def check(ok: bool, text: str) -> None:
        (report.checks if ok else report.problems).append(text)

    check(not facts.connected_superuser, "El rol conectado no es superusuario.")
    check(not facts.connected_bypassrls, "El rol conectado no tiene BYPASSRLS (la RLS se aplica).")
    check(not facts.connected_createrole, "El rol conectado no puede crear roles (CREATEROLE desactivado).")
    check(
        facts.connected_role not in FORBIDDEN_CONNECTED_ROLES,
        "La API no se conecta con un rol de administración ni con service_role.",
    )
    check(facts.app_role_exists, f"Existe el rol de aplicación {facts.app_role}.")
    if facts.app_role_exists:
        check(not facts.app_role_login, f"{facts.app_role} no tiene LOGIN (solo se asume con SET ROLE).")
        check(not facts.app_role_bypassrls, f"{facts.app_role} no tiene BYPASSRLS.")
    check(
        facts.member_of_app_role,
        f"El rol conectado es miembro de {facts.app_role} (sin esto, cada petición falla).",
    )
    check(
        facts.set_role_works,
        f"SET LOCAL ROLE {facts.app_role} funciona desde el rol conectado.",
    )
    leaked = facts.api_roles_with_table_privileges
    check(
        not leaked,
        "anon y authenticated no tienen privilegios sobre las tablas del portal."
        if not leaked
        else f"Privilegios no permitidos para: {', '.join(leaked)}.",
    )
    return report


def _read_facts(url: str, app_role: str) -> RoleFacts:
    """Lee los hechos con una sola transacción revertida. No modifica nada."""
    engine = create_engine(url, future=True, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            trans = conn.begin()
            try:
                row = (
                    conn.execute(
                        text(
                            """
                            SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls, r.rolcreaterole
                            FROM pg_roles r WHERE r.rolname = current_user
                            """
                        )
                    )
                    .mappings()
                    .one()
                )
                facts = RoleFacts(
                    connected_role=str(row["role_name"]),
                    connected_superuser=bool(row["rolsuper"]),
                    connected_bypassrls=bool(row["rolbypassrls"]),
                    connected_createrole=bool(row["rolcreaterole"]),
                    app_role=app_role,
                )
                app = (
                    conn.execute(
                        text("SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = :name"),
                        {"name": app_role},
                    )
                    .mappings()
                    .first()
                )
                if app is not None:
                    facts.app_role_exists = True
                    facts.app_role_login = bool(app["rolcanlogin"])
                    facts.app_role_bypassrls = bool(app["rolbypassrls"])
                    facts.member_of_app_role = bool(
                        conn.execute(
                            text("SELECT pg_has_role(current_user, :name, 'MEMBER')"), {"name": app_role}
                        ).scalar()
                    )
                    if facts.member_of_app_role:
                        facts.set_role_works = _set_role_probe(conn, app_role)

                present = tuple(
                    name
                    for name in SUPABASE_API_ROLES
                    if conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :n"), {"n": name}).first()
                )
                facts.api_roles_present = present
                leaked: list[str] = []
                for name in present:
                    for table in PORTAL_TABLES:
                        granted = conn.execute(
                            text("SELECT has_table_privilege(:role, :table, 'SELECT,INSERT,UPDATE,DELETE')"),
                            {"role": name, "table": f"public.{table}"},
                        ).scalar()
                        if granted:
                            leaked.append(name)
                            break
                facts.api_roles_with_table_privileges = tuple(leaked)
            finally:
                trans.rollback()
        return facts
    finally:
        engine.dispose()


_ROLE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def _safe_identifier(name: str) -> str:
    if not _ROLE_NAME.match(name):
        raise ValueError("Nombre de rol no válido.")
    return name


def _set_role_probe(conn: Connection, role: str) -> bool:
    """Prueba `SET LOCAL ROLE` dentro de un savepoint que siempre se revierte.

    Un fallo aquí es un resultado (la comprobación no se cumple), no un error de lectura: el savepoint evita
    que una transacción abortada rompa las consultas siguientes.
    """
    savepoint = conn.begin_nested()
    try:
        conn.execute(text(f'SET LOCAL ROLE "{_safe_identifier(role)}"'))
        return conn.execute(text("SELECT 1")).scalar() == 1
    except Exception:  # noqa: BLE001 - cualquier fallo de SET ROLE significa que la comprobación no se cumple
        return False
    finally:
        savepoint.rollback()


API_DIR = Path(__file__).resolve().parents[1]


def _load_connection() -> tuple[str, str, str]:
    """Devuelve (DATABASE_URL, rol de aplicación, origen) sin imprimir ningún valor.

    Prioridad: variables de entorno; si faltan, `apps/api/.env` leído con la misma clase `Settings` de la API.
    Si el archivo no es válido, no se muestra el mensaje de Pydantic: puede contener valores de configuración.
    """
    env_url = os.environ.get("DATABASE_URL", "").strip()
    if env_url:
        return (
            env_url,
            os.environ.get("DATABASE_APP_ROLE", "").strip() or "portal_app",
            "variables de entorno",
        )
    env_file = API_DIR / ".env"
    if not env_file.is_file():
        return "", "portal_app", "sin configuración"
    sys.path.insert(0, str(API_DIR))
    try:
        from app.core.config import Settings

        settings = Settings(_env_file=env_file)
    except Exception as exc:  # noqa: BLE001 - el mensaje de validación puede contener valores; solo se informa el tipo
        print(f"No fue posible leer {env_file.name} ({type(exc).__name__}).", file=sys.stderr)
        return "", "portal_app", "error de lectura"
    if "database_url" not in settings.model_fields_set:
        # Sin DATABASE_URL explícita no se usa el valor por defecto local: podría apuntar a otra base.
        return "", "portal_app", "sin DATABASE_URL"
    return settings.database_url, settings.database_app_role, str(env_file)


def main() -> int:
    # Windows puede usar una codificación de consola distinta: la salida en español debe ser legible.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    url, app_role, source = _load_connection()
    if not url:
        print(
            "Falta DATABASE_URL: defínala en el entorno o en apps/api/.env (no se imprime).",
            file=sys.stderr,
        )
        return 2
    print(f"Configuración leída de: {source}")
    try:
        facts = _read_facts(url, app_role)
    except Exception as exc:  # noqa: BLE001 - no se muestra el mensaje: puede contener datos de conexión
        # Solo se informan el tipo de error y el código SQLSTATE (p. ej. 28P01 = contraseña incorrecta,
        # 28000 = rol no válido). El mensaje completo puede contener host, usuario o contraseña.
        sqlstate = getattr(getattr(exc, "orig", None), "sqlstate", None) or getattr(exc, "sqlstate", None)
        detail = f", SQLSTATE {sqlstate}" if sqlstate else ", sin código SQLSTATE (red o host)"
        print(
            f"No fue posible leer el rol de la base de datos ({type(exc).__name__}{detail}).",
            file=sys.stderr,
        )
        return 1

    report = evaluate(facts)
    print(f"Rol conectado: {facts.connected_role}")
    for line in report.checks:
        print(f"  [OK]        {line}")
    for line in report.problems:
        print(f"  [PROBLEMA]  {line}")
    if report.problems:
        print(f"Resultado: {len(report.problems)} problema(s). No aplique migraciones ni arranque la API.")
        return 1
    print("Resultado: el rol cumple los requisitos de la API.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
