"""Configura DATABASE_URL de la API con el rol restringido portal_api, sin mostrar la contraseña.

Uso (en su terminal, no en un chat):

    .\\.venv\\Scripts\\python.exe scripts\\configure_portal_api_url.py

- La contraseña se pide con entrada oculta (no aparece en pantalla ni en el historial).
- La URL se construye en memoria y se escribe en apps/api/.env de forma atómica.
- La conexión anterior (administrador) NO se conserva: se elimina de .env. Si necesita
  aprovisionar, introduzca la conexión de propietario solo para esa tarea, en la sesión.
- No imprime ninguna credencial. Al terminar, ejecute scripts\\check_db_role.py.
"""

from __future__ import annotations

import getpass
import os
import sys
from pathlib import Path
from urllib.parse import quote

PROJECT_REF = "fjfnuttziwhxbjhkdtmk"
POOLER_HOST = "aws-0-us-east-1.pooler.supabase.com"
POOLER_PORT = 5432
ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def main() -> int:
    if not ENV_FILE.exists():
        print("No existe apps/api/.env. Cree el archivo a partir de .env.example.", file=sys.stderr)
        return 2
    password = getpass.getpass("Contraseña del rol portal_api (no se muestra): ")
    if not password:
        print("No se introdujo ninguna contraseña. No se modificó nada.", file=sys.stderr)
        return 2

    new_url = (
        f"postgresql+psycopg://portal_api.{PROJECT_REF}:{quote(password, safe='')}"
        f"@{POOLER_HOST}:{POOLER_PORT}/postgres?sslmode=require"
    )
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
    # Se eliminan ambas claves: la conexión administrativa no debe quedar en .env.
    kept: list[str] = [
        line for line in lines if not line.startswith(("DATABASE_URL=", "OWNER_DATABASE_URL="))
    ]
    kept.append(f"DATABASE_URL={new_url}")

    temporary = ENV_FILE.parent / ".env.new"
    temporary.write_text("\n".join(kept) + "\n", encoding="utf-8")
    os.replace(temporary, ENV_FILE)
    print("DATABASE_URL configurada con portal_api. No se conservó ninguna conexión administrativa en .env.")
    print("Siguiente paso: .\\.venv\\Scripts\\python.exe scripts\\check_db_role.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
