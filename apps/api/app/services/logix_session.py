"""Memoria de Logix en el proceso. La clave es usuario y empresa; el navegador no la envía.

No hay tabla de conversación. Al cambiar de empresa la clave cambia y el foco anterior no se lee.
Caduca a los 30 minutos y conserva como máximo seis turnos.
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

from app.services.logix_intent import Focus

_TTL_SECONDS = 30 * 60
_MAX_TURNS = 6


@dataclass
class _Bucket:
    turns: deque[tuple[float, Focus]]


class ConversationMemory:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._items: dict[tuple[UUID, UUID], _Bucket] = {}

    def focus(self, user_id: UUID, tenant_id: UUID) -> Focus | None:
        bucket = self._items.get((user_id, tenant_id))
        if bucket is None:
            return None
        now = self._clock()
        fresh = deque(turn for turn in bucket.turns if now - turn[0] <= _TTL_SECONDS)
        bucket.turns = fresh
        if not fresh:
            self._items.pop((user_id, tenant_id), None)
            return None
        return fresh[-1][1]

    def remember(self, user_id: UUID, tenant_id: UUID, focus: Focus) -> None:
        key = (user_id, tenant_id)
        bucket = self._items.setdefault(key, _Bucket(deque()))
        now = self._clock()
        bucket.turns.append((now, focus))
        while len(bucket.turns) > _MAX_TURNS:
            bucket.turns.popleft()


MEMORY = ConversationMemory()
