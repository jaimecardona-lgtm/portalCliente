"""Errores de la API con un formato único y sin detalles internos.

Contrato de salida de cualquier error:

    {"error": {"code": "<código estable>", "message": "<mensaje en español>", "request_id": "<id>"}}

Reglas:

- Los errores de validación no devuelven el valor enviado por el cliente (podría contener datos personales).
- Un recurso de otra empresa responde 404, igual que uno inexistente: no se revela que existe.
- Las excepciones no controladas se registran sin cuerpo de petición ni cabeceras y responden 500 genérico.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_context import get_request_id

logger = logging.getLogger("app.errors")


class AppError(Exception):
    """Error de dominio con código HTTP y código estable para el cliente."""

    status_code: int = 400
    code: str = "bad_request"
    message: str = "La solicitud no es válida."

    def __init__(
        self, message: str | None = None, *, code: str | None = None, status_code: int | None = None
    ) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class AuthenticationRequired(AppError):
    status_code = 401
    code = "authentication_required"
    message = "Debe iniciar sesión para continuar."


class InvalidToken(AppError):
    status_code = 401
    code = "invalid_token"
    message = "La sesión no es válida o ha caducado."


class AccessDenied(AppError):
    status_code = 403
    code = "access_denied"
    message = "No tiene permiso para realizar esta acción."


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    message = "El recurso solicitado no existe."


class Conflict(AppError):
    status_code = 409
    code = "conflict"
    message = "La solicitud entra en conflicto con el estado actual."


class ValidationFailed(AppError):
    status_code = 422
    code = "validation_error"
    message = "Revise los datos enviados."


class AuthNotConfigured(AppError):
    status_code = 503
    code = "auth_not_configured"
    message = "La autenticación no está configurada en este entorno."


def _envelope(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "request_id": get_request_id()}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_envelope(exc.code, exc.message))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Solo ubicación y tipo de error; nunca el valor recibido.
        fields = [
            {
                "location": ".".join(str(part) for part in err.get("loc", ())),
                "type": err.get("type", "invalid"),
            }
            for err in exc.errors()
        ]
        content = _envelope("validation_error", "Revise los datos enviados.")
        content["error"]["fields"] = fields
        return JSONResponse(status_code=422, content=content)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(status_code=exc.status_code, content=_envelope(code, "No disponible."))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        # Se registra el tipo de excepción, no su mensaje completo (podría incluir datos).
        logger.error("unhandled_exception", extra={"exception_type": type(exc).__name__})
        return JSONResponse(status_code=500, content=_envelope("internal_error", "Ocurrió un error interno."))
