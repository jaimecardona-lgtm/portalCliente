"""Dobles de prueba. Solo para pruebas automatizadas aisladas: nunca se usan en la aplicación en ejecución."""

from __future__ import annotations

from app.services.storage import StorageError


class FakeObjectStorage:
    """Almacenamiento en memoria con interruptores para simular fallos."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.uploads: list[str] = []
        self.deleted: list[str] = []
        self.fail_upload = False
        self.fail_delete = False
        self.fail_sign = False

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        if self.fail_upload:
            raise StorageError("subida", 500)
        if path in self.objects:
            raise StorageError("subida", 409)
        self.objects[path] = data
        self.uploads.append(path)

    def sign_download(self, path: str, expires_in: int) -> str:
        if self.fail_sign or path not in self.objects:
            raise StorageError("firma", 404)
        return (
            f"https://storage.fake.test/storage/v1/object/sign/{path}?token=TOKEN-FALSO&expires={expires_in}"
        )

    def delete(self, paths: list[str]) -> None:
        if self.fail_delete:
            raise StorageError("borrado", 500)
        for path in paths:
            self.objects.pop(path, None)
        self.deleted.extend(paths)
