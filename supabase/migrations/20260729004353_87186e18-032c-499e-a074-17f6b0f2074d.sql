DO $mig$
DECLARE existing uuid;
BEGIN
  SELECT id INTO existing FROM vault.secrets WHERE name = 'linkup_push_worker_secret';
  IF existing IS NULL THEN
    PERFORM vault.create_secret('a8820d3b75805d8bd8ca05a8b9b05fb26fca96b24ec34c50f4b541abdff42b80', 'linkup_push_worker_secret', 'Shared secret for pg_net to authenticate appointment-push worker');
  ELSE
    PERFORM vault.update_secret(existing, 'a8820d3b75805d8bd8ca05a8b9b05fb26fca96b24ec34c50f4b541abdff42b80', 'linkup_push_worker_secret', 'Shared secret for pg_net to authenticate appointment-push worker');
  END IF;
END $mig$;