"""Reconocimiento de intención de Logix. No redacta la respuesta: solo elige el plan.

El plan indica qué herramientas puede ejecutar el servidor. El tenant no forma parte del plan.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.services.logix import extract_do_number, is_private


def fold(text: str) -> str:
    normalized = "".join(
        char for char in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(char)
    )
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", normalized).split())


@dataclass(frozen=True)
class Focus:
    """Lo último que esta conversación consultó en una sola empresa."""

    intent: str
    do_numbers: tuple[str, ...] = ()
    total: int | None = None
    active: int | None = None
    in_transit: int | None = None


@dataclass(frozen=True)
class TurnPlan:
    intent: str
    tools: tuple[str, ...]
    needs_operations: bool = True
    needs_profile: bool = False
    status: str | None = None
    do_numbers: tuple[str, ...] = ()
    updates_focus: bool = False


_COURTESY = frozenset(
    {
        "hola",
        "buenos dias",
        "buenas tardes",
        "buenas noches",
        "gracias",
        "muchas gracias",
        "adios",
        "hasta luego",
        "chao",
    }
)
_EVENT_WORDS = ("evento", "cronologia", "seguimiento", "ultimo movimiento")
_GENERAL = re.compile(r"^(?:que es|que significa)\b")


def classify(question: str, focus: Focus | None = None) -> TurnPlan:
    text = fold(question)
    do_number = extract_do_number(question)
    if text in _COURTESY:
        return TurnPlan("courtesy", (), needs_operations=False, needs_profile=False)
    explains = text.startswith("explic") or "que significa" in text
    about_records = "transito" in text or bool(re.search(r"\bcuatro\b", text))
    follow = any(
        word in text
        for word in ("profundiza", "mas detalle", "detalla", "esas operaciones", "important")
    )
    if not is_private(question) and not about_records and not follow:
        return TurnPlan("general", (), needs_operations=False, needs_profile=False)
    if explains and (about_records or (focus is not None and focus.in_transit is not None)):
        return TurnPlan(
            "explain_focus",
            ("get_dashboard_summary", "list_operations"),
            status="En tránsito",
            updates_focus=False,
        )
    if any(word in text for word in ("profundiza", "mas detalle", "detalla", "esas operaciones")):
        numbers = tuple(focus.do_numbers)[:4] if focus else ()
        if do_number:
            numbers = (do_number,)
        tools = tuple(
            name
            for _number in numbers[:4]
            for name in ("get_operation_detail", "get_operation_events")
        )
        return TurnPlan(
            "follow_detail",
            tools or ("list_operations",),
            status="En tránsito",
            do_numbers=numbers,
        )
    if "important" in text:
        return TurnPlan(
            "follow_important",
            ("list_operations", "get_dashboard_summary"),
            status="En tránsito",
        )
    if "resumen ejecutivo" in text or (
        "resumen" in text and any(word in text for word in ("empresa", "tenant", "operacion"))
    ):
        return TurnPlan(
            "executive",
            ("get_tenant_profile", "get_dashboard_summary", "list_operations", "list_requests"),
            needs_profile=True,
            status="En tránsito",
            updates_focus=True,
        )
    if any(word in text for word in ("riesgo", "alerta", "retraso")):
        return TurnPlan(
            "alerts",
            ("get_dashboard_summary", "list_operations"),
            status="En tránsito",
            updates_focus=True,
        )
    if do_number and any(word in text for word in _EVENT_WORDS):
        return TurnPlan("operation_events", ("get_operation_events",), do_numbers=(do_number,))
    if do_number:
        return TurnPlan("operation_detail", ("get_operation_detail",), do_numbers=(do_number,))
    if "solicitud" in text:
        return TurnPlan("requests", ("list_requests",))
    if any(word in text for word in ("perfil", "nit", "datos de la empresa", "informacion de cuenta")):
        return TurnPlan("profile", ("get_tenant_profile",), needs_operations=False, needs_profile=True)
    if "transito" in text:
        return TurnPlan("transit", ("list_operations",), status="En tránsito", updates_focus=True)
    if "abiert" in text and any(word in text for word in ("cuales", "lista", "muestra", "muestr")):
        return TurnPlan("open_operations", ("list_operations",), status="Abierto", updates_focus=True)
    if any(word in text for word in ("cuales", "lista", "muestra", "muestr")):
        return TurnPlan("list_operations", ("list_operations",), updates_focus=True)
    if any(word in text for word in ("operaci", "cuantas", "cuantos", "empresa", "tenant", "estado")):
        return TurnPlan("dashboard", ("get_dashboard_summary",))
    return TurnPlan("general", (), needs_operations=False, needs_profile=False)
