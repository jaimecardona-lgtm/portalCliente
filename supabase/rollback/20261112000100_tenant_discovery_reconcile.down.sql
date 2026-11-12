-- REVERSIÓN de 20261112000100_tenant_discovery_reconcile. NO está en supabase/migrations.
--
-- Deliberadamente vacía. La tabla public.logixtic_tenant_discovery y sus nueve nombres observados existían antes
-- de esta migración (creación manual en Supabase SQL Editor). Revertirla no debe borrar esos registros.
-- Si el responsable decide retirar el catálogo, debe hacerlo con una copia de seguridad y una decisión explícita,
-- nunca como parte de una reversión automática.
SELECT 'La reconciliación no tiene reversión destructiva. Ver el comentario de este archivo.' AS nota;
