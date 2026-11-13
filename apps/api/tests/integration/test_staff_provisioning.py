"""Procedimiento administrativo de personal con la conexión del propietario."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.services.staff_provisioning import (
    Authorization,
    ProvisioningError,
    assert_owner_connection,
    grant_staff,
    grant_tenant,
    revoke_staff,
    verify_tenant,
)
from tests.conftest import Seed

pytestmark = pytest.mark.integration


def test_authorization_requires_reference_and_reason() -> None:
    with pytest.raises(ProvisioningError):
        Authorization("", "motivo válido")
    with pytest.raises(ProvisioningError):
        Authorization("ref", "x")


def test_grant_staff_refuses_unknown_accounts(owner_engine: Engine) -> None:
    """Sin cuenta en la base (ni perfil), no se crea nada: la cuenta debe existir ya."""
    with owner_engine.begin() as conn, pytest.raises(ProvisioningError, match="no existe"):
        grant_staff(conn, uuid.uuid4(), "qa", Authorization("Ref de prueba", "Asignación de prueba"), None)


def test_grant_staff_creates_profile_only_with_explicit_name_and_auth_email(owner_engine: Engine) -> None:
    """Sin esquema auth no hay correo que tomar: la cuenta debe tener perfil. Nunca se inventa un correo."""
    user = uuid.uuid4()
    with owner_engine.begin() as conn:
        with pytest.raises(ProvisioningError):
            grant_staff(
                conn, user, "qa", Authorization("Ref de prueba", "Asignación de prueba"), "Nombre Prueba"
            )


def test_grant_staff_refuses_unknown_role_and_portal_connections(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn, pytest.raises(ProvisioningError, match="Rol interno"):
        grant_staff(conn, seed.ana, "superuser", Authorization("Ref de prueba", "Asignación de prueba"), None)
    with owner_engine.begin() as conn:
        conn.execute(text("SELECT 1"))
        assert_owner_connection(conn)  # la conexión de prueba es del propietario


def test_grant_and_revoke_staff_with_effect_on_next_read(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        assert grant_staff(conn, seed.ana, "support", Authorization("Ref de prueba", "Soporte"), None)
    with owner_engine.connect() as conn:
        active = conn.execute(
            text("SELECT active FROM platform_staff WHERE user_id = :u"), {"u": seed.ana}
        ).scalar()
    assert active is True
    with owner_engine.begin() as conn:
        revoke_staff(conn, seed.ana, "Fin de la asignación de prueba")
    with owner_engine.connect() as conn:
        row = (
            conn.execute(
                text(
                    "SELECT active, revoked_at IS NOT NULL AS revoked FROM platform_staff WHERE user_id = :u"
                ),
                {"u": seed.ana},
            )
            .mappings()
            .one()
        )
    assert row["active"] is False and row["revoked"] is True


def test_revoking_without_active_role_is_rejected(owner_engine: Engine, seed: Seed) -> None:
    with (
        owner_engine.begin() as conn,
        pytest.raises(ProvisioningError, match="no tiene un rol interno activo"),
    ):
        revoke_staff(conn, seed.eva, "Motivo de prueba")


def test_grant_tenant_requires_active_staff_role(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn, pytest.raises(ProvisioningError, match="rol interno activo"):
        grant_tenant(conn, seed.eva, "tn-andino", Authorization("Ref de prueba", "Soporte de prueba"))


def test_verify_tenant_rejects_duplicate_official_identifier(owner_engine: Engine, seed: Seed) -> None:
    with owner_engine.begin() as conn:
        verify_tenant(conn, "tn-andino", "EXT-UNICO-1", None)
    with owner_engine.begin() as conn, pytest.raises(ProvisioningError, match="ya está asociado"):
        verify_tenant(conn, "tn-pacifico", "EXT-UNICO-1", None)


def test_verify_tenant_rejects_invalid_identifier_and_unknown_tenant(
    owner_engine: Engine, seed: Seed
) -> None:
    with owner_engine.begin() as conn, pytest.raises(ProvisioningError, match="no válido"):
        verify_tenant(conn, "tn-andino", "ID con espacios", None)
    with owner_engine.begin() as conn, pytest.raises(ProvisioningError, match="no existe"):
        verify_tenant(conn, "tn-inexistente", "EXT-OTRO", None)
