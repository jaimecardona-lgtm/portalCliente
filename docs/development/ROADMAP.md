# Roadmap de desarrollo integral

## Orden de entrega

1. Estabilizar navegación, contexto administrativo y aislamiento de caché.
2. Completar el flujo vertical: tenant → Torre de control → Operaciones → detalle DO → Cuenta → Logix.
3. Validar y aplicar de forma revisada la migración de solicitudes QA; demostrar persistencia real.
4. Completar Logix con herramientas de solo lectura y, tras autorización externa, modelo generativo.
5. Completar Documentos y Cotizaciones con PostgreSQL y Storage.
6. Implementar adaptadores para la fuente oficial de Logixtic sin cambiar los UUID internos de los nueve tenants.
7. Cerrar experiencia responsive, accesibilidad y despliegue Render.

Cada etapa exige pruebas, evidencia observable y un commit local revisable. Ninguna integración se considera terminada solo por compilar.

