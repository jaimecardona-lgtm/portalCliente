"""Procedimiento administrativo: reintenta la limpieza de objetos de Storage pendientes.

Uso (desde apps/api). Por defecto SOLO SIMULA; añada --apply para borrar:

    $env:DATABASE_URL = "<conexión del PROPIETARIO del esquema, no se guarda>"
    $env:SUPABASE_URL = "https://<ref>.supabase.co"
    $env:SUPABASE_SECRET_KEY = "<clave privilegiada, no se guarda>"
    .\\.venv\\Scripts\\python.exe scripts\\reconcile_storage_cleanup.py
    .\\.venv\\Scripts\\python.exe scripts\\reconcile_storage_cleanup.py --apply --limit 50

Seguridad:
- Se niega a ejecutarse con los roles del portal (portal_api, portal_app): la cola solo la lee el propietario.
- Lee la configuración del entorno, nunca de apps/api/.env, para no mezclar la clave privilegiada con la API.
- No imprime cadenas de conexión ni claves. Imprime contadores y códigos de operación.
Código de salida: 0 sin fallos, 1 si hubo fallos de Storage, 2 si falta configuración o el rol no es válido.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.services.storage import build_storage  # noqa: E402
from app.services.storage_reconcile import reconcile  # noqa: E402

PORTAL_ROLES = frozenset({"portal_api", "portal_app"})


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    parser = argparse.ArgumentParser(description="Reintenta la limpieza de objetos de Storage pendientes.")
    parser.add_argument(
        "--apply", action="store_true", help="Borra los objetos. Sin esta opción solo simula."
    )
    parser.add_argument("--limit", type=int, default=100, help="Máximo de trabajos por ejecución (1-500).")
    args = parser.parse_args()
    if not 1 <= args.limit <= 500:
        print("--limit debe estar entre 1 y 500.", file=sys.stderr)
        return 2

    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("Falta DATABASE_URL del propietario en el entorno (no se lee de .env).", file=sys.stderr)
        return 2
    settings = Settings(_env_file=None)  # solo entorno: nada de .env
    storage = build_storage(settings)
    if storage is None:
        print("Falta SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno.", file=sys.stderr)
        return 2

    engine = create_engine(url, future=True, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            current = conn.execute(text("SELECT current_user")).scalar()
        if current in PORTAL_ROLES:
            print(
                f"Negado: la conexión usa el rol {current} del portal. Use el propietario del esquema.",
                file=sys.stderr,
            )
            return 2
        report = reconcile(engine, storage, apply=args.apply, limit=args.limit)
    except Exception as exc:  # noqa: BLE001 - no se muestra el mensaje: puede contener datos de conexión
        print(f"No fue posible ejecutar la reconciliación ({type(exc).__name__}).", file=sys.stderr)
        return 2
    finally:
        engine.dispose()

    mode = "APLICADO" if args.apply else "SIMULACIÓN (sin borrar)"
    print(f"Modo: {mode}")
    print(f"Trabajos examinados: {report.examined}")
    print(f"Objetos borrados: {report.deleted}")
    print(f"Omitidos por seguir siendo referencia válida: {report.skipped_referenced}")
    print(f"Fallos de Storage (reintentables): {report.failed}")
    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
