"""Modelos ORM del esquema del portal.

Responsabilidad: reflejar en Python las tablas creadas por la migración `0001_foundation`.
La forma exacta del esquema (claves compuestas, restricciones CHECK, índices y políticas RLS)
vive en la migración SQL: estos modelos sirven para consultas y para que los tests puedan sembrar datos.

Decisiones no evidentes:

- Las operaciones (DO) y los eventos son referencias sincronizadas desde Logixtic. El portal no
  los considera fuente de verdad; `OperationRef` guarda identificadores y el último estado conocido.
- Las claves compuestas `(id, tenant_id)` y `(event_id, tenant_id, operation_id)` hacen que PostgreSQL
  rechace referencias cruzadas entre empresas aunque el código de la aplicación falle.
- `visibility = 'internal'` nunca debe llegar a un cliente. Las políticas RLS también lo filtran.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[UUID]:
    return mapped_column(PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())


class Tenant(Base):
    """Empresa cliente. Un tenant agrupa usuarios, operaciones y solicitudes."""

    __tablename__ = "tenants"

    id: Mapped[UUID] = _uuid_pk()
    slug: Mapped[str] = mapped_column(String(63), unique=True)
    legal_name: Mapped[str] = mapped_column(String(200))
    tax_id: Mapped[str] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    segment: Mapped[str | None] = mapped_column(Text)
    account_manager: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Profile(Base):
    """Datos del usuario del portal. El identificador coincide con el `sub` de Supabase Auth."""

    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), server_default="active")
    terms_version_accepted: Mapped[str | None] = mapped_column(Text)
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TenantMembership(Base):
    """Relación usuario–empresa con rol. Es la única fuente válida de tenant y permisos."""

    __tablename__ = "tenant_memberships"

    id: Mapped[UUID] = _uuid_pk()
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE")
    )
    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(30))
    active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OperationRef(Base):
    """Referencia local a una operación (DO) de Logixtic. No sustituye al sistema de origen."""

    __tablename__ = "operation_refs"

    id: Mapped[UUID] = _uuid_pk()
    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE")
    )
    external_system: Mapped[str] = mapped_column(String(30), server_default="logixtic")
    external_id: Mapped[str] = mapped_column(String(100))
    do_number: Mapped[str] = mapped_column(String(40))
    reference: Mapped[str | None] = mapped_column(Text)
    last_known_status: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Campos de presentación (migración 20261113000100). NULL = sin información.
    origin_name: Mapped[str | None] = mapped_column(Text)
    destination_name: Mapped[str | None] = mapped_column(Text)
    transport_type: Mapped[str | None] = mapped_column(Text)
    etd: Mapped[date | None] = mapped_column()
    eta: Mapped[date | None] = mapped_column()
    booking_number: Mapped[str | None] = mapped_column(Text)
    carrier_name: Mapped[str | None] = mapped_column(Text)
    responsible_name: Mapped[str | None] = mapped_column(Text)
    pending_client_response: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OperationEvent(Base):
    """Evento de seguimiento de una operación, sincronizado desde Logixtic."""

    __tablename__ = "operation_events"

    id: Mapped[UUID] = _uuid_pk()
    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE")
    )
    operation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True))
    external_event_id: Mapped[str] = mapped_column(Text)
    event_type: Mapped[str] = mapped_column(String(30))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    author_name: Mapped[str | None] = mapped_column(Text)
    from_status: Mapped[str | None] = mapped_column(Text)
    to_status: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(20), server_default="client")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EventComment(Base):
    """Comentario o respuesta vinculado a un evento. No cambia el estado de la operación."""

    __tablename__ = "event_comments"

    id: Mapped[UUID] = _uuid_pk()
    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE")
    )
    operation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True))
    event_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True))
    parent_comment_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    author_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("profiles.id"))
    author_name: Mapped[str] = mapped_column(String(120))
    author_side: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(20), server_default="client")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Request(Base):
    """Solicitud de un cliente a su equipo de operaciones."""

    __tablename__ = "requests"

    id: Mapped[UUID] = _uuid_pk()
    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE")
    )
    number: Mapped[str] = mapped_column(String(30))
    request_type: Mapped[str] = mapped_column(String(40))
    subject: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    operation_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), server_default="recibida")
    created_by: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Attachment(Base):
    """Metadatos de un archivo adjunto. La ruta de almacenamiento nunca se expone al cliente."""

    __tablename__ = "attachments"

    id: Mapped[UUID] = _uuid_pk()
    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE")
    )
    request_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    storage_path: Mapped[str] = mapped_column(Text, unique=True)
    file_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), server_default="pending")
    uploaded_by: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
