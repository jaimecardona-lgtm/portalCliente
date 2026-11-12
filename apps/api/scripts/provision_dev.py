"""CLI de aprovisionamiento de desarrollo. Crea empresa, perfil, membresía y operación sintética.

Uso (desde apps/api, con la base de datos de DESARROLLO, nunca de producción):

    $env:DATABASE_URL = "postgresql+psycopg://postgres@127.0.0.1:5432/portal_test"
    .\\.venv\\Scripts\\python.exe scripts\\provision_dev.py `
        --user-id <uuid del usuario creado en Supabase Auth> `
        --email persona@cliente-a.test --full-name "Ana Prueba" `
        --tenant-slug tn-andino --tenant-legal-name "Textiles Andinos S.A.S." `
        --tenant-tax-id 900000001-1 --role client_admin

El usuario de Supabase Auth debe existir antes. Esta CLI no crea credenciales ni recibe contraseñas.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import create_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.provisioning import (  # noqa: E402
    ALLOWED_ROLES,
    DevMembership,
    provision_membership,
    provision_synthetic_operation,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Aprovisiona datos de desarrollo sintéticos.")
    parser.add_argument("--user-id", required=True, type=UUID)
    parser.add_argument("--email", required=True)
    parser.add_argument("--full-name", required=True)
    parser.add_argument("--tenant-slug", required=True)
    parser.add_argument("--tenant-legal-name", required=True)
    parser.add_argument("--tenant-tax-id", required=True)
    parser.add_argument("--role", required=True, choices=sorted(ALLOWED_ROLES))
    parser.add_argument("--client-legal-name", help="Cliente final (nivel B) al que pertenece la persona.")
    parser.add_argument("--client-tax-id", help="NIT del cliente final, si se conoce.")
    parser.add_argument(
        "--client-role",
        default="client_admin",
        choices=["client_admin", "client_viewer"],
        help="Rol en el cliente.",
    )
    parser.add_argument("--synthetic-operation", action="store_true", help="Crea una operación sintética.")
    args = parser.parse_args()

    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("Defina DATABASE_URL (base de datos de desarrollo).", file=sys.stderr)
        return 2

    engine = create_engine(url, future=True)
    member = DevMembership(
        user_id=args.user_id,
        email=args.email,
        full_name=args.full_name,
        tenant_slug=args.tenant_slug,
        tenant_legal_name=args.tenant_legal_name,
        tenant_tax_id=args.tenant_tax_id,
        role=args.role,
        client_legal_name=args.client_legal_name,
        client_tax_id=args.client_tax_id,
        client_role=args.client_role,
    )
    try:
        with engine.begin() as conn:
            provision_membership(conn, member)
            if args.synthetic_operation:
                provision_synthetic_operation(conn, args.tenant_slug, args.client_legal_name)
    except ValueError as exc:
        print(f"Datos no válidos: {exc}", file=sys.stderr)
        return 2
    finally:
        engine.dispose()
    print("Aprovisionamiento completado (idempotente).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
