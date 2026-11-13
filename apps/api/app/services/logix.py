"""Logix: asistente del Portal Cliente. Separa conocimiento general de consultas privadas.

Reglas (no negociables):
- Las preguntas privadas (operaciones, DO, ETA, documentos, cotizaciones, solicitudes) se responden
  SOLO con consultas deterministas a PostgreSQL, bajo el tenant autorizado. Nunca van a OpenRouter.
- Las preguntas generales van a OpenRouter solo si la configuración lo habilita y lo autoriza.
  Solo viaja el texto de la pregunta y reglas del sistema: sin historial, datos de empresa ni identificadores.
- Cada respuesta declara su origen: `deterministic`, `model`, `unavailable` o `provider_failure`.
- Ausencia de datos y error del proveedor son respuestas distintas. Nunca se inventan resultados.
- Sin tenant autorizado no hay datos privados: la respuesta lo dice.
"""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

from app.core.config import Settings
from app.db.models import OperationRef
from app.integrations.openrouter import ProviderError, chat_completion

AnswerKind = Literal["deterministic", "model", "unavailable", "provider_failure"]

_PRIVATE_TERMS = re.compile(
    r"(operaci|embarque|\bETA\b|\bETD\b|documento|cotizaci|solicitud|mi empresa|mis |estado|"
    r"cu[aá]ntas?|\bDO-|tenant|empresa)",
    re.IGNORECASE,
)
_DO_NUMBER = re.compile(r"\b(?:QA-)?DO-[A-Za-z0-9][A-Za-z0-9-]{1,35}\b", re.IGNORECASE)
_ACTIVE = frozenset({"abierto", "en tránsito"})
_IN_TRANSIT = "en tránsito"
_OPEN = "abierto"

GENERAL_SYSTEM_PROMPT = (
    "Eres Logix, asistente del Portal Cliente de Logixtic. Responde en español, de forma breve, sobre "
    "conceptos generales de logística y comercio exterior. No inventes datos de empresas, operaciones, "
    "documentos ni cifras de Logixtic. Si la pregunta requiere datos de una empresa concreta, di que "
    "debe consultarlos en el portal con una empresa seleccionada."
)

UNAVAILABLE_GENERAL = (
    "El asistente de conocimiento general no está activo en este entorno. Las consultas sobre operaciones "
    "sí están disponibles cuando hay una empresa autorizada seleccionada."
)
PROVIDER_FAILURE = (
    "No pude obtener respuesta del asistente en este momento. Inténtelo de nuevo en unos minutos."
)
NO_TENANT = "Seleccione una empresa autorizada para consultar sus operaciones."


@dataclass(frozen=True)
class LogixAnswer:
    text: str
    kind: AnswerKind
    sources: tuple[str, ...] = field(default_factory=tuple)


class RateLimiter:
    """Límite por usuario en ventana de una hora. En memoria: suficiente para una instancia de desarrollo."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[UUID, deque[float]] = defaultdict(deque)

    def allow(self, user_id: UUID, limit: int) -> bool:
        now = self._clock()
        hits = self._hits[user_id]
        while hits and now - hits[0] > 3600:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True


def is_private(question: str) -> bool:
    return bool(_PRIVATE_TERMS.search(question))


def answer_private(question: str, operations: list[OperationRef]) -> LogixAnswer:
    """Respuesta determinista sobre las operaciones ya filtradas por el tenant autorizado."""
    if not operations:
        return LogixAnswer(
            text=(
                "No hay operaciones sincronizadas para la empresa activa. La información de Logixtic "
                "todavía puede no estar disponible."
            ),
            kind="deterministic",
        )
    match = _DO_NUMBER.search(question)
    if match:
        do_number = match.group(0).upper()
        op = next((o for o in operations if o.do_number.upper() == do_number), None)
        if op is None:
            return LogixAnswer(
                text=f"No encontré la operación {do_number} en la empresa activa.",
                kind="deterministic",
            )
        synced = op.last_synced_at.date().isoformat() if op.last_synced_at else "sin registrar"
        return LogixAnswer(
            text=(
                f"{do_number}: estado {op.last_known_status or 'sin estado registrado'}. "
                f"Referencia: {op.reference or 'sin referencia'}. Última sincronización: {synced}."
            ),
            kind="deterministic",
            sources=(do_number,),
        )
    normalized = question.casefold()

    def status_of(operation: OperationRef) -> str:
        return (operation.last_known_status or "").strip().casefold()

    active = [o for o in operations if status_of(o) in _ACTIVE]
    in_transit = [o for o in operations if status_of(o) == _IN_TRANSIT]
    opened = [o for o in operations if status_of(o) == _OPEN]

    list_words = ("muestra", "muéstr", "lista", "cuáles")
    if "abiert" in normalized and any(word in normalized for word in list_words):
        if not opened:
            return LogixAnswer(
                text="No hay operaciones abiertas en la empresa activa.",
                kind="deterministic",
            )
        numbers = ", ".join(o.do_number for o in opened)
        return LogixAnswer(
            text=f"Operaciones abiertas ({len(opened)}): {numbers}.",
            kind="deterministic",
            sources=tuple(o.do_number for o in opened),
        )
    if "tránsito" in normalized or "movimiento" in normalized:
        return LogixAnswer(
            text=f"Operaciones en tránsito de la empresa activa: {len(in_transit)}.",
            kind="deterministic",
            sources=tuple(o.do_number for o in in_transit[:10]),
        )
    if "activ" in normalized:
        return LogixAnswer(
            text=f"Operaciones activas de la empresa activa: {len(active)}.",
            kind="deterministic",
            sources=tuple(o.do_number for o in active[:10]),
        )
    return LogixAnswer(
        text=(
            f"Operaciones registradas de la empresa activa: {len(operations)}. "
            f"Activas: {len(active)}. En tránsito: {len(in_transit)}."
        ),
        kind="deterministic",
        sources=tuple(o.do_number for o in operations[:5]),
    )


def answer_general(
    question: str,
    settings: Settings,
    *,
    transport=None,  # noqa: ANN001 - transporte HTTP inyectable en pruebas
) -> LogixAnswer:
    if not settings.logix_ai_enabled or settings.openrouter_api_key is None:
        return LogixAnswer(text=UNAVAILABLE_GENERAL, kind="unavailable")
    messages = [
        {"role": "system", "content": GENERAL_SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]
    try:
        text = chat_completion(
            base_url=settings.openrouter_base_url,
            api_key=settings.openrouter_api_key.get_secret_value(),
            model=settings.openrouter_model or "",
            messages=messages,
            max_output_tokens=settings.logix_max_output_tokens,
            timeout_seconds=settings.logix_timeout_seconds,
            transport=transport,
        )
    except ProviderError:
        return LogixAnswer(text=PROVIDER_FAILURE, kind="provider_failure")
    return LogixAnswer(text=text, kind="model")
