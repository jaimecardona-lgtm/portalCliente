-- PROPUESTA · NO EJECUTADA. Requiere autorización explícita del responsable antes de correr en remoto.
-- Cambia el rol de la cuenta QA existente a platform_admin, conservando el alcance qa_synthetic_only.
-- No crea empresas, no toca operaciones, no modifica verified_at ni external_tenant_id, no altera RLS.
-- Ejecutar con la cuenta de propietario en el SQL Editor del proyecto correcto. Sustituir <UUID_CUENTA_QA>.
-- Idempotente: si ya es platform_admin con alcance QA, no cambia nada.

-- 1. Estado previo (solo lectura).
SELECT user_id, staff_role, tenant_scope, active
FROM platform_staff
WHERE user_id = '<UUID_CUENTA_QA>'::uuid;

-- 2. Cambio de rol. Solo cuentas activas que hoy son qa; el CHECK de la tabla acepta platform_admin.
UPDATE platform_staff
SET staff_role = 'platform_admin',
    scope_authorized_by = COALESCE(scope_authorized_by, 'Administrador QA autorizado por el responsable del proyecto')
WHERE user_id = '<UUID_CUENTA_QA>'::uuid
  AND active
  AND staff_role = 'qa';

-- 3. Verificación (solo lectura): debe mostrar platform_admin, qa_synthetic_only y active = true.
SELECT s.staff_role, s.tenant_scope, s.active,
       (SELECT count(*) FROM tenants WHERE segment = 'QA_SYNTHETIC_ONLY') AS empresas_qa
FROM platform_staff s
WHERE s.user_id = '<UUID_CUENTA_QA>'::uuid;
