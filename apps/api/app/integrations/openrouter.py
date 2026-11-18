"""Cliente mínimo de OpenRouter para conocimiento general aprobado de Logixtic.

Reglas:
- La clave se lee de la configuración del backend y nunca se registra ni se devuelve al navegador.
- El conocimiento general solo recibe la pregunta y las reglas del sistema.
  Nunca recibe historial de conversación, datos de empresa, operaciones, documentos ni identificadores.
- `chat_with_tools` prepara el ciclo de herramientas. No se usa con resultados de empresa mientras
  `logix_operational_payload_authorized` sea falso: la otra bandera no autoriza ese envío.
- Los errores se traducen a una excepción sin detalles del proveedor.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx


class ProviderError(Exception):
    """Fallo del proveedor (red, tiempo, estado HTTP o respuesta inválida). Sin secretos."""


class OperationalExportBlocked(Exception):
    """El resultado de una empresa no puede salir del servidor con la política vigente."""


_ALLOWED_TOOLS = frozenset(
    {
        "get_dashboard_summary",
        "list_operations",
        "get_operation_detail",
        "get_operation_events",
        "list_requests",
        "get_tenant_profile",
        "list_documents",
        "list_quotes",
    }
)
_FORBIDDEN_ARGUMENTS = frozenset({"tenant_id", "tenant", "sql", "query"})


def operational_export_allowed(authorized: bool) -> None:
    """La bandera de conocimiento general no abre este paso. Hace falta la autorización operativa."""
    if not authorized:
        raise OperationalExportBlocked(
            "Los resultados de empresa permanecen en el servidor hasta una autorización expresa."
        )


def tool_schemas() -> list[dict[str, Any]]:
    """Esquemas que el modelo podría solicitar. Ninguno acepta tenant ni SQL."""
    def tool(name: str, description: str, properties: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": properties or {},
                },
            },
        }

    do_number = {"type": "string", "minLength": 4, "maxLength": 40}
    return [
        tool("get_dashboard_summary", "Conteos y distribución de estados de la empresa ya seleccionada."),
        tool(
            "list_operations",
            "Lista operaciones de la empresa ya seleccionada.",
            {"status": {"type": "string", "maxLength": 40}},
        ),
        tool("get_operation_detail", "Detalle de una operación por su número DO.", {"do_number": do_number}),
        tool("get_operation_events", "Eventos visibles de una operación.", {"do_number": do_number}),
        tool("list_requests", "Solicitudes registradas de la empresa ya seleccionada."),
        tool("get_tenant_profile", "Datos generales de la empresa ya seleccionada."),
        tool("list_documents", "Metadatos de documentos de la empresa ya seleccionada. Sin archivos."),
        tool("list_quotes", "Cotizaciones y montos de la empresa ya seleccionada."),
    ]


def validate_tool_call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Acepta solo herramientas conocidas y argumentos acotados. Rechaza tenant y SQL."""
    if name not in _ALLOWED_TOOLS:
        raise ProviderError("invalid_response")
    if not isinstance(arguments, dict):
        raise ProviderError("invalid_response")
    cleaned: dict[str, Any] = {}
    for key, value in arguments.items():
        if key.casefold() in _FORBIDDEN_ARGUMENTS:
            raise ProviderError("invalid_response")
        if not isinstance(value, str) or len(value) > 80:
            raise ProviderError("invalid_response")
        cleaned[key] = value.strip()
    return cleaned


def chat_completion(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    max_output_tokens: int,
    timeout_seconds: float,
    transport: httpx.BaseTransport | None = None,
) -> str:
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_output_tokens,
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=timeout_seconds, transport=transport) as client:
            response = client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise ProviderError("timeout") from exc
    except httpx.HTTPError as exc:
        raise ProviderError("network") from exc
    if response.status_code != 200:
        raise ProviderError(f"status_{response.status_code}")
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ProviderError("invalid_response") from exc
    if not isinstance(content, str) or not content.strip():
        raise ProviderError("empty_response")
    return content.strip()


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict[str, str]


@dataclass(frozen=True)
class ToolRound:
    content: str | None
    calls: tuple[ToolCall, ...]


def _post_chat(
    *,
    base_url: str,
    api_key: str,
    payload: dict[str, Any],
    timeout_seconds: float,
    transport: httpx.BaseTransport | None,
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=timeout_seconds, transport=transport) as client:
            response = client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise ProviderError("timeout") from exc
    except httpx.HTTPError as exc:
        raise ProviderError("network") from exc
    if response.status_code != 200:
        raise ProviderError(f"status_{response.status_code}")
    try:
        body = response.json()
        return body["choices"][0]["message"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ProviderError("invalid_response") from exc


def chat_with_tools(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    max_output_tokens: int,
    timeout_seconds: float,
    operational_authorized: bool,
    transport: httpx.BaseTransport | None = None,
) -> ToolRound:
    """Pide al modelo una respuesta o herramientas. Un mensaje `tool` ya es un resultado de empresa."""
    if any(message.get("role") == "tool" for message in messages):
        operational_export_allowed(operational_authorized)
    message = _post_chat(
        base_url=base_url,
        api_key=api_key,
        payload={
            "model": model,
            "messages": messages,
            "max_tokens": max_output_tokens,
            "temperature": 0.2,
            "tools": tool_schemas(),
            "tool_choice": "auto",
        },
        timeout_seconds=timeout_seconds,
        transport=transport,
    )
    raw_calls = message.get("tool_calls") or []
    if not isinstance(raw_calls, list) or len(raw_calls) > 4:
        raise ProviderError("invalid_response")
    calls: list[ToolCall] = []
    for raw in raw_calls:
        try:
            name = raw["function"]["name"]
            arguments = raw["function"].get("arguments") or "{}"
            if isinstance(arguments, str):
                arguments = json.loads(arguments)
            calls.append(ToolCall(name, validate_tool_call(name, arguments)))
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderError("invalid_response") from exc
    content = message.get("content")
    text = content.strip() if isinstance(content, str) and content.strip() else None
    if text is None and not calls:
        raise ProviderError("empty_response")
    return ToolRound(text, tuple(calls))
