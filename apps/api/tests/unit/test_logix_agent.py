"""Intención, resumen local, memoria por empresa y compuerta de OpenRouter.

No consultan PostgreSQL ni envían resultados de empresa al proveedor.
"""

from __future__ import annotations

from uuid import uuid4

import httpx
import pytest

from app.integrations.openrouter import (
    OperationalExportBlocked,
    ProviderError,
    chat_with_tools,
    validate_tool_call,
)
from app.services.logix_brief import compose
from app.services.logix_intent import Focus, classify
from app.services.logix_session import ConversationMemory
from app.services.logix_tools import ToolResult


def test_las_preguntas_de_aceptacion_eligen_intencion() -> None:
    assert classify("Hola.").intent == "courtesy"
    assert classify("Necesito un resumen ejecutivo sobre este tenant.").intent == "executive"
    transit = classify("¿Cuáles operaciones están en tránsito?")
    assert transit.intent == "transit"
    assert transit.status == "En tránsito"
    explain = classify("Explícame qué significa que cuatro estén en tránsito.")
    assert explain.intent == "explain_focus"
    assert classify("¿Qué significa ETA?").intent == "general"
    important = classify(
        "¿Cuáles son las más importantes?",
        Focus("transit", ("QA-DO-CAPACITY-01-002",), in_transit=4),
    )
    assert important.intent == "follow_important"
    assert important.status == "En tránsito"
    assert classify("¿Qué significa la ETA de mi operación?").intent != "general"


def test_el_resumen_usa_los_conteos_registrados_y_no_inventa() -> None:
    plan = classify("Necesito un resumen ejecutivo sobre este tenant.")
    items = [
        {
            "do_number": f"QA-DO-CAPACITY-01-00{index}",
            "status": "En tránsito",
            "origin": "Origen",
            "destination": "Destino",
            "eta": None,
        }
        for index in range(1, 5)
    ]
    results = {
        "profile": ToolResult(
            "get_tenant_profile",
            {
                "item": {
                    "legal_name": "Capacity Tenant 01",
                    "tax_id": None,
                    "city": "Bogotá",
                    "country": "Colombia",
                }
            },
        ),
        "dashboard": ToolResult(
            "get_dashboard_summary",
            {
                "total": 20,
                "active": 8,
                "in_transit": 4,
                "open": 4,
                "by_status": {"En tránsito": 4, "Abierto": 4, "Cerrado": 12},
                "pending_client_response": 1,
                "pending_client_response_unknown": 19,
            },
        ),
        "list": ToolResult("list_operations", {"items": items}),
        "requests": ToolResult("list_requests", {"items": []}),
    }
    answer, focus = compose(plan, results)
    assert "Registradas: 20" in answer.text
    assert "Activas (abierto o en tránsito): 8" in answer.text
    assert "En tránsito: 4" in answer.text
    assert "no equivale a cero" in answer.text
    assert "Solicitudes registradas: 0." in answer.text
    assert "ETA no registrada" in answer.text
    assert "retrasada" not in answer.text.casefold()
    assert "marcada como pendiente: 1" in answer.text
    assert focus is not None
    assert focus.do_numbers == tuple(item["do_number"] for item in items)
    assert "get_dashboard_summary" in answer.tools


def test_explicar_transito_no_lo_convierte_en_retraso() -> None:
    plan = classify("Explícame qué significa que cuatro estén en tránsito.")
    results = {
        "dashboard": ToolResult(
            "get_dashboard_summary",
            {"total": 20, "active": 8, "in_transit": 4, "open": 4},
        ),
        "list": ToolResult(
            "list_operations",
            {
                "items": [
                    {
                        "do_number": "QA-DO-CAPACITY-01-001",
                        "status": "En tránsito",
                        "origin": None,
                        "destination": None,
                        "eta": None,
                    }
                ]
            },
        ),
    }
    answer, remembered = compose(
        plan,
        results,
        prior=Focus("transit", ("QA-DO-CAPACITY-01-001",), in_transit=4),
    )
    assert remembered is None
    assert "QA-DO-CAPACITY-01-001" in answer.text
    assert "4" in answer.text
    assert "retrasada" not in answer.text.casefold()
    assert "No lo convierto en una llegada tarde" in answer.text


def test_la_memoria_no_cruza_empresas() -> None:
    memory = ConversationMemory()
    user = uuid4()
    capacity = uuid4()
    clm = uuid4()
    memory.remember(
        user,
        capacity,
        Focus("transit", ("QA-DO-CAPACITY-01-001",), total=20, active=8, in_transit=4),
    )
    assert memory.focus(user, clm) is None
    same = classify("Ahora profundiza en esas operaciones.", memory.focus(user, capacity))
    other = classify("Ahora profundiza en esas operaciones.", memory.focus(user, clm))
    assert same.do_numbers == ("QA-DO-CAPACITY-01-001",)
    assert other.do_numbers == ()
    answer, _focus = compose(other, {})
    assert "QA-DO-CAPACITY-01-001" not in answer.text


def test_la_memoria_caduca() -> None:
    now = 0.0
    memory = ConversationMemory(clock=lambda: now)
    user, tenant = uuid4(), uuid4()
    memory.remember(user, tenant, Focus("transit", ("QA-DO-1",), in_transit=1))
    now = 30 * 60 + 1
    assert memory.focus(user, tenant) is None


def test_las_herramientas_rechazan_tenant_y_sql() -> None:
    assert validate_tool_call("get_operation_detail", {"do_number": "QA-DO-1"}) == {"do_number": "QA-DO-1"}
    with pytest.raises(ProviderError):
        validate_tool_call("get_operation_detail", {"tenant_id": "otro", "do_number": "QA-DO-1"})
    with pytest.raises(ProviderError):
        validate_tool_call("list_operations", {"sql": "select 1"})
    with pytest.raises(ProviderError):
        validate_tool_call("ejecutar_sql", {})


def test_un_resultado_de_empresa_no_sale_sin_autorizacion_operativa() -> None:
    def reject(request: httpx.Request) -> httpx.Response:
        raise AssertionError(request.url)

    with pytest.raises(OperationalExportBlocked):
        chat_with_tools(
            base_url="https://openrouter.ai/api/v1",
            api_key="no-se-usa",
            model="anthropic/claude-haiku-5.5",
            messages=[{"role": "tool", "content": "Operaciones registradas: 20"}],
            max_output_tokens=16,
            timeout_seconds=1,
            operational_authorized=False,
            transport=httpx.MockTransport(reject),
        )
