"""Motor, sesiones y contexto de seguridad de base de datos.

Responsabilidad: crear el motor SQLAlchemy y, para cada petición autenticada, activar el contexto que
PostgreSQL necesita para aplicar Row Level Security:

1. `SET LOCAL ROLE <database_app_role>`: las consultas se ejecutan como `portal_app`, un rol sin
   BYPASSRLS. Así las políticas se aplican aunque la conexión tenga privilegios más altos.
2. `set_config('app.current_user_id', <uuid>, true)`: identifica a la persona autenticada para las
   políticas (`portal_current_user_id()`).

Ambos ajustes son `LOCAL`: solo duran la transacción actual y no se filtran a otras peticiones
que reutilicen la misma conexión del pool.

Restricciones: el nombre del rol se valida con una expresión regular antes de interpolarse.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from uuid import UUID

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings

_ROLE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def create_db_engine(settings: Settings) -> Engine:
    return create_engine(settings.database_url, pool_pre_ping=True, future=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def activate_request_security(session: Session, *, app_role: str, user_id: UUID | None) -> None:
    """Aplica rol de aplicación e identidad a la transacción actual.

    Debe llamarse antes de cualquier consulta de usuario.
    """
    if not _ROLE_NAME.match(app_role):
        raise ValueError("Nombre de rol de base de datos no válido.")
    session.execute(text(f'SET LOCAL ROLE "{app_role}"'))
    session.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"),
        {"uid": str(user_id) if user_id is not None else ""},
    )


def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """Generador usado por la dependencia de FastAPI: abre una sesión y la cierra siempre."""
    session = factory()
    try:
        yield session
    finally:
        session.close()
