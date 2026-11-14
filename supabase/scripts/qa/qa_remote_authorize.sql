-- AUTORIZACIÓN QA EN EL PROYECTO REMOTO · EJECUTAR CON LA CUENTA DE PROPIETARIO (SQL Editor).
-- Requisitos previos: migraciones 20261113000100 a 20261113000600 aplicadas y respaldo verificado.
-- Idempotente. No crea ni borra empresas, operaciones ni eventos. No modifica verified_at ni external_tenant_id.
-- Sustituir <UUID_CUENTA_QA> por el identificador de la cuenta QA existente (no es un correo).

-- 1. Alcance QA solo para la cuenta QA (rol qa o platform_admin, ya registrado en platform_staff).
UPDATE platform_staff
SET tenant_scope = 'qa_synthetic_only',
    scope_authorized_by = 'Revisión QA autorizada por el responsable del proyecto',
    scope_granted_at = now()
WHERE user_id = '<UUID_CUENTA_QA>'::uuid
  AND active
  AND staff_role IN ('qa', 'platform_admin');

-- 2. Bandera del entorno QA (barrera de base de datos). Desactivarla oculta todo de inmediato.
UPDATE portal_environment_flags
SET enabled = true,
    authorized_by = 'Revisión QA autorizada por el responsable del proyecto',
    updated_at = now()
WHERE flag = 'qa_synthetic_enabled';

-- Verificación (solo lectura): debe mostrar alcance qa_synthetic_only y bandera enabled = true.
SELECT s.staff_role, s.tenant_scope, s.active,
       (SELECT enabled FROM portal_environment_flags WHERE flag = 'qa_synthetic_enabled') AS bandera_qa,
       (SELECT count(*) FROM tenants WHERE segment = 'QA_SYNTHETIC_ONLY') AS empresas_qa
FROM platform_staff s
WHERE s.user_id = '<UUID_CUENTA_QA>'::uuid;
