-- Cambio de empresa de trabajo con reautenticación (aditiva).
-- - Desafío por intento de cambio: vinculado a usuario, empresa, caducidad y un solo uso.
-- - Reautenticación: el token nuevo de Supabase con amr 'password' reciente; cada token se usa una vez.
-- - La auditoría registra quién, origen, destino, cuándo y la hora de la reautenticación.
-- No elimina historial. La columna reason se conserva (filas antiguas intactas); los cambios nuevos no la piden.

CREATE TABLE staff_context_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES platform_staff (user_id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX staff_context_challenges_user_idx ON staff_context_challenges (user_id, created_at);

-- Cada token de reautenticación (huella SHA-256) se usa una sola vez.
CREATE TABLE staff_reauth_uses (
  user_id uuid NOT NULL REFERENCES platform_staff (user_id) ON DELETE CASCADE,
  token_fingerprint text NOT NULL CHECK (char_length(token_fingerprint) = 64),
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token_fingerprint)
);

ALTER TABLE staff_context_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_reauth_uses ENABLE ROW LEVEL SECURITY;
-- Sin políticas para portal_app: solo las funciones SECURITY DEFINER escriben y leen estas tablas.

ALTER TABLE staff_access_audit ADD COLUMN reauthenticated_at timestamptz;

CREATE OR REPLACE FUNCTION portal_request_context_challenge(p_tenant uuid)
RETURNS TABLE (challenge_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := portal_current_user_id();
  v_expires timestamptz := now() + interval '5 minutes';
  v_id uuid;
BEGIN
  IF v_user IS NULL OR portal_current_staff_role() IS NULL THEN
    RAISE EXCEPTION 'staff_required' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_tenant IN (SELECT portal_staff_scope_tenant_ids())) THEN
    RAISE EXCEPTION 'tenant_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM staff_context_challenges c
       WHERE c.user_id = v_user AND c.created_at > now() - interval '15 minutes') >= 10 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;
  INSERT INTO staff_context_challenges (user_id, tenant_id, expires_at)
  VALUES (v_user, p_tenant, v_expires)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_expires;
END
$$;

CREATE OR REPLACE FUNCTION portal_confirm_context_change(
  p_challenge uuid, p_reauth_at timestamptz, p_token_fingerprint text, p_previous uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := portal_current_user_id();
  c staff_context_challenges%ROWTYPE;
BEGIN
  IF v_user IS NULL OR portal_current_staff_role() IS NULL THEN
    RAISE EXCEPTION 'staff_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM staff_context_challenges WHERE id = p_challenge AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.expires_at < now() THEN
    RAISE EXCEPTION 'challenge_invalid' USING ERRCODE = '42501';
  END IF;
  -- La reautenticación debe ser posterior al desafío y reciente (ventana de 5 minutos).
  IF p_reauth_at < c.created_at - interval '1 minute' OR p_reauth_at < now() - interval '5 minutes'
     OR p_reauth_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'reauth_stale' USING ERRCODE = '42501';
  END IF;
  IF NOT (c.tenant_id IN (SELECT portal_staff_scope_tenant_ids())) THEN
    RAISE EXCEPTION 'tenant_not_authorized' USING ERRCODE = '42501';
  END IF;
  BEGIN
    INSERT INTO staff_reauth_uses (user_id, token_fingerprint) VALUES (v_user, p_token_fingerprint);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'reauth_reused' USING ERRCODE = '42501';
  END;
  UPDATE staff_context_challenges SET consumed_at = now() WHERE id = c.id;
  RETURN c.tenant_id;
END
$$;

REVOKE ALL ON FUNCTION portal_request_context_challenge(uuid), portal_confirm_context_change(uuid, timestamptz, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_request_context_challenge(uuid), portal_confirm_context_change(uuid, timestamptz, text, uuid)
  TO portal_app;
