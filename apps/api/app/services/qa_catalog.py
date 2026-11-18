"""Catálogo estable del lote QA de documentos y cotizaciones.

No escribe en la base ni en Storage. Los identificadores salen de un espacio de nombres fijo
para que repetir el procedimiento reconozca las mismas filas. Los montos quedan como texto
decimal; este módulo no usa flotantes.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass

BATCH = "qa-docs-quotes-2026-11-17"
CAPACITY_TENANT_ID = uuid.UUID("0b423825-d0ca-5442-9fa5-8931d90ad368")
CLM_TENANT_ID = uuid.UUID("72b31b78-10a7-566c-8801-2211c2571b15")
_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, f"logixtic://{BATCH}")

PDF_MARKER = "DOCUMENTO SINTETICO DE REVISION INTERNA. SIN VALIDEZ COMERCIAL."
QUOTE_NOTE = "Registro de revision interna. Sin validez comercial. No es un documento de Logixtic."


class QaGuardError(Exception):
    """El lote no puede aplicarse: hay una empresa que no es QA sintética."""


@dataclass(frozen=True)
class AccountPlan:
    tenant_id: uuid.UUID
    account_id: uuid.UUID
    legal_name: str
    tax_id: str


@dataclass(frozen=True)
class DocumentPlan:
    tenant_id: uuid.UUID
    account_id: uuid.UUID
    document_id: uuid.UUID
    file_uuid: uuid.UUID
    file_name: str
    message: str

    @property
    def storage_path(self) -> str:
        return (
            f"tenants/{self.tenant_id}/clients/{self.account_id}/documents/"
            f"{self.document_id}/{self.file_uuid}.pdf"
        )

    def content(self) -> bytes:
        return pdf_bytes(f"{self.file_name}. {self.message}")

    def sha256(self) -> str:
        return hashlib.sha256(self.content()).hexdigest()


@dataclass(frozen=True)
class QuoteLinePlan:
    line_id: uuid.UUID
    position: int
    concept: str
    quantity: str
    unit: str
    unit_amount: str


@dataclass(frozen=True)
class QuotePlan:
    tenant_id: uuid.UUID
    quote_id: uuid.UUID
    number: str
    external_id: str
    issued_on: str
    valid_until: str
    service: str
    origin_place: str
    destination_place: str
    status: str
    lines: tuple[QuoteLinePlan, ...]


def stable_id(name: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, name)


def pdf_bytes(message: str) -> bytes:
    """PDF mínimo con el aviso dentro del contenido, no solo en el nombre."""
    safe = "".join(ch if 32 <= ord(ch) < 127 else " " for ch in message)
    stream = f"BT /F1 12 Tf 72 700 Td ({safe}) Tj ET".encode("ascii")
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
        f"4 0 obj << /Length {len(stream)} >> stream\n".encode("ascii") + stream + b"\nendstream endobj\n",
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    ]
    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    body = b""
    offsets = [0]
    cursor = len(header)
    for item in objects:
        offsets.append(cursor)
        body += item
        cursor += len(item)
    xref = [f"xref\n0 {len(offsets)}\n", "0000000000 65535 f \n"]
    xref.extend(f"{offset:010d} 00000 n \n" for offset in offsets[1:])
    trailer = f"trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{cursor}\n%%EOF\n"
    return header + body + "".join(xref).encode("ascii") + trailer.encode("ascii")


def assert_qa_only(tenants: list[dict[str, object]]) -> None:
    """Rechaza el lote si cualquier empresa visible no es QA sintética sin verificación oficial."""
    if not tenants:
        raise QaGuardError("No hay empresas visibles para comprobar el alcance QA.")
    blocked: list[str] = []
    for row in tenants:
        segment = row.get("segment")
        external = row.get("external_tenant_id")
        integration = row.get("integration_status")
        verified = row.get("verified_at")
        if (
            segment != "QA_SYNTHETIC_ONLY"
            or external not in (None, "")
            or integration == "verified"
            or verified not in (None, "")
        ):
            blocked.append(str(row.get("id")))
    if blocked:
        raise QaGuardError(
            "Hay empresas que no son QA sintético sin verificación. "
            f"El lote no se aplica. Identificadores: {', '.join(blocked)}."
        )


def _account(tenant_id: uuid.UUID, key: str, legal_name: str, tax_id: str) -> AccountPlan:
    return AccountPlan(tenant_id, stable_id(f"account:{key}"), legal_name, tax_id)


def _document(account: AccountPlan, key: str, file_name: str) -> DocumentPlan:
    return DocumentPlan(
        tenant_id=account.tenant_id,
        account_id=account.account_id,
        document_id=stable_id(f"document:{key}"),
        file_uuid=stable_id(f"file:{key}"),
        file_name=file_name,
        message=PDF_MARKER,
    )


def _line(
    quote_key: str, position: int, concept: str, quantity: str, unit: str, amount: str
) -> QuoteLinePlan:
    return QuoteLinePlan(
        stable_id(f"line:{quote_key}:{position}"),
        position,
        concept,
        quantity,
        unit,
        amount,
    )


def _quote(
    tenant_id: uuid.UUID,
    key: str,
    number: str,
    issued_on: str,
    valid_until: str,
    service: str,
    origin: str,
    destination: str,
    status: str,
    lines: tuple[tuple[str, str, str, str], ...],
) -> QuotePlan:
    return QuotePlan(
        tenant_id=tenant_id,
        quote_id=stable_id(f"quote:{key}"),
        number=number,
        external_id=number,
        issued_on=issued_on,
        valid_until=valid_until,
        service=service,
        origin_place=origin,
        destination_place=destination,
        status=status,
        lines=tuple(
            _line(key, index, concept, quantity, unit, amount)
            for index, (concept, quantity, unit, amount) in enumerate(lines, start=1)
        ),
    )


CAPACITY_ACCOUNT = _account(
    CAPACITY_TENANT_ID,
    "capacity",
    "Cuenta documental Capacity",
    "QA-NIT-CAPACITY-01",
)
CLM_ACCOUNT = _account(
    CLM_TENANT_ID,
    "clm",
    "Cuenta documental CLM",
    "QA-NIT-CLM-01",
)

DOCUMENTS: tuple[DocumentPlan, ...] = (
    _document(CAPACITY_ACCOUNT, "capacity-01", "QA-CAPACITY-DOC-01.pdf"),
    _document(CAPACITY_ACCOUNT, "capacity-02", "QA-CAPACITY-DOC-02.pdf"),
    _document(CAPACITY_ACCOUNT, "capacity-03", "QA-CAPACITY-DOC-03.pdf"),
    _document(CAPACITY_ACCOUNT, "capacity-04", "QA-CAPACITY-DOC-04.pdf"),
    _document(CLM_ACCOUNT, "clm-01", "QA-CLM-DOC-01.pdf"),
    _document(CLM_ACCOUNT, "clm-02", "QA-CLM-DOC-02.pdf"),
)

QUOTES: tuple[QuotePlan, ...] = (
    _quote(
        CAPACITY_TENANT_ID,
        "capacity-01",
        "QA-COT-CAPACITY-01",
        "2026-11-01",
        "2026-12-31",
        "Transporte terrestre interno",
        "Planta QA Norte",
        "Patio QA Sur",
        "pendiente",
        (
            ("Flete terrestre", "1.000", "servicio", "1800000.00"),
            ("Custodia de revision", "2.000", "dia", "250000.00"),
        ),
    ),
    _quote(
        CAPACITY_TENANT_ID,
        "capacity-02",
        "QA-COT-CAPACITY-02",
        "2026-10-20",
        "2026-12-15",
        "Consolidacion interna",
        "Bodega QA Oriente",
        "Puerto QA",
        "aceptada",
        (
            ("Consolidacion", "1.000", "servicio", "3200000.00"),
            ("Etiquetado", "4.000", "bulto", "45000.00"),
        ),
    ),
    _quote(
        CAPACITY_TENANT_ID,
        "capacity-03",
        "QA-COT-CAPACITY-03",
        "2026-10-20",
        "2026-12-15",
        "Distribucion urbana interna",
        "Patio QA Sur",
        "Cliente QA Centro",
        "rechazada",
        (
            ("Distribucion", "1.000", "servicio", "900000.00"),
            ("Recargo nocturno", "3.000", "hora", "80000.00"),
        ),
    ),
    _quote(
        CAPACITY_TENANT_ID,
        "capacity-04",
        "QA-COT-CAPACITY-04",
        "2026-09-01",
        "2026-10-15",
        "Almacenamiento temporal interno",
        "Bodega QA Oriente",
        "Bodega QA Oriente",
        "vencida",
        (
            ("Almacenamiento", "10.000", "dia", "35000.00"),
            ("Inventario", "1.000", "servicio", "180000.00"),
        ),
    ),
    _quote(
        CLM_TENANT_ID,
        "clm-01",
        "QA-COT-CLM-01",
        "2026-11-05",
        "2026-12-20",
        "Carga suelta interna",
        "Muelle QA",
        "Zona franca QA",
        "pendiente",
        (
            ("Manipuleo", "2.000", "tonelada", "640000.00"),
            ("Documentacion interna", "1.000", "servicio", "120000.00"),
        ),
    ),
    _quote(
        CLM_TENANT_ID,
        "clm-02",
        "QA-COT-CLM-02",
        "2026-10-28",
        "2026-12-10",
        "Traslado entre bodegas",
        "Bodega QA Uno",
        "Bodega QA Dos",
        "aceptada",
        (
            ("Traslado", "1.000", "servicio", "1500000.00"),
            ("Escolta interna", "2.000", "turno", "300000.00"),
        ),
    ),
)


def documents_for(tenant_id: uuid.UUID) -> tuple[DocumentPlan, ...]:
    return tuple(item for item in DOCUMENTS if item.tenant_id == tenant_id)


def quotes_for(tenant_id: uuid.UUID) -> tuple[QuotePlan, ...]:
    return tuple(item for item in QUOTES if item.tenant_id == tenant_id)
