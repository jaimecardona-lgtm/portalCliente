"""Redacción local de Logix a partir de resultados ya filtrados por tenant.

No llama al modelo y no inventa ETA, retrasos, documentos, cotizaciones ni riesgos.
Una consulta vacía es un cero. Una fuente que Logix no consulta es información no disponible.
"""

from __future__ import annotations

from typing import Any

from app.services.logix import LogixAnswer
from app.services.logix_intent import Focus, TurnPlan
from app.services.logix_tools import ToolResult

_CLOSED_REQUESTS = frozenset({"cerrada", "resuelta", "cancelada", "rechazada", "cerrado"})
_DOCUMENTS_GAP = (
    "Documentos y cotizaciones: Logix no tiene una consulta autorizada para ellos en este resumen. "
    "Eso no equivale a cero."
)


def _missing(value: object, label: str) -> str:
    if value is None or (isinstance(value, str) and not value.strip()):
        return label
    return str(value)


def _line_operation(item: dict[str, Any]) -> str:
    eta = item.get("eta")
    eta_text = eta if eta else "ETA no registrada"
    origin = _missing(item.get("origin"), "origen no registrado")
    destination = _missing(item.get("destination"), "destino no registrado")
    status = item.get("status") or "sin estado"
    return f"{item['do_number']}: {origin} → {destination}. Estado: {status}. {eta_text}."


def _focus_from(plan: TurnPlan, dashboard: dict[str, Any] | None, numbers: tuple[str, ...]) -> Focus:
    data = dashboard or {}
    return Focus(
        intent=plan.intent,
        do_numbers=numbers,
        total=data.get("total"),
        active=data.get("active"),
        in_transit=data.get("in_transit"),
    )


def _catalog_line(label: str, data: dict[str, Any] | None) -> str:
    if data is None:
        return f"{label}: no consultados. Eso no equivale a cero."
    availability = data.get("availability")
    if availability == "unauthorized":
        return f"{label}: consulta no autorizada para este rol."
    if availability != "queried":
        return f"{label}: la consulta no está disponible. Eso no equivale a cero."
    returned = data.get("returned")
    if returned == 0:
        return f"{label}: 0 registros en la empresa activa."
    return f"{label}: {returned} registros en la empresa activa."


def _catalog_gap(results: dict[str, ToolResult]) -> str:
    documents = _data(results, "list_documents")
    quotes = _data(results, "list_quotes")
    if documents is None and quotes is None:
        return _DOCUMENTS_GAP
    return f"{_catalog_line('Documentos', documents)} {_catalog_line('Cotizaciones', quotes)}"


def compose(
    plan: TurnPlan,
    results: dict[str, ToolResult],
    *,
    profile_unavailable: bool = False,
    prior: Focus | None = None,
) -> tuple[LogixAnswer, Focus | None]:
    tools = tuple(dict.fromkeys(result.name for result in results.values()))
    if plan.intent == "executive":
        answer, focus = _executive(results, profile_unavailable, tools)
        return answer, focus
    if plan.intent == "transit":
        return _transit(results, tools)
    if plan.intent == "explain_focus":
        return _explain(results, tools, prior), None
    if plan.intent == "follow_detail":
        return _details(plan, results, tools, prior), None
    if plan.intent == "follow_important":
        return _important(results, tools), _focus_from(
            plan, _data(results, "get_dashboard_summary"), _numbers(results, "list_operations")
        )
    if plan.intent == "alerts":
        return _alerts(results, tools), _focus_from(
            plan, _data(results, "get_dashboard_summary"), _numbers(results, "list_operations")
        )
    if plan.intent == "documents":
        return _catalog_answer(results, tools, "list_documents", "Documentos"), None
    if plan.intent == "quotes":
        return _catalog_answer(results, tools, "list_quotes", "Cotizaciones"), None
    return _single(results, tools), None


def _data(results: dict[str, ToolResult], name: str) -> dict[str, Any] | None:
    for result in results.values():
        if result.name == name:
            return result.data
    return None


