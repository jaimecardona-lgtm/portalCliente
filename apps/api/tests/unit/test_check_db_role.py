"""Reglas de la comprobación de solo lectura del rol de la API (scripts/check_db_role.py).

Solo evalúan hechos ya leídos: no abren conexión. Las pruebas de integración contra PostgreSQL se
ejecutan en `tests/integration` cuando hay PORTAL_TEST_DATABASE_URL.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_db_role.py"
_spec = importlib.util.spec_from_file_location("check_db_role", _SCRIPT)
assert _spec is not None and _spec.loader is not None
check_db_role = importlib.util.module_from_spec(_spec)
# dataclasses busca el módulo en sys.modules: un módulo cargado por ruta debe registrarse antes de ejecutarlo.
sys.modules[_spec.name] = check_db_role
_spec.loader.exec_module(check_db_role)

RoleFacts = check_db_role.RoleFacts
evaluate = check_db_role.evaluate


def _healthy(**overrides: object) -> RoleFacts:
    base = {
        "connected_role": "portal_api",
        "connected_superuser": False,
        "connected_bypassrls": False,
        "connected_createrole": False,
        "app_role": "portal_app",
        "app_role_exists": True,
        "app_role_login": False,
        "app_role_bypassrls": False,
        "member_of_app_role": True,
        "set_role_works": True,
        "api_roles_present": ("anon", "authenticated"),
        "api_roles_with_table_privileges": (),
    }
    base.update(overrides)
    return RoleFacts(**base)  # type: ignore[arg-type]


def test_rol_correcto_no_tiene_problemas() -> None:
    report = evaluate(_healthy())
    assert report.problems == []
    assert len(report.checks) >= 8


@pytest.mark.parametrize(
    "overrides",
    [
        {"connected_superuser": True},
        {"connected_bypassrls": True},
        {"connected_createrole": True},
        {"connected_role": "postgres"},
        {"connected_role": "service_role"},
        {"app_role_exists": False},
        {"app_role_login": True},
        {"app_role_bypassrls": True},
        {"member_of_app_role": False},
        {"set_role_works": False},
        {"api_roles_with_table_privileges": ("authenticated",)},
    ],
)
def test_cada_incumplimiento_produce_un_problema(overrides: dict[str, object]) -> None:
    report = evaluate(_healthy(**overrides))
    assert report.problems, f"debería fallar con {overrides}"


def test_privilegios_de_anon_se_nombran_sin_datos_de_conexion() -> None:
    report = evaluate(_healthy(api_roles_with_table_privileges=("anon", "authenticated")))
    text = " ".join(report.problems)
    assert "anon, authenticated" in text
    assert "postgresql" not in text
    assert "@" not in text


def test_sin_rol_de_aplicacion_el_problema_principal_es_su_ausencia() -> None:
    # Si el rol de aplicación no existe, el problema principal es su ausencia.
    report = evaluate(_healthy(app_role_exists=False, member_of_app_role=False, set_role_works=False))
    assert any("Existe el rol de aplicación" in p for p in report.problems)


def test_nombre_de_rol_no_valido_se_rechaza() -> None:
    with pytest.raises(ValueError):
        check_db_role._safe_identifier('portal_app"; DROP TABLE tenants; --')
    assert check_db_role._safe_identifier("portal_app") == "portal_app"
