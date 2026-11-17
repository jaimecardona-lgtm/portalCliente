# Plan de integración oficial Logixtic

## Principios

- Conservar los nueve UUID de tenant existentes.
- Añadir una correspondencia verificada entre cada UUID y el identificador oficial externo.
- No asumir que rutas internas del SaaS son una API pública.
- Nunca sincronizar registros QA hacia el SaaS original.
- Identificar el origen de cada registro y no mezclar QA con datos oficiales sin señalización.

## Contrato del adaptador

El adaptador autorizado deberá ofrecer lectura paginada de operaciones, detalle, eventos y referencias; cursores de sincronización incremental; identificadores estables de origen; reintentos idempotentes; métricas de errores y conciliación.

## Secuencia segura

1. Obtener documentación y autorización del mecanismo oficial.
2. Verificar identidad e identificador externo de cada empresa sin escribirlos automáticamente.
3. Probar mapeos en un entorno aislado y registrar diferencias de estados, fechas y referencias.
4. Ejecutar sincronización en sombra y comparar conteos.
5. Autorizar por tenant una sustitución reversible de la fuente QA.
6. Conservar auditoría, usuarios, roles y configuración del portal.

