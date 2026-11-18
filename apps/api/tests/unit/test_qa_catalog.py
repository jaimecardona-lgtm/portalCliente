"""Catálogo QA: identificadores estables, PDF real y rechazo de empresas productivas."""

import pytest

from app.services.qa_catalog import (
    CAPACITY_TENANT_ID,
    CLM_TENANT_ID,
    DOCUMENTS,
    PDF_MARKER,
    QUOTES,
    QaGuardError,
    assert_qa_only,
    documents_for,
    quotes_for,
)


def test_el_lote_separa_capacity_y_clm() -> None:
    assert len(documents_for(CAPACITY_TENANT_ID)) == 4
    assert len(documents_for(CLM_TENANT_ID)) == 2
    assert len(quotes_for(CAPACITY_TENANT_ID)) == 4
    assert len(quotes_for(CLM_TENANT_ID)) == 2
    statuses = {quote.status for quote in quotes_for(CAPACITY_TENANT_ID)}
    assert statuses == {"pendiente", "aceptada", "rechazada", "vencida"}
    assert all(len(quote.lines) >= 2 for quote in QUOTES)
    assert all(
        "." in line.unit_amount and line.unit_amount.endswith("00")
        for quote in QUOTES
        for line in quote.lines
    )


def test_el_pdf_declara_que_no_tiene_validez_comercial() -> None:
    content = DOCUMENTS[0].content()
    assert content.startswith(b"%PDF-")
    assert PDF_MARKER.encode("ascii") in content
    assert len(DOCUMENTS[0].sha256()) == 64


def test_una_empresa_verificada_bloquea_el_lote() -> None:
    qa = {
        "id": str(CAPACITY_TENANT_ID),
        "segment": "QA_SYNTHETIC_ONLY",
        "external_tenant_id": None,
        "integration_status": "pending_integration",
        "verified_at": None,
    }
    productive = {
        **qa,
        "id": "otra",
        "segment": "enterprise",
        "integration_status": "verified",
        "verified_at": "hoy",
    }
    with pytest.raises(QaGuardError):
        assert_qa_only([qa, productive])
    assert_qa_only([qa])
