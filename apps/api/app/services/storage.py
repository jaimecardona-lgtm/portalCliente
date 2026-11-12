"""Adaptador de Supabase Storage para documentos de operación (bucket privado).

Responsabilidad: subir, firmar y borrar objetos con la API REST oficial de Storage. Es el único punto del
código que usa la clave privilegiada, y solo desde FastAPI.

Reglas:
- Las rutas las genera la aplicación (`app.services.documents`). Este módulo no decide nombres de archivo.
- La subida nunca sobrescribe (`x-upsert: false`): un objeto existente produce error.
- Los enlaces firmados son temporales y no se guardan en la base de datos.
- Los errores no incluyen la respuesta del proveedor ni la clave: solo operación y código HTTP.

Formas de la API (verificadas en el cliente oficial @supabase/storage-js 2.118.0):
- Subida:   POST   {url}/storage/v1/object/{bucket}/{path}           (x-upsert: false)
- Firma:    POST   {url}/storage/v1/object/sign/{bucket}/{path}      body {expiresIn}  -> {signedURL}
- Borrado:  DELETE {url}/storage/v1/object/{bucket}                  body {prefixes: [path, ...]}
"""

from __future__ import annotations

from typing import Protocol
from urllib.parse import quote

import httpx

from app.core.config import Settings

BUCKET = "logixtic-client-documents"


class StorageError(Exception):
    """Fallo de Storage. El mensaje no revela la respuesta del proveedor."""

    def __init__(self, operation: str, status: int | None = None) -> None:
        self.operation = operation
        self.status = status
        super().__init__(f"Storage: fallo en {operation} (HTTP {status or 'sin respuesta'}).")


class ObjectStorage(Protocol):
    def upload(self, path: str, data: bytes, content_type: str) -> None: ...

    def sign_download(self, path: str, expires_in: int) -> str: ...

    def delete(self, paths: list[str]) -> None: ...


class SupabaseObjectStorage:
    def __init__(
        self,
        base_url: str,
        secret_key: str,
        *,
        bucket: str = BUCKET,
        client: httpx.Client | None = None,
        timeout: float = 20.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._bucket = bucket
        self._headers = {"apikey": secret_key, "Authorization": f"Bearer {secret_key}"}
        self._client = client or httpx.Client(timeout=timeout)

    def _url(self, suffix: str) -> str:
        return f"{self._base}/storage/v1{suffix}"

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        url = self._url(f"/object/{self._bucket}/{quote(path, safe='/')}")
        headers = {**self._headers, "x-upsert": "false", "Content-Type": content_type}
        try:
            response = self._client.post(url, content=data, headers=headers)
        except httpx.HTTPError as exc:
            raise StorageError("subida") from exc
        if response.status_code not in (200, 201):
            raise StorageError("subida", response.status_code)

    def sign_download(self, path: str, expires_in: int) -> str:
        url = self._url(f"/object/sign/{self._bucket}/{quote(path, safe='/')}")
        try:
            response = self._client.post(url, json={"expiresIn": expires_in}, headers=self._headers)
        except httpx.HTTPError as exc:
            raise StorageError("firma") from exc
        if response.status_code != 200:
            raise StorageError("firma", response.status_code)
        signed = response.json().get("signedURL")
        if not isinstance(signed, str) or not signed.startswith("/object/sign/"):
            raise StorageError("firma", response.status_code)
        return f"{self._base}/storage/v1{signed}"

    def delete(self, paths: list[str]) -> None:
        if not paths:
            return
        url = self._url(f"/object/{self._bucket}")
        try:
            response = self._client.request("DELETE", url, json={"prefixes": paths}, headers=self._headers)
        except httpx.HTTPError as exc:
            raise StorageError("borrado") from exc
        if response.status_code != 200:
            raise StorageError("borrado", response.status_code)


def build_storage(settings: Settings) -> ObjectStorage | None:
    """Adaptador configurado, o None si falta la URL o la clave.

    Sin configuración, las rutas de documentos responden 503.
    """
    if not settings.supabase_url or settings.supabase_secret_key is None:
        return None
    key = settings.supabase_secret_key.get_secret_value().strip()
    if not key:
        return None
    return SupabaseObjectStorage(settings.supabase_url, key)
