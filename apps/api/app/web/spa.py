"""Servicio del frontend React compilado desde el mismo origen que la API.

Responsabilidad: servir `index.html`, los archivos estáticos de `dist/` y el fallback de navegación SPA
(`/login`, `/operaciones/{id}`...). Solo se activa si `WEB_DIST_DIR` apunta a una compilación válida.

Reglas:

- El fallback devuelve `index.html` solo para navegación del frontend. Nunca para rutas `/api/...`
  ni para `/health`: esas responden con el sobre de error JSON de la API (404).
- Solo se sirven archivos que estén dentro de `dist/`, después de resolver la ruta. Un intento de
  salir del directorio (`..`, rutas absolutas, codificaciones) cae en `index.html` sin revelar nada.
- Los archivos ocultos (nombre que empieza por `.`) no se sirven: `dist/` no debe contener secretos,
  pero la regla evita exponer accidentalmente cualquier fichero de configuración.
- `index.html` no se cachea; los assets con hash sí (los genera Vite con nombres únicos).

Esta función debe registrarse DESPUÉS de las rutas de la API: Starlette resuelve las rutas en orden.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Rutas de API o de sistema que jamás reciben index.html. Se comparan por segmento completo:
# "documentos" es una ruta del portal, no la documentación de la API.
_RESERVED = ("api", "docs", "openapi.json", "health")


def _is_reserved(path: str) -> bool:
    return any(path == name or path.startswith(name + "/") for name in _RESERVED)


def is_spa_build(dist_dir: Path) -> bool:
    return (dist_dir / "index.html").is_file()


def _inside(base: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(base)
    except ValueError:
        return False
    return True


def register_spa(app: FastAPI, dist_dir: Path) -> None:
    """Monta los estáticos y el fallback de navegación. Requiere `dist_dir/index.html`."""
    base = dist_dir.resolve()
    index = base / "index.html"
    assets = base / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        if _is_reserved(full_path):
            # Rutas de API o de sistema inexistentes: 404 con el sobre JSON de la API, nunca HTML.
            raise HTTPException(status_code=404)

        if full_path and not any(part.startswith(".") for part in full_path.split("/")):
            candidate = (base / full_path).resolve()
            if _inside(base, candidate) and candidate.is_file():
                return FileResponse(candidate)

        response = FileResponse(index, media_type="text/html")
        response.headers["Cache-Control"] = "no-cache"
        return response
