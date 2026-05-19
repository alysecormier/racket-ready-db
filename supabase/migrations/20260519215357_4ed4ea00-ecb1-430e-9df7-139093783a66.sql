
-- 1) Remove profiles.role column (use user_roles instead)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- 2) Trigger to restrict sensitive column writes on profiles
CREATE OR REPLACE FUNCTION public.guard_profiles_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_coach boolean := public.has_role(auth.uid(), 'coach'::app_role);
BEGIN
  IF is_coach OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Block changes to sensitive fields
  IF NEW.waiver_signed IS DISTINCT FROM OLD.waiver_signed THEN
    RAISE EXCEPTION 'waiver_signed cannot be modified directly';
  END IF;
  IF NEW.waiver_signature IS DISTINCT FROM OLD.waiver_signature THEN
    RAISE EXCEPTION 'waiver_signature cannot be modified directly';
  END IF;
  IF NEW.waiver_signed_at IS DISTINCT FROM OLD.waiver_signed_at THEN
    RAISE EXCEPTION 'waiver_signed_at cannot be modified directly';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'stripe_customer_id cannot be modified directly';
  END IF;
  IF NEW.default_payment_method_id IS DISTINCT FROM OLD.default_payment_method_id THEN
    RAISE EXCEPTION 'default_payment_method_id cannot be modified directly';
  END IF;
  IF NEW.saved_card_last4 IS DISTINCT FROM OLD.saved_card_last4 THEN
    RAISE EXCEPTION 'saved_card_last4 cannot be modified directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_sensitive ON public.profiles;
CREATE TRIGGER profiles_guard_sensitive
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_sensitive_columns();

-- Also guard INSERT: ensure non-coach users can't seed sensitive fields
CREATE OR REPLACE FUNCTION public.guard_profiles_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_coach boolean := public.has_role(auth.uid(), 'coach'::app_role);
BEGIN
  IF is_coach OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.waiver_signed := false;
  NEW.waiver_signature := NULL;
  NEW.waiver_signed_at := NULL;
  NEW.stripe_customer_id := NULL;
  NEW.default_payment_method_id := NULL;
  NEW.saved_card_last4 := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_insert ON public.profiles;
CREATE TRIGGER profiles_guard_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_insert();

-- 3) Trigger to block payment forgery on bookings
CREATE OR REPLACE FUNCTION public.guard_bookings_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_coach boolean := public.has_role(auth.uid(), 'coach'::app_role);
BEGIN
  IF is_coach OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.payment_status := 'pending';
    NEW.cancellation_status := 'active';
    NEW.stripe_payment_intent_id := NULL;
    NEW.stripe_payment_method_id := NULL;
    NEW.canceled_at := NULL;
    NEW.reminder_sent_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: prevent changing sensitive financial/state fields
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'payment_status cannot be modified directly';
  END IF;
  IF NEW.cancellation_status IS DISTINCT FROM OLD.cancellation_status THEN
    RAISE EXCEPTION 'cancellation_status cannot be modified directly';
  END IF;
  IF NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id THEN
    RAISE EXCEPTION 'stripe_payment_intent_id cannot be modified directly';
  END IF;
  IF NEW.stripe_payment_method_id IS DISTINCT FROM OLD.stripe_payment_method_id THEN
    RAISE EXCEPTION 'stripe_payment_method_id cannot be modified directly';
  END IF;
  IF NEW.canceled_at IS DISTINCT FROM OLD.canceled_at THEN
    RAISE EXCEPTION 'canceled_at cannot be modified directly';
  END IF;
  IF NEW.reminder_sent_at IS DISTINCT FROM OLD.reminder_sent_at THEN
    RAISE EXCEPTION 'reminder_sent_at cannot be modified directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_guard_payment ON public.bookings;
CREATE TRIGGER bookings_guard_payment
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_bookings_payment_fields();

-- 4) Revoke EXECUTE on has_role from authenticated/anon/public.
-- RLS policies run as table owner, so they keep working.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