def _catalog_answer(
    results: dict[str, ToolResult], tools: tuple[str, ...], name: str, label: str
) -> LogixAnswer:
    data = _data(results, name)
    line = _catalog_line(label, data)
    items = (data or {}).get("items") or []
    if not data or data.get("availability") != "queried" or not items:
        return LogixAnswer(line, "deterministic", (), tools)
    if name == "list_documents":
        details = "\n".join(
            f"- {item['file_name']} · versión {item['version']} · {item['size_bytes']} bytes" for item in items
        )
        sources = tuple(item["file_name"] for item in items)
    else:
        details = "\n".join(
            f"- {item['number']} · {item['status']} · vigente hasta {item['valid_until']} · "
            f"{item['total']} {item['currency']}"
            for item in items
        )
        sources = tuple(item["number"] for item in items)
    return LogixAnswer(f"{line}\n{details}", "deterministic", sources, tools)


def _numbers(results: dict[str, ToolResult], name: str) -> tuple[str, ...]:
    data = _data(results, name)
    if not data:
        return ()
    if "in_transit_numbers" in data and name == "get_dashboard_summary":
        return tuple(data["in_transit_numbers"])
    return tuple(item["do_number"] for item in data.get("items") or [] if item.get("do_number"))


def _executive(
    results: dict[str, ToolResult], unavailable_profile: bool, tools: tuple[str, ...]
) -> tuple[LogixAnswer, Focus]:
    profile = _data(results, "get_tenant_profile")
    dashboard = _data(results, "get_dashboard_summary") or {}
    transit = _data(results, "list_operations") or {"items": []}
    requests = _data(results, "list_requests") or {"items": []}
    item = (profile or {}).get("item") if profile else None
    if unavailable_profile:
        company = (
            "Perfil de empresa: no disponible con el permiso actual. "
            "No lo interpreto como empresa sin datos."
        )
    elif item is None:
        company = "Perfil de empresa: la consulta no devolvió un perfil."
    else:
        company = (
            f"Empresa: {_missing(item.get('legal_name'), 'nombre no registrado')}. "
            f"NIT: {_missing(item.get('tax_id'), 'no registrado')}. "
            f"Ubicación: {_missing(item.get('city'), 'ciudad no registrada')}, "
            f"{_missing(item.get('country'), 'país no registrado')}."
        )
    distribution = dashboard.get("by_status") or {}
    distribution_text = (
        ", ".join(f"{status}: {count}" for status, count in distribution.items())
        if distribution
        else "sin distribución porque no hay operaciones registradas"
    )
    transit_items = transit.get("items") or []
    if transit_items:
        transit_lines = "\n".join(f"- {_line_operation(row)}" for row in transit_items)
    else:
        transit_lines = "- Ninguna con el estado registrado En tránsito."
    recorded_transit = dashboard.get("in_transit")
    if isinstance(recorded_transit, int) and recorded_transit != len(transit_items):
        transit_lines = (
            f"Se listan {len(transit_items)} de {recorded_transit} "
            f"registradas en ese estado.\n{transit_lines}"
        )
    request_items = requests.get("items") or []
    pending = [
        row for row in request_items if str(row.get("status") or "").casefold() not in _CLOSED_REQUESTS
    ]
    if not request_items:
        request_text = "Solicitudes registradas: 0."
    else:
        listed = ", ".join(f"{row['number']} ({row.get('status') or 'sin estado'})" for row in pending[:8])
        request_text = (
            f"Solicitudes devueltas: {len(request_items)}. "
            f"Pendientes de cierre: {len(pending)}. {listed}"
        )
    pending_response = dashboard.get("pending_client_response")
    pending_unknown = dashboard.get("pending_client_response_unknown")
    if pending_response is None:
        alert = "Alerta de respuesta del cliente: el indicador no vino en la consulta."
    else:
        alert = (
            f"Operaciones con respuesta del cliente marcada como pendiente: {pending_response}. "
            f"Operaciones donde ese indicador no está registrado: {pending_unknown}."
        )
    events = [result for result in results.values() if result.name == "get_operation_events"]
    if not events:
        event_text = "Eventos: no se consultaron eventos individuales en este resumen."
    else:
        chunks = []
        for result in events[:3]:
            data = result.data
            if not data.get("operation_found"):
                chunks.append(f"{data.get('requested_do')}: operación no visible.")
            elif not data.get("items"):
                chunks.append(f"{data.get('requested_do')}: sin eventos visibles registrados.")
            else:
                title = data["items"][0]["title"]
                chunks.append(f"{data.get('requested_do')}: último evento visible «{title}».")
        event_text = "Eventos visibles recientes:\n" + "\n".join(f"- {chunk}" for chunk in chunks)
    total = dashboard.get("total", 0)
    active = dashboard.get("active", 0)
    in_transit = dashboard.get("in_transit", 0)
    opened = dashboard.get("open", 0)
    text = (
        f"{company}\n\n"
        "Operaciones de la empresa activa, según el registro:\n"
        f"- Registradas: {total}.\n"
        f"- Activas (abierto o en tránsito): {active}.\n"
        f"- En tránsito: {in_transit}.\n"
        f"- Abiertas: {opened}.\n"
        f"- Distribución por estado: {distribution_text}.\n\n"
        "En tránsito no significa retraso. Es el estado guardado. Detalle disponible:\n"
        f"{transit_lines}\n\n"
        f"{request_text}\n\n"
        f"{alert}\n\n"
        f"{event_text}\n\n"
        f"{_catalog_gap(results)}\n\n"
        "Interpretación: el panorama sale solo de estos conteos y listas. "
        "No hay en la consulta un campo de demora, factura o riesgo, así que no lo afirmo."
    )
    numbers = tuple(row["do_number"] for row in transit_items)
    sources = numbers or tuple(dashboard.get("in_transit_numbers") or [])
    follow = (
        "¿Cuáles operaciones están en tránsito?",
        "Profundiza en esas operaciones.",
        "¿Hay solicitudes pendientes?",
    )
    catalog = _catalog_gap(results)
    answer = LogixAnswer(text, "deterministic", sources, tools, follow, (catalog,))
    return answer, Focus("executive", numbers, total, active, in_transit)


