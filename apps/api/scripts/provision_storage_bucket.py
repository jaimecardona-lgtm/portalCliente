"""Verifica o crea el bucket privado `logixtic-client-documents` mediante la API oficial de Storage.

Uso (desde apps/api). Por defecto NO escribe: muestra si el bucket existe, si coincide y qué crearía.

    $env:SUPABASE_URL = "https://<ref>.supabase.co"
    $env:SUPABASE_SECRET_KEY = "<clave privilegiada, no se guarda>"
    .\\.venv\\Scripts\\python.exe scripts\\provision_storage_bucket.py            # solo verifica
    .\\.venv\\Scripts\\python.exe scripts\\provision_storage_bucket.py --apply    # crea si no existe

Seguridad: lee solo del entorno (no de .env), no imprime la clave ni respuestas del servidor.
Código de salida: 0 correcto, 1 bucket existente con configuración distinta o error, 2 falta configuración.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.services.storage_bucket import ensure_bucket  # noqa: E402


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    parser = argparse.ArgumentParser(description="Verifica o crea el bucket privado de documentos.")
    parser.add_argument("--apply", action="store_true", help="Crea el bucket si no existe.")
    args = parser.parse_args()

    base = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not base or not key:
        print("Falta SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno.", file=sys.stderr)
        return 2

    with httpx.Client(timeout=20.0) as client:
        result = ensure_bucket(client, base, key, apply=args.apply)

    messages = {
        "exists_ok": "El bucket existe y coincide con la configuración esperada (privado, límite y tipos).",
        "exists_mismatch": "El bucket existe pero NO coincide. No se modificó:",
        "would_create": (
            "El bucket no existe. Con --apply se crearía privado, con límite de 5 MB y tipos admitidos."
        ),
        "created": "Bucket creado: privado, límite de 5 MB y tipos admitidos.",
        "error": "No fue posible consultar o crear el bucket (código de operación no mostrado).",
    }
    print(messages[result.action])
    for diff in result.differences:
        print(f"  - {diff}")
    return 1 if result.action in ("exists_mismatch", "error") else 0


if __name__ == "__main__":
    raise SystemExit(main())
