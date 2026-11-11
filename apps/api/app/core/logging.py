"""Logging estructurado en JSON, con redacción de secretos.

Responsabilidad: emitir una línea JSON por evento (nivel, mensaje, id de petición y campos extra
permitidos) sin valores sensibles.

Reglas de seguridad:

- Las claves cuyo nombre contiene `password`, `token`, `secret`, `authorization`, `cookie`, `key`
  o `body` se sustituyen por "[redacted]", en cualquier nivel de anidamiento.
- Nunca se registra el cuerpo de una petición ni de una respuesta.
- El formateador no lee variables de entorno ni imprime la configuración.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from app.core.request_context import get_request_id

_SENSITIVE_MARKERS = ("password", "token", "secret", "authorization", "cookie", "key", "body")
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}


def redact(value: Any) -> Any:
    """Redacta recursivamente claves sensibles. No modifica el objeto original."""
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if any(marker in lowered for marker in _SENSITIVE_MARKERS):
                out[str(key)] = "[redacted]"
            else:
                out[str(key)] = redact(item)
        return out
    if isinstance(value, list | tuple):
        return [redact(item) for item in value]
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": get_request_id(),
        }
        extra = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _RESERVED and not key.startswith("_")
        }
        if extra:
            payload.update(redact(extra))
        if record.exc_info and record.exc_info[0] is not None:
            # Solo el tipo de excepción; el mensaje puede contener datos de entrada.
            payload["exception_type"] = record.exc_info[0].__name__
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Configura el logger raíz una sola vez. Llamadas repetidas reemplazan el manejador."""
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(level.upper())
    # Los registros de acceso de uvicorn repiten rutas con datos; se silencian a nivel WARNING.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
