"""Entorno de ejecución de Alembic.

La URL se toma de `sqlalchemy.url` si se pasa explícitamente (los tests lo hacen) o de la configuración
de la aplicación. Las migraciones se ejecutan en modo online, con una transacción por migración.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.core.config import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Las migraciones usan SQL explícito (ver migrations/versions/): no hay metadatos que comparar.
target_metadata = None


def _database_url() -> str:
    explicit = config.get_main_option("sqlalchemy.url")
    return explicit or get_settings().database_url


def run_migrations_online() -> None:
    engine = create_engine(_database_url(), future=True)
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, transaction_per_migration=True
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    raise RuntimeError("Este proyecto solo admite migraciones en modo online.")
run_migrations_online()
