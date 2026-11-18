"""Un turno de Logix: intención, herramientas del tenant activo y redacción local.

Las consultas de empresa no salen del servidor. El ciclo con herramientas del modelo existe en
`openrouter.chat_with_tools`, pero este flujo no lo usa: hace falta una autorización distinta de
la de conocimiento general y esa autorización permanece apagada.
"""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AccessDenied
from app.services import logix as logix_svc
from app.services import logix_tools
from app.services import staff as staff_svc
from app.services.logix_brief import compose
from app.services.logix_intent import TurnPlan, classify
from app.services.logix_session import MEMORY, ConversationMemory
from app.services.logix_tools import ToolResult

_MAX_CALLS = 8


class StaffActor(Protocol):
    def can(self, permission: str) -> bool: ...


def answer_turn(
    session: Session,
    *,
    question: str,
    settings: Settings,
    user_id: UUID,
    tenant_id: UUID | None,
    staff_ctx: StaffActor | None,
    memory: ConversationMemory | None = None,
) -> tuple[logix_svc.LogixAnswer, bool]:
    store = memory or MEMORY
    prior = store.focus(user_id, tenant_id) if tenant_id is not None else None
    plan = classify(question, prior)
    if plan.intent == "courtesy":
        return logix_svc.answer_courtesy(question) or logix_svc.LogixAnswer("Listo.", "local"), False
    if plan.intent == "general":
        return logix_svc.answer_general(question, settings), False
    if tenant_id is None:
        return logix_svc.LogixAnswer(logix_svc.NO_TENANT, "local"), False

    profile_blocked = False
    documents_blocked = False
    quotes_blocked = False
    if staff_ctx is not None:
        if "list_documents" in plan.tools and not staff_ctx.can("documents.read"):
            if plan.intent == "documents":
                raise AccessDenied(
                    "Su rol no tiene permiso para realizar esta consulta.", code="permission_denied"
                )
            documents_blocked = True
        if "list_quotes" in plan.tools and not staff_ctx.can("quotes.read"):
            if plan.intent == "quotes":
                raise AccessDenied(
                    "Su rol no tiene permiso para realizar esta consulta.", code="permission_denied"
                )
            quotes_blocked = True
        if plan.needs_operations and not staff_ctx.can("operations.read"):
            raise AccessDenied(
                "Su rol no tiene permiso para realizar esta consulta.", code="permission_denied"
            )
        if plan.needs_profile and not staff_ctx.can("tenants.read"):
            if plan.intent == "profile":
                raise AccessDenied(
                    "Su rol no tiene permiso para realizar esta consulta.", code="permission_denied"
                )
            profile_blocked = True

    results = _run_tools(
        session,
        tenant_id,
        plan,
        include_profile=not profile_blocked,
        documents_blocked=documents_blocked,
        quotes_blocked=quotes_blocked,
    )
    answer, focus = compose(plan, results, profile_unavailable=profile_blocked, prior=prior)
    if focus is not None:
        store.remember(user_id, tenant_id, focus)
    if staff_ctx is not None and results:
        actor: Any = staff_ctx
        if any(item.name != "get_tenant_profile" for item in results.values()):
            staff_svc.audit(session, actor, "operations_list", tenant_id=tenant_id, result="allowed")
        if any(item.name == "get_tenant_profile" for item in results.values()):
            staff_svc.audit(session, actor, "account_read", tenant_id=tenant_id, result="allowed")
    return answer, bool(results)


def _blocked(name: str) -> ToolResult:
    return ToolResult(name=name, data={"availability": "unauthorized", "items": [], "returned": None})


def _run_tools(
    session: Session,
    tenant_id: UUID,
    plan: TurnPlan,
    *,
    include_profile: bool,
    documents_blocked: bool = False,
    quotes_blocked: bool = False,
) -> dict[str, ToolResult]:
    results: dict[str, ToolResult] = {}
    names = set(plan.tools)

    def add(key: str, result: ToolResult) -> bool:
        if len(results) >= _MAX_CALLS:
            return False
        results[key] = result
        return True

    if "get_tenant_profile" in names and include_profile:
        add("profile", logix_tools.get_tenant_profile(session, tenant_id))
    if "get_dashboard_summary" in names:
        add("dashboard", logix_tools.get_dashboard_summary(session, tenant_id))
    if "list_operations" in names:
        add("list", logix_tools.list_operations(session, tenant_id, status=plan.status, limit=20))
    if "list_requests" in names:
        add("requests", logix_tools.list_requests(session, tenant_id))
    if "list_documents" in names:
        add(
            "documents",
            _blocked("list_documents") if documents_blocked else logix_tools.list_documents(session, tenant_id),
        )
    if "list_quotes" in names:
        add(
            "quotes",
            _blocked("list_quotes") if quotes_blocked else logix_tools.list_quotes(session, tenant_id),
        )
    if "get_operation_detail" in names or "get_operation_events" in names:
        for do_number in plan.do_numbers[:4]:
            if "get_operation_detail" in names and not add(
                f"detail:{do_number}",
                logix_tools.get_operation_detail(session, tenant_id, do_number=do_number),
            ):
                break
            if "get_operation_events" in names and not add(
                f"events:{do_number}",
                logix_tools.get_operation_events(session, tenant_id, do_number=do_number),
            ):
                break
    if plan.intent == "executive" and "list" in results:
        for row in (results["list"].data.get("items") or [])[:3]:
            do_number = row.get("do_number")
            if not do_number:
                continue
            if not add(
                f"events:{do_number}",
                logix_tools.get_operation_events(session, tenant_id, do_number=do_number),
            ):
                break
    return results
