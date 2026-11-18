"""Herramientas de solo lectura de Logix, siempre acotadas al tenant resuelto por FastAPI.

El modelo nunca construye SQL ni aporta ``tenant_id``. Los argumentos variables se reducen a
identificadores de operación ya validados y límites acotados por el servidor.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.db.models import OperationEvent, OperationRef
from app.repositories import portal as portal_repo
from app.services import staff as staff_svc

ToolName = Literal[
    "get_dashboard_summary",
    "list_operations",
    "get_operation_detail",
    "get_operation_events",
    "list_requests",
    "get_tenant_profile",
]

_ACTIVE = frozenset({"abierto", "en tránsito"})


@dataclass(frozen=True)
class ToolResult:
    name: ToolName
    data: dict[str, Any]
    sources: tuple[str, ...] = ()


def _status(op: OperationRef) -> str:
    return (op.last_known_status or "").strip().casefold()


def _operation_row(op: OperationRef) -> dict[str, Any]:
    return {
        "do_number": op.do_number,
        "status": op.last_known_status,
        "reference": op.reference,
        "origin": op.origin_name,
        "destination": op.destination_name,
        "eta": op.eta.isoformat() if op.eta else None,
        "etd": op.etd.isoformat() if op.etd else None,
        "transport_type": op.transport_type,
        "pending_client_response": op.pending_client_response,
        "last_synced_at": op.last_synced_at.isoformat() if op.last_synced_at else None,
    }


def get_dashboard_summary(session: Session, tenant_id: UUID) -> ToolResult:
    operations = portal_repo.list_operations(session, tenant_id, limit=500, offset=0)
    active = [op for op in operations if _status(op) in _ACTIVE]
    transit = [op for op in operations if _status(op) == "en tránsito"]
    opened = [op for op in operations if _status(op) == "abierto"]
    by_status: dict[str, int] = {}
    for op in operations:
        label = (op.last_known_status or "").strip() or "sin estado registrado"
        by_status[label] = by_status.get(label, 0) + 1
    pending = sum(1 for op in operations if op.pending_client_response is True)
    pending_unknown = sum(1 for op in operations if op.pending_client_response is None)
    return ToolResult(
        name="get_dashboard_summary",
        data={
            "total": len(operations),
            "active": len(active),
            "in_transit": len(transit),
            "open": len(opened),
            "by_status": by_status,
            "in_transit_numbers": [op.do_number for op in transit],
            "open_numbers": [op.do_number for op in opened],
            "pending_client_response": pending,
            "pending_client_response_unknown": pending_unknown,
        },
        sources=tuple(op.do_number for op in operations[:10]),
    )


def list_operations(
    session: Session, tenant_id: UUID, *, status: str | None = None, limit: int = 20
) -> ToolResult:
    safe_limit = max(1, min(limit, 50))
    stmt = select(OperationRef).where(OperationRef.tenant_id == tenant_id)
    if status is not None:
        stmt = stmt.where(func.lower(OperationRef.last_known_status) == status.casefold())
    stmt = stmt.order_by(OperationRef.do_number, OperationRef.id).limit(safe_limit)
    operations = list(session.scalars(stmt))
    return ToolResult(
        name="list_operations",
        data={
            "items": [_operation_row(op) for op in operations],
            "returned": len(operations),
            "filter_status": status,
        },
        sources=tuple(op.do_number for op in operations),
    )


def _operation_by_do(session: Session, tenant_id: UUID, do_number: str) -> OperationRef | None:
    normalized = do_number.strip().upper()
    stmt = select(OperationRef).where(
        OperationRef.tenant_id == tenant_id,
        OperationRef.do_number == normalized,
    )
    return session.scalars(stmt).one_or_none()


def get_operation_detail(session: Session, tenant_id: UUID, *, do_number: str) -> ToolResult:
    operation = _operation_by_do(session, tenant_id, do_number)
    return ToolResult(
        name="get_operation_detail",
        data={"item": _operation_row(operation) if operation else None, "requested_do": do_number.upper()},
        sources=(operation.do_number,) if operation else (),
    )


def get_operation_events(
    session: Session, tenant_id: UUID, *, do_number: str, limit: int = 5
) -> ToolResult:
    operation = _operation_by_do(session, tenant_id, do_number)
    if operation is None:
        return ToolResult(
            name="get_operation_events",
            data={"items": [], "requested_do": do_number.upper(), "operation_found": False},
        )
    safe_limit = max(1, min(limit, 20))
    stmt = (
        select(OperationEvent)
        .where(
            OperationEvent.tenant_id == tenant_id,
            OperationEvent.operation_id == operation.id,
            OperationEvent.visibility == "client",
        )
        .order_by(OperationEvent.occurred_at.desc(), OperationEvent.id.desc())
        .limit(safe_limit)
    )
    events = list(session.scalars(stmt))
    items = [
        {
            "title": event.title,
            "description": event.description,
            "occurred_at": event.occurred_at.isoformat(),
            "to_status": event.to_status,
        }
        for event in events
    ]
    return ToolResult(
        name="get_operation_events",
        data={"items": items, "requested_do": operation.do_number, "operation_found": True},
        sources=(operation.do_number,),
    )


def list_requests(session: Session, tenant_id: UUID, *, limit: int = 10) -> ToolResult:
    safe_limit = max(1, min(limit, 20))
    rows = staff_svc.list_requests(session, tenant_id)[:safe_limit]
    items = [
        {
            "number": row["number"],
            "status": row["status"],
            "subject": row["subject"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
    return ToolResult(
        name="list_requests",
        data={"items": items, "returned": len(items)},
        sources=tuple(item["number"] for item in items),
    )


def _unavailable(name: str) -> ToolResult:
    return ToolResult(
        name=name,
        data={"availability": "unavailable", "items": [], "returned": None},
    )


def list_documents(session: Session, tenant_id: UUID) -> ToolResult:
    """Metadatos visibles para el personal. No incluye el archivo ni la ruta de Storage."""
    del tenant_id
    try:
        with session.begin_nested():
            rows = (
                session.execute(
                    text(
                        """
                        SELECT file_name, size_bytes, version
                        FROM client_documents
                        WHERE status = 'available'
                        ORDER BY file_name
                        LIMIT 20
                        """
                    )
                )
                .mappings()
                .all()
            )
    except ProgrammingError:
        return _unavailable("list_documents")
    items = [
        {"file_name": row["file_name"], "size_bytes": row["size_bytes"], "version": row["version"]}
        for row in rows
    ]
    return ToolResult(
        name="list_documents",
        data={"availability": "queried", "items": items, "returned": len(items)},
        sources=tuple(item["file_name"] for item in items),
    )


def list_quotes(session: Session, tenant_id: UUID) -> ToolResult:
    """Números, estado, vigencia y total decimal. Sin archivos y sin enviar el cuerpo a un modelo."""
    del tenant_id
    try:
        with session.begin_nested():
            rows = (
                session.execute(
                    text(
                        """
                        SELECT q.number, q.status, q.valid_until::text AS valid_until, q.currency,
                               COALESCE(SUM(l.quantity * l.unit_amount), 0)::text AS total
                        FROM quotes q
                        LEFT JOIN quote_lines l ON l.quote_id = q.id AND l.tenant_id = q.tenant_id
                        GROUP BY q.id
                        ORDER BY q.issued_on DESC, q.number
                        LIMIT 20
                        """
                    )
                )
                .mappings()
                .all()
            )
    except ProgrammingError:
        return _unavailable("list_quotes")
    items = [
        {
            "number": row["number"],
            "status": row["status"],
            "valid_until": row["valid_until"],
            "currency": row["currency"],
            "total": row["total"],
        }
        for row in rows
    ]
    return ToolResult(
        name="list_quotes",
        data={"availability": "queried", "items": items, "returned": len(items)},
        sources=tuple(item["number"] for item in items),
    )


def get_tenant_profile(session: Session, tenant_id: UUID) -> ToolResult:
    profile = staff_svc.tenant_profile(session, tenant_id)
    if profile is None:
        return ToolResult(name="get_tenant_profile", data={"item": None})
    allowed = {
        key: profile.get(key)
        for key in ("legal_name", "tax_id", "country", "city", "segment", "account_manager", "status")
    }
    return ToolResult(
        name="get_tenant_profile",
        data={"item": allowed},
        sources=("Perfil de empresa",),
    )
