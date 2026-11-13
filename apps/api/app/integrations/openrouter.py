"""Cliente mínimo de OpenRouter para conocimiento general aprobado de Logixtic.

Reglas:
- La clave se lee de la configuración del backend y nunca se registra ni se devuelve al navegador.
- Solo recibe los mensajes que construye el servicio de Logix: pregunta general y reglas del sistema.
  Nunca recibe historial de conversación, datos de empresa, operaciones, documentos ni identificadores.
- Los errores se traducen a una excepción sin detalles del proveedor.
"""

from __future__ import annotations

from typing import Any

import httpx


class ProviderError(Exception):
    """Fallo del proveedor (red, tiempo, estado HTTP o respuesta inválida). Sin secretos."""


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
