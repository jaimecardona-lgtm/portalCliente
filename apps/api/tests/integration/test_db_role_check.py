"""Lectura real de los hechos del rol de la API contra PostgreSQL (scripts/check_db_role.py).

No evalúa el veredicto: en la base de pruebas el rol conectado suele ser el propietario (superusuario),
así que la verificación comprueba que la lectura funciona y que `portal_app` tiene la forma esperada.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_db_role.py"
_spec = importlib.util.spec_from_file_location("check_db_role", _SCRIPT)
assert _spec is not None and _spec.loader is not None
check_db_role = importlib.util.module_from_spec(_spec)
# dataclasses busca el módulo en sys.modules: un módulo cargado por ruta debe registrarse antes de ejecutarlo.
sys.modules[_spec.name] = check_db_role
_spec.loader.exec_module(check_db_role)


def test_los_hechos_del_rol_se_leen_de_postgres(database_url: str) -> None:
    facts = check_db_role._read_facts(database_url, "portal_app")

    assert facts.connected_role
    assert facts.app_role_exists is True
    assert facts.app_role_login is False, "portal_app debe ser NOLOGIN"
    assert facts.app_role_bypassrls is False, "portal_app no debe tener BYPASSRLS"
    assert set(facts.api_roles_present) <= {"anon", "authenticated"}


def test_el_rol_de_pruebas_puede_asumir_portal_app(database_url: str) -> None:
    facts = check_db_role._read_facts(database_url, "portal_app")

    # Las migraciones conceden portal_app al rol que las aplica; la base de pruebas usa ese mismo rol.
    assert facts.member_of_app_role is True
    assert facts.set_role_works is True


def test_el_veredicto_marca_superusuario_en_la_base_de_pruebas(database_url: str) -> None:
    facts = check_db_role._read_facts(database_url, "portal_app")
    report = check_db_role.evaluate(facts)
    if facts.connected_superuser:
        assert any("superusuario" in p for p in report.problems)
    else:
        pytest.skip("La base de pruebas no usa un superusuario.")
