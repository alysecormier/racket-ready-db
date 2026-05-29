CREATE OR REPLACE FUNCTION public.guard_profiles_sensitive_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_coach boolean := public.has_role(auth.uid(), 'coach'::app_role);
  is_owner boolean := auth.uid() = OLD.id;
BEGIN
  IF is_coach OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow account owner to sign their own waiver (transition unsigned -> signed)
  IF is_owner
     AND OLD.waiver_signed = false
     AND NEW.waiver_signed = true
     AND NEW.waiver_signature IS NOT NULL
     AND length(trim(NEW.waiver_signature)) >= 2 THEN
    -- Allow this transition; block other sensitive field changes below
    NULL;
  ELSE
    IF NEW.waiver_signed IS DISTINCT FROM OLD.waiver_signed THEN
      RAISE EXCEPTION 'waiver_signed cannot be modified directly';
    END IF;
    IF NEW.waiver_signature IS DISTINCT FROM OLD.waiver_signature THEN
      RAISE EXCEPTION 'waiver_signature cannot be modified directly';
    END IF;
    IF NEW.waiver_signed_at IS DISTINCT FROM OLD.waiver_signed_at THEN
      RAISE EXCEPTION 'waiver_signed_at cannot be modified directly';
    END IF;
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
$function$;