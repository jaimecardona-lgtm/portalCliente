"""Rutas de documentos de operación. Todas exigen sesión y empresa resuelta en el servidor.

Subida y reemplazo: cuerpo binario crudo con `Content-Type` = tipo MIME y cabecera `X-File-Name`
(nombre codificado con percent-encoding, p. ej. encodeURIComponent en el navegador).
No se acepta multipart: evita una dependencia adicional y el nombre se valida en un solo punto.
El navegador nunca elige bucket ni ruta: la ruta la genera FastAPI con UUID.
"""

from __future__ import annotations

from typing import Annotated, Any
from urllib.parse import unquote
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.api.deps import get_context, get_db
from app.api.v1 import AUTH_RESPONSES
from app.core.config import Settings
from app.core.errors import AppError
from app.services import documents as svc
from app.services.access import RequestContext
from app.services.storage import ObjectStorage

router = APIRouter(prefix="/api/v1")

# Errores documentados de las rutas de documentos. Parten de los de autenticación de la API.
_NOT_FOUND = {404: {"description": "Operación o documento no visibles para esta persona."}}
_WRITE = {
    413: {"description": "El archivo supera 5 MB."},
    415: {"description": "Tipo, extensión o contenido no admitidos."},
    422: {"description": "Archivo vacío o nombre no válido."},
    502: {"description": "Storage no disponible; no se modificó nada."},
    503: {"description": "Storage no configurado o fallo de persistencia (se intentó limpiar el objeto)."},
}
DOC_READ = {**AUTH_RESPONSES, **_NOT_FOUND}
DOC_WRITE = {**AUTH_RESPONSES, **_NOT_FOUND, **_WRITE}

ContextDep = Annotated[RequestContext, Depends(get_context)]
DbDep = Annotated[Session, Depends(get_db)]


def _deps(request: Request, session: Session, ctx: RequestContext) -> svc.DocumentDeps:
    storage: ObjectStorage | None = request.app.state.storage
    if storage is None:
        raise AppError(
            "El almacenamiento de documentos no está configurado en este entorno.",
            code="storage_not_configured",
            status_code=503,
        )
    settings: Settings = request.app.state.settings
    return svc.DocumentDeps(
        session=session,
        ctx=ctx,
        storage=storage,
        settings=settings,
        session_factory=request.app.state.session_factory,
    )


async def _read_body(request: Request) -> bytes:
    """Lee el cuerpo sin superar el límite. Rechaza antes de leer si Content-Length ya es demasiado grande."""
    limit = svc.MAX_BYTES
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        raise AppError("El archivo supera el tamaño máximo de 5 MB.", code="file_too_large", status_code=413)
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise AppError(
                "El archivo supera el tamaño máximo de 5 MB.", code="file_too_large", status_code=413
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/operations/{operation_id}/documents", tags=["documentos"], responses=DOC_READ)
def list_operation_documents(
    operation_id: UUID, request: Request, ctx: ContextDep, session: DbDep
) -> dict[str, Any]:
    items = svc.list_documents(_deps(request, session, ctx), operation_id)
    return {"items": items}


@router.post(
    "/operations/{operation_id}/documents", status_code=201, tags=["documentos"], responses=DOC_WRITE
)
async def upload_operation_document(
    operation_id: UUID,
    request: Request,
    ctx: ContextDep,
    session: DbDep,
    content_type: Annotated[str | None, Header()] = None,
    x_file_name: Annotated[str | None, Header(alias="X-File-Name")] = None,
) -> dict[str, Any]:
    if not x_file_name:
        raise AppError("Falta la cabecera X-File-Name.", code="invalid_file_name", status_code=422)
    x_file_name = unquote(
        x_file_name
    )  # el navegador envía encodeURIComponent(nombre): cabeceras solo Latin-1
    mime = (content_type or "").split(";")[0].strip().lower()
    data = await _read_body(request)
    return svc.upload_document(_deps(request, session, ctx), operation_id, data, mime, x_file_name)


@router.get("/documents/{document_id}/link", tags=["documentos"], responses=DOC_READ)
def document_download_link(
    document_id: UUID, request: Request, ctx: ContextDep, session: DbDep
) -> dict[str, Any]:
    return svc.signed_download_link(_deps(request, session, ctx), document_id)


@router.put("/documents/{document_id}/file", tags=["documentos"], responses=DOC_WRITE)
async def replace_document_file(
    document_id: UUID,
    request: Request,
    ctx: ContextDep,
    session: DbDep,
    content_type: Annotated[str | None, Header()] = None,
    x_file_name: Annotated[str | None, Header(alias="X-File-Name")] = None,
) -> dict[str, Any]:
    if not x_file_name:
        raise AppError("Falta la cabecera X-File-Name.", code="invalid_file_name", status_code=422)
    x_file_name = unquote(
        x_file_name
    )  # el navegador envía encodeURIComponent(nombre): cabeceras solo Latin-1
    mime = (content_type or "").split(";")[0].strip().lower()
    data = await _read_body(request)
    return svc.replace_document(_deps(request, session, ctx), document_id, data, mime, x_file_name)


@router.delete("/documents/{document_id}", tags=["documentos"], responses=DOC_WRITE)
def remove_document(document_id: UUID, request: Request, ctx: ContextDep, session: DbDep) -> dict[str, Any]:
    return svc.remove_document(_deps(request, session, ctx), document_id)


# ---------------------------------------------------------------------------
# Documentos generales del cliente final (sin operación asociada)
# ---------------------------------------------------------------------------


@router.get("/client-access", tags=["documentos"], responses=DOC_READ)
def client_access(request: Request, ctx: ContextDep, session: DbDep) -> dict[str, Any]:
    """Clientes finales de la empresa activa a los que la persona pertenece, con su rol."""
    return {"items": svc.list_client_access(_deps(request, session, ctx))}


@router.get("/client-accounts/{client_account_id}/documents", tags=["documentos"], responses=DOC_READ)
def list_client_documents(
    client_account_id: UUID, request: Request, ctx: ContextDep, session: DbDep
) -> dict[str, Any]:
    return {"items": svc.list_client_documents(_deps(request, session, ctx), client_account_id)}


@router.post(
    "/client-accounts/{client_account_id}/documents",
    status_code=201,
    tags=["documentos"],
    responses=DOC_WRITE,
)
async def upload_client_document(
    client_account_id: UUID,
    request: Request,
    ctx: ContextDep,
    session: DbDep,
    content_type: Annotated[str | None, Header()] = None,
    x_file_name: Annotated[str | None, Header(alias="X-File-Name")] = None,
) -> dict[str, Any]:
    if not x_file_name:
        raise AppError("Falta la cabecera X-File-Name.", code="invalid_file_name", status_code=422)
    x_file_name = unquote(
        x_file_name
    )  # el navegador envía encodeURIComponent(nombre): cabeceras solo Latin-1
    mime = (content_type or "").split(";")[0].strip().lower()
    data = await _read_body(request)
    return svc.upload_client_document(
        _deps(request, session, ctx), client_account_id, data, mime, x_file_name
    )
