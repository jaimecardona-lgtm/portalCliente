"""Procedimiento administrativo de personal interno. Ejecutar con la conexión del PROPIETARIO del esquema.

La conexión se lee solo del entorno (DATABASE_URL), nunca de apps/api/.env. Cada subcomando exige una
referencia de autorización escrita (--authorized-by) y un motivo (--reason). No imprime correos ni
identificadores personales.

Ejemplos (no ejecutar sin autorización del responsable):

    scripts\\provision_staff.py grant-staff --user-id <uuid de Auth> --role qa --authorized-by "<referencia>"
    scripts\provision_staff.py grant-tenant --user-id <uuid> --tenant-slug <slug>
        --authorized-by "<ref>" --reason "<motivo>"
    scripts\\provision_staff.py verify-tenant --tenant-slug <slug> --external-id <identificador oficial>
    scripts\\provision_staff.py revoke-staff --user-id <uuid> --reason "<motivo>"

Código de salida: 0 correcto; 2 error de validación, de estado o de configuración.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402

from app.services.staff_provisioning import (  # noqa: E402
    Authorization,
    ProvisioningError,
    assert_owner_connection,
    grant_scope,
    grant_staff,
    grant_tenant,
    provision_tenant,
    revoke_scope,
    revoke_staff,
    revoke_tenant,
    verify_tenant,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Administra el personal interno del portal.")
    sub = parser.add_subparsers(dest="command", required=True)

    g = sub.add_parser("grant-staff", help="Concede un rol interno activo.")
    g.add_argument("--user-id", required=True, type=UUID)
    g.add_argument("--role", required=True, choices=["platform_admin", "qa", "developer", "support"])
    g.add_argument("--authorized-by", required=True)
    g.add_argument("--reason", default="Asignación de rol interno")
    g.add_argument("--full-name", help="Solo si la cuenta aún no tiene perfil.")

    r = sub.add_parser("revoke-staff", help="Revoca el rol interno (efecto inmediato).")
    r.add_argument("--user-id", required=True, type=UUID)
    r.add_argument("--reason", required=True)

    gt = sub.add_parser("grant-tenant", help="Asigna una empresa al personal interno.")
    gt.add_argument("--user-id", required=True, type=UUID)
    gt.add_argument("--tenant-slug", required=True)
    gt.add_argument("--authorized-by", required=True)
    gt.add_argument("--reason", required=True)

    rt = sub.add_parser("revoke-tenant", help="Retira una empresa asignada.")
    rt.add_argument("--user-id", required=True, type=UUID)
    rt.add_argument("--tenant-slug", required=True)
    rt.add_argument("--reason", required=True)

    gs = sub.add_parser("grant-scope", help="Alcance global a las empresas verificadas y activas.")
    gs.add_argument("--user-id", required=True, type=UUID)
    gs.add_argument("--authorized-by", required=True)
    gs.add_argument("--reason", required=True)

    rs = sub.add_parser("revoke-scope", help="Retira el alcance global (conserva los grants).")
    rs.add_argument("--user-id", required=True, type=UUID)
    rs.add_argument("--reason", required=True)

    pt = sub.add_parser(
        "provision-tenant", help="Alta de empresa observada, pendiente de integración, sin operaciones."
    )
    pt.add_argument("--observed-label", required=True, help="Etiqueta exacta del descubrimiento.")
    pt.add_argument("--tenant-slug", required=True)
    pt.add_argument("--legal-name", required=True)
    pt.add_argument("--tax-id", required=True, help="NIT aportado por la autorización. Nunca se inventa.")
    pt.add_argument("--authorized-by", required=True)
    pt.add_argument("--reason", default="Alta empresarial autorizada")

    vt = sub.add_parser("verify-tenant", help="Verifica una empresa con su identificador oficial.")
    vt.add_argument("--tenant-slug", required=True)
    vt.add_argument("--external-id", required=True)
    vt.add_argument("--verified-by-user-id", type=UUID, default=None)
    return parser


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    args = build_parser().parse_args()
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("Falta DATABASE_URL del propietario en el entorno (no se lee de .env).", file=sys.stderr)
        return 2
    engine = create_engine(url, future=True)
    try:
        with engine.begin() as conn:
            assert_owner_connection(conn)
            message = _run(conn, args)
    except ProvisioningError as exc:
        print(f"Operación rechazada: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - sin mensaje: puede contener datos de conexión
        print(f"No fue posible ejecutar la operación ({type(exc).__name__}).", file=sys.stderr)
        return 2
    finally:
        engine.dispose()
    print(f"Hecho: {message}.")
    return 0


def _run(conn, args: argparse.Namespace) -> str:
    if args.command == "grant-staff":
        return grant_staff(
            conn, args.user_id, args.role, Authorization(args.authorized_by, args.reason), args.full_name
        )
    if args.command == "revoke-staff":
        return revoke_staff(conn, args.user_id, args.reason)
    if args.command == "grant-tenant":
        return grant_tenant(
            conn, args.user_id, args.tenant_slug, Authorization(args.authorized_by, args.reason)
        )
    if args.command == "grant-scope":
        return grant_scope(conn, args.user_id, Authorization(args.authorized_by, args.reason))
    if args.command == "revoke-scope":
        return revoke_scope(conn, args.user_id, args.reason)
    if args.command == "provision-tenant":
        return provision_tenant(
            conn,
            args.observed_label,
            args.tenant_slug,
            args.legal_name,
            args.tax_id,
            Authorization(args.authorized_by, args.reason),
        )
    if args.command == "revoke-tenant":
        return revoke_tenant(conn, args.user_id, args.tenant_slug, args.reason)
    return verify_tenant(conn, args.tenant_slug, args.external_id, args.verified_by_user_id)


if __name__ == "__main__":
    raise SystemExit(main())
