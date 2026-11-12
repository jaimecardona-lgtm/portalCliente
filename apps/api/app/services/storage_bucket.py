"""Aprovisionamiento idempotente del bucket privado de documentos, mediante la API oficial de Storage.

Formas verificadas en @supabase/storage-js 2.118.0:
- Consulta: GET  {url}/storage/v1/bucket/{id}
- Creación: POST {url}/storage/v1/bucket  body {id, name, public, file_size_limit, allowed_mime_types}

Reglas:
- Por defecto no escribe: solo compara con la configuración esperada y devuelve el plan.
- Si el bucket existe con configuración distinta, NO se modifica: se informa la diferencia.
- Nunca crea políticas ni inserta filas en storage.objects o storage.buckets con SQL.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx

from app.services.documents import ALLOWED_TYPES, MAX_BYTES
from app.services.storage import BUCKET


@dataclass
class BucketResult:
    action: str  # 'exists_ok', 'exists_mismatch', 'would_create', 'created', 'error'
    differences: list[str] = field(default_factory=list)
    status: int | None = None


def expected_bucket() -> dict[str, object]:
    return {
        "id": BUCKET,
        "public": False,
        "file_size_limit": MAX_BYTES,
        "allowed_mime_types": sorted(ALLOWED_TYPES),
    }


def _differences(current: dict[str, object]) -> list[str]:
    expected = expected_bucket()
    diffs: list[str] = []
    if current.get("public") is not False:
        diffs.append("el bucket es público (debe ser privado)")
    if current.get("file_size_limit") != expected["file_size_limit"]:
        diffs.append(
            f"file_size_limit = {current.get('file_size_limit')} (esperado {expected['file_size_limit']})"
        )
    allowed = current.get("allowed_mime_types")
    if not isinstance(allowed, list) or sorted(allowed) != expected["allowed_mime_types"]:
        diffs.append("allowed_mime_types difiere de los tipos admitidos por la aplicación")
    return diffs


def ensure_bucket(client: httpx.Client, base_url: str, secret_key: str, *, apply: bool) -> BucketResult:
    base = base_url.rstrip("/") + "/storage/v1"
    headers = {"apikey": secret_key, "Authorization": f"Bearer {secret_key}"}
    try:
        got = client.get(f"{base}/bucket/{BUCKET}", headers=headers)
    except httpx.HTTPError:
        return BucketResult(action="error")

    if got.status_code == 200:
        diffs = _differences(got.json())
        return BucketResult(action="exists_mismatch" if diffs else "exists_ok", differences=diffs, status=200)
    if got.status_code not in (400, 404):
        return BucketResult(action="error", status=got.status_code)

    if not apply:
        return BucketResult(action="would_create", status=got.status_code)
    try:
        created = client.post(f"{base}/bucket", json=expected_bucket(), headers=headers)
    except httpx.HTTPError:
        return BucketResult(action="error")
    if created.status_code in (200, 201):
        return BucketResult(action="created", status=created.status_code)
    return BucketResult(action="error", status=created.status_code)