def _transit(results: dict[str, ToolResult], tools: tuple[str, ...]) -> tuple[LogixAnswer, Focus]:
    data = _data(results, "list_operations") or {"items": [], "returned": 0}
    items = data.get("items") or []
    if not items:
        text = (
            "No hay operaciones con estado En tránsito en la empresa activa. "
            "El conteo de esta consulta es 0."
        )
        answer = LogixAnswer(
            text,
            "deterministic",
            (),
            tools,
            ("Necesito un resumen ejecutivo sobre este tenant.",),
        )
        return answer, Focus("transit", (), None, None, 0)
    lines = "\n".join(f"- {_line_operation(row)}" for row in items)
    text = (
        f"Operaciones en tránsito de la empresa activa: {len(items)}. "
        "El estado proviene del registro; no indica por sí solo un retraso.\n"
        f"{lines}"
    )
    numbers = tuple(row["do_number"] for row in items)
    answer = LogixAnswer(
        text,
        "deterministic",
        numbers,
        tools,
        ("Profundiza en esas operaciones.", "Explícame qué significa que estén en tránsito."),
    )
    return answer, Focus("transit", numbers, None, None, len(items))


def _explain(
    results: dict[str, ToolResult], tools: tuple[str, ...], prior: Focus | None
) -> LogixAnswer:
    dashboard = _data(results, "get_dashboard_summary") or {}
    count = dashboard.get("in_transit")
    items = (_data(results, "list_operations") or {}).get("items") or []
    listed = ", ".join(row["do_number"] for row in items) or "ninguna referencia en el listado"
    recorded = "el registro no trajo el conteo" if count is None else str(count)
    prior_note = ""
    if prior and prior.in_transit is not None and count is not None and prior.in_transit != count:
        prior_note = (
            f" En el turno anterior el conteo guardado era {prior.in_transit}; "
            f"ahora el registro indica {count}."
        )
    text = (
        "En tránsito es el estado que el portal tiene guardado para una operación. "
        "No mide días de demora ni confirma una excepción.\n\n"
        f"En la empresa activa el registro indica {recorded} operaciones en tránsito: "
        f"{listed}.{prior_note}\n\n"
        "Donde la ETA no está registrada, falta el dato. No lo convierto en una llegada tarde."
    )
    numbers = tuple(row["do_number"] for row in items)
    return LogixAnswer(
        text,
        "deterministic",
        numbers,
        tools,
        ("Profundiza en esas operaciones.",),
        ("No hay un indicador de retraso en esta consulta.",),
    )


