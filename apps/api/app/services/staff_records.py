"""Lectura administrativa de documentos y cotizaciones de la empresa ya fijada en la transacción.

La política RLS hace el aislamiento. Estas consultas no aceptan otro tenant y no guardan enlaces.
Los montos salen de numeric y se serializan como texto decimal.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError, NotFound
from app.services.storage import ObjectStorage, StorageError

_QUOTE_STATUS = {
    "pendiente": "Pendiente",
    "aceptada": "Aceptada",
    "rechazada": "Rechazada",
    "vencida": "Vencida",
}


def _decimal(value: Any) -> str:
    rendered = format(Decimal(value), "f")
    if "." not in rendered:
        return f"{rendered}.00" if rendered.isdigit() or rendered.startswith("-") else rendered
    whole, fraction = rendered.split(".", 1)
    if len(fraction) == 1:
        fraction = f"{fraction}0"
    return f"{whole}.{fraction}"


def list_documents(session: Session) -> list[dict[str, Any]]:
    rows = (
        session.execute(
            text(
                """
                SELECT id, client_account_id, file_name, mime_type, size_bytes, sha256, version, updated_at
                FROM client_documents
                WHERE status = 'available'
                ORDER BY file_name, id
                """
            )
        )
        .mappings()
        .all()
    )
    return [
        {
            "id": str(row["id"]),
            "client_account_id": str(row["client_account_id"]),
            "file_name": row["file_name"],
            "mime_type": row["mime_type"],
            "size_bytes": row["size_bytes"],
            "sha256": row["sha256"],
            "version": row["version"],
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        for row in rows
    ]


def signed_download(
    session: Session, document_id: UUID, storage: ObjectStorage, settings: Settings
) -> dict[str, Any]:
    row = (
        session.execute(
            text(
                """
                SELECT storage_path, file_name, sha256, size_bytes
                FROM client_documents
                WHERE id = :id AND status = 'available' AND storage_path IS NOT NULL
                """
            ),
            {"id": document_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        raise NotFound("El documento no existe.", code="document_not_found")
    try:
        url = storage.sign_download(row["storage_path"], settings.storage_signed_url_seconds)
    except StorageError as exc:
        raise AppError(
            "El almacenamiento no está disponible. Inténtelo de nuevo.",
            code="storage_unavailable",
            status_code=502,
        ) from exc
    return {
        "url": url,
        "expires_in_seconds": settings.storage_signed_url_seconds,
        "sha256": row["sha256"],
        "size_bytes": row["size_bytes"],
        "file_name": row["file_name"],
    }


def list_quotes(session: Session) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            """
            SELECT id, tenant_id, number, source, external_id, issued_on, valid_until, version, service,
                   origin_place, destination_place, currency, status, conditions, observations
            FROM quotes
            ORDER BY issued_on DESC, number
            """
        )
    ).mappings().all()
    return [_quote_out(session, row) for row in rows]


def get_quote(session: Session, quote_id: UUID) -> dict[str, Any]:
    row = (
        session.execute(
            text(
                """
                SELECT id, tenant_id, number, source, external_id, issued_on, valid_until, version, service,
                       origin_place, destination_place, currency, status, conditions, observations
                FROM quotes
                WHERE id = :id
                """
            ),
            {"id": quote_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        raise NotFound("La cotización no existe.", code="quote_not_found")
    return _quote_out(session, row)


def _quote_out(session: Session, row: Any) -> dict[str, Any]:
    lines = (
        session.execute(
            text(
                """
                SELECT id, concept, quantity, unit, unit_amount
                FROM quote_lines
                WHERE quote_id = :id
                ORDER BY position, id
                """
            ),
            {"id": row["id"]},
        )
        .mappings()
        .all()
    )
    status = _QUOTE_STATUS.get(row["status"], row["status"])
    return {
        "id": str(row["id"]),
        "tenant_id": str(row["tenant_id"]),
        "number": row["number"],
        "source": row["source"],
        "external_id": row["external_id"],
        "issued_at": row["issued_on"].isoformat(),
        "valid_until": row["valid_until"].isoformat(),
        "version": row["version"],
        "service": row["service"],
        "origin": row["origin_place"],
        "destination": row["destination_place"],
        "currency": row["currency"],
        "status": status,
        "conditions": row["conditions"],
        "observations": row["observations"],
        "lines": [
            {
                "id": str(line["id"]),
                "concept": line["concept"],
                "quantity": _decimal(line["quantity"]),
                "unit": line["unit"],
                "unit_amount": _decimal(line["unit_amount"]),
            }
            for line in lines
        ],
    }
