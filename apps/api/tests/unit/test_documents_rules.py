"""Reglas puras de documentos: validación de archivo y ruta interna. No requieren base de datos."""

from __future__ import annotations

import io
import zipfile
from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.services.documents import MAX_BYTES, build_object_path, validate_file

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
    return buf.getvalue()


def _code(exc_info: pytest.ExceptionInfo[AppError]) -> tuple[str, int]:
    return exc_info.value.code, exc_info.value.status_code


def test_pdf_valido_produce_hash_tamano_y_extension_de_almacenamiento() -> None:
    v = validate_file(PDF, "application/pdf", "factura.PDF")
    assert v.file_name == "factura.PDF"
    assert v.extension == ".pdf"
    assert v.size_bytes == len(PDF)
    assert len(v.sha256) == 64


@pytest.mark.parametrize(
    "data,mime,name,code,status",
    [
        (b"", "application/pdf", "a.pdf", "file_empty", 422),
        (b"%PDF-" + b"0" * MAX_BYTES, "application/pdf", "a.pdf", "file_too_large", 413),
        (PDF, "text/html", "a.pdf", "unsupported_type", 415),
        (PDF, "application/pdf", "a.exe", "extension_mismatch", 415),
        (b"<html>no es pdf</html>", "application/pdf", "a.pdf", "content_mismatch", 415),
        (PNG, "image/jpeg", "a.jpg", "content_mismatch", 415),
        (b"PK\x03\x04 sin estructura", XLSX_MIME, "a.xlsx", "content_mismatch", 415),
        (PDF, "application/pdf", "../../etc/passwd.pdf\x00", "invalid_file_name", 422),
        (PDF, "application/pdf", "x" * 201 + ".pdf", "invalid_file_name", 422),
    ],
)
def test_archivos_no_admitidos_se_rechazan_con_codigo_claro(data, mime, name, code, status) -> None:
    with pytest.raises(AppError) as info:
        validate_file(data, mime, name)
    assert _code(info) == (code, status)


def test_nombre_con_rutas_se_reduce_al_nombre_base() -> None:
    v = validate_file(PDF, "application/pdf", r"..\..\carpeta\contrato.pdf")
    assert v.file_name == "contrato.pdf"


def test_xlsx_valido_requiere_estructura_de_hoja_de_calculo() -> None:
    v = validate_file(_xlsx(), XLSX_MIME, "pedido.xlsx")
    assert v.extension == ".xlsx"


def test_ruta_interna_usa_solo_uuid_y_prefijos_jerarquicos() -> None:
    ids = [uuid4() for _ in range(5)]
    path = build_object_path(ids[0], ids[1], ids[2], ids[3], ids[4], ".pdf")
    assert path == (f"tenants/{ids[0]}/clients/{ids[1]}/operations/{ids[2]}/documents/{ids[3]}/{ids[4]}.pdf")


def test_ruta_no_admite_extensiones_fuera_de_la_lista() -> None:
    ids = [uuid4() for _ in range(5)]
    with pytest.raises(ValueError):
        build_object_path(ids[0], ids[1], ids[2], ids[3], ids[4], ".exe")