def _details(
    plan: TurnPlan, results: dict[str, ToolResult], tools: tuple[str, ...], prior: Focus | None
) -> LogixAnswer:
    if not plan.do_numbers:
        if prior is not None and prior.in_transit == 0:
            return LogixAnswer(
                "La consulta anterior, en esta empresa, no dejó operaciones en tránsito para profundizar.",
                "deterministic",
                (),
                tools,
            )
        return LogixAnswer(
            "En esta empresa no hay una selección anterior de operaciones. "
            "Puedo listar las que están en tránsito o preparar el resumen.",
            "deterministic",
            (),
            tools,
            ("¿Cuáles operaciones están en tránsito?", "Necesito un resumen ejecutivo sobre este tenant."),
        )
    details = [result for result in results.values() if result.name == "get_operation_detail"]
    events = {
        result.data.get("requested_do"): result
        for result in results.values()
        if result.name == "get_operation_events"
    }
    if not details:
        data = _data(results, "list_operations") or {}
        items = data.get("items") or []
        if not items:
            return LogixAnswer(
                "No hay operaciones en tránsito para profundizar en la empresa activa.",
                "deterministic",
                (),
                tools,
            )
        lines = "\n".join(f"- {_line_operation(row)}" for row in items)
        numbers = tuple(row["do_number"] for row in items)
        return LogixAnswer(
            f"Detalle disponible de las operaciones en tránsito:\n{lines}",
            "deterministic",
            numbers,
            tools,
        )
    chunks = ["Profundizo solo en las operaciones ya identificadas en esta empresa:"]
    sources: list[str] = []
    for result in details:
        item = result.data.get("item")
        requested = result.data.get("requested_do")
        if item is None:
            chunks.append(f"- No encontré la operación {requested} en la empresa activa.")
            continue
        sources.append(item["do_number"])
        event = events.get(item["do_number"])
        if event and event.data.get("items"):
            last = event.data["items"][0]
            event_text = f" Último evento visible: {last['title']}."
        elif event:
            event_text = " Sin eventos visibles registrados."
        else:
            event_text = " Eventos no consultados."
        chunks.append(f"- {_line_operation(item)}{event_text}")
    return LogixAnswer("\n".join(chunks), "deterministic", tuple(sources), tools)


def _important(results: dict[str, ToolResult], tools: tuple[str, ...]) -> LogixAnswer:
    items = (_data(results, "list_operations") or {}).get("items") or []
    text = (
        "No hay un campo de importancia o prioridad en las operaciones. "
        "No voy a ordenarlas por un criterio que el registro no tiene.\n\n"
        "El criterio disponible es el estado En tránsito"
    )
    if not items:
        text += ": ahora mismo la consulta devolvió 0 operaciones en ese estado."
        return LogixAnswer(text, "deterministic", (), tools)
    lines = "\n".join(f"- {_line_operation(row)}" for row in items)
    numbers = tuple(row["do_number"] for row in items)
    text += f", y estas son las {len(items)} que lo tienen:\n{lines}"
    return LogixAnswer(text, "deterministic", numbers, tools, ("Profundiza en esas operaciones.",))


def _alerts(results: dict[str, ToolResult], tools: tuple[str, ...]) -> LogixAnswer:
    dashboard = _data(results, "get_dashboard_summary") or {}
    marked = dashboard.get("pending_client_response")
    unknown = dashboard.get("pending_client_response_unknown")
    text = (
        "Solo puedo mencionar alertas que el registro marca. "
        "No infiero retrasos porque no existe ese indicador.\n\n"
        f"Respuesta del cliente pendiente: {marked if marked is not None else 'dato no devuelto'}. "
        f"Indicador sin registrar: {unknown if unknown is not None else 'dato no devuelto'}.\n"
        f"{_DOCUMENTS_GAP}"
    )
    return LogixAnswer(
        text,
        "deterministic",
        (),
        tools,
        ("¿Cuáles operaciones están en tránsito?",),
        (_DOCUMENTS_GAP,),
    )


def _single(results: dict[str, ToolResult], tools: tuple[str, ...]) -> LogixAnswer:
    from app.services.logix import answer_tool

    result = next(iter(results.values()))
    answer = answer_tool(result)
    return LogixAnswer(answer.text, answer.kind, answer.sources, tools, answer.follow_ups, answer.limitations)
