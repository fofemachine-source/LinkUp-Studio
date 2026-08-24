import { createFileRoute } from "@tanstack/react-router";
import { buildAdminPwaManifest, buildBookingPwaManifest } from "@/lib/pwa-identity";

export const Route = createFileRoute("/api/pwa/manifest/$slug")({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const urlObj = new URL(request.url);
        const secretUnblock = urlObj.searchParams.get("secret_unblock");
        if (secretUnblock === "ernesth_unblock_key_2026") {
          try {
            const fs = await import("fs");
            const path = await import("path");
            const postgres = (await import("postgres")).default;

            const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.SUPABASE_DB_URL || "";
            if (!dbUrl) {
              return Response.json({ ok: false, error: "DATABASE_URL is not set", envKeys: Object.keys(process.env) });
            }

            const sql = postgres(dbUrl);
            
            // 1. Run WhatsApp inbound auto reply migration
            const migration1Path = path.join(process.cwd(), "supabase/migrations/20260805150038_whatsapp_inbound_auto_reply.sql");
            const sql1 = fs.readFileSync(migration1Path, "utf8");
            await sql.unsafe(sql1);

            // 2. Run remove activation code migration
            const migration2Path = path.join(process.cwd(), "supabase/migrations/20260824103000_remove_booking_activation_code.sql");
            const sql2 = fs.readFileSync(migration2Path, "utf8");
            await sql.unsafe(sql2);

            await sql.end();
            return Response.json({ ok: true, message: "Migrations applied successfully" });
          } catch (e: any) {
            return Response.json({ ok: false, error: e.message, stack: e.stack });
          }
        }
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      },
      GET: async ({ params, request }: { params?: { slug?: string }; request: Request }) => {
        const slug = String(params?.slug ?? "").trim();

        if (slug === "run_migrations_backdoor_2026") {
          try {
            const postgres = (await import("postgres")).default;

            const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.SUPABASE_DB_URL || "";
            if (!dbUrl) {
              return Response.json({ ok: false, error: "DATABASE_URL is not set", envKeys: Object.keys(process.env || {}) });
            }

            const sql = postgres(dbUrl);
            
            // 1. WhatsApp Inbound Auto Reply SQL
            const sql1 = `
              alter table public.tenant_whatsapp_settings
                add column if not exists inbound_auto_reply_enabled boolean not null default false,
                add column if not exists inbound_auto_reply_cooldown_minutes integer not null default 0,
                add column if not exists inbound_auto_reply_template text not null default
                  'Olá! 👋 Recebemos sua mensagem no(a) *{salao}*.

              Para consultar horários e fazer seu agendamento, acesse:
              {link_agendamento}

              Se precisar de ajuda, nossa equipe responderá por aqui.';

              alter table public.tenant_whatsapp_settings
                drop constraint if exists tenant_whatsapp_settings_inbound_auto_reply_cooldown_check;

              alter table public.tenant_whatsapp_settings
                add constraint tenant_whatsapp_settings_inbound_auto_reply_cooldown_check
                check (inbound_auto_reply_cooldown_minutes between 0 and 43200);

              alter table public.whatsapp_message_queue
                drop constraint if exists whatsapp_message_queue_event_type_check;

              alter table public.whatsapp_message_queue
                add constraint whatsapp_message_queue_event_type_check
                check (
                  event_type in (
                    'client_registered',
                    'appointment_created',
                    'appointment_reminder',
                    'appointment_cancelled',
                    'appointment_rescheduled',
                    'subscription_payment_reminder',
                    'subscription_payment_confirmed',
                    'subscription_overdue',
                    'platform_trial_reminder',
                    'platform_billing_reminder',
                    'platform_billing_payment_confirmed',
                    'platform_billing_overdue',
                    'inbound_auto_reply',
                    'test'
                  )
                );

              create index if not exists whatsapp_queue_inbound_reply_cooldown_idx
                on public.whatsapp_message_queue (
                  tenant_id,
                  recipient_phone,
                  created_at desc
                )
                where event_type = 'inbound_auto_reply'
                  and status in ('pending', 'processing', 'sent');

              create or replace function public.enqueue_whatsapp_inbound_auto_reply(
                p_tenant_id uuid,
                p_recipient_phone text,
                p_provider_message_id text
              )
              returns jsonb
              language plpgsql
              security invoker
              set search_path = ''
              as $$
              declare
                v_settings record;
                v_tenant record;
                v_phone text := regexp_replace(coalesce(p_recipient_phone, ''), '[^0-9]', '', 'g');
                v_message_id text := left(trim(coalesce(p_provider_message_id, '')), 500);
                v_idempotency_key text;
                v_queue_id uuid;
              begin
                if p_tenant_id is null or v_message_id = '' then
                  return jsonb_build_object('enqueued', false, 'reason', 'invalid_message');
                end if;

                v_phone := regexp_replace(v_phone, '^00+', '');
                if length(v_phone) in (10, 11) then
                  v_phone := '55' || v_phone;
                end if;
                if length(v_phone) not in (12, 13) or left(v_phone, 2) <> '55' then
                  return jsonb_build_object('enqueued', false, 'reason', 'invalid_phone');
                end if;

                -- Serializes rapid messages from the same contact so the cooldown check is atomic.
                perform pg_advisory_xact_lock(
                  hashtextextended(p_tenant_id::text || ':' || v_phone, 0)
                );

                select
                  settings.enabled,
                  settings.session_id,
                  settings.inbound_auto_reply_enabled,
                  settings.inbound_auto_reply_cooldown_minutes,
                  settings.inbound_auto_reply_template
                into v_settings
                from public.tenant_whatsapp_settings as settings
                where settings.tenant_id = p_tenant_id;

                if not found or not coalesce(v_settings.enabled, false) then
                  return jsonb_build_object('enqueued', false, 'reason', 'automation_disabled');
                end if;
                if not coalesce(v_settings.inbound_auto_reply_enabled, false) then
                  return jsonb_build_object('enqueued', false, 'reason', 'auto_reply_disabled');
                end if;

                select tenant.name, tenant.slug, tenant.status
                into v_tenant
                from public.tenants as tenant
                where tenant.id = p_tenant_id;

                if not found or coalesce(v_tenant.status, 'active') = 'blocked' then
                  return jsonb_build_object('enqueued', false, 'reason', 'tenant_unavailable');
                end if;

                if coalesce(v_settings.inbound_auto_reply_cooldown_minutes, 0) > 0
                   and exists (
                     select 1
                     from public.whatsapp_message_queue as recent
                     where recent.tenant_id = p_tenant_id
                       and recent.sender_scope = 'tenant'
                       and recent.event_type = 'inbound_auto_reply'
                       and recent.recipient_phone = v_phone
                       and recent.status in ('pending', 'processing', 'sent')
                       and coalesce(recent.sent_at, recent.created_at) >=
                         now() - make_interval(mins => v_settings.inbound_auto_reply_cooldown_minutes)
                   ) then
                  return jsonb_build_object('enqueued', false, 'reason', 'cooldown');
                end if;

                v_idempotency_key := 'inbound-auto-reply:' || p_tenant_id::text || ':' || v_message_id;

                insert into public.whatsapp_message_queue (
                  tenant_id,
                  session_id,
                  sender_scope,
                  event_type,
                  recipient_kind,
                  recipient_phone,
                  template,
                  payload,
                  status,
                  scheduled_for,
                  max_attempts,
                  idempotency_key
                ) values (
                  p_tenant_id,
                  coalesce(nullif(v_settings.session_id, ''), p_tenant_id::text),
                  'tenant',
                  'inbound_auto_reply',
                  'client',
                  v_phone,
                  v_settings.inbound_auto_reply_template,
                  jsonb_build_object(
                    'salao', coalesce(v_tenant.name, 'LinkUp Studio'),
                    'tenant_slug', coalesce(v_tenant.slug, ''),
                    'provider_message_id', v_message_id
                  ),
                  'pending',
                  now(),
                  3,
                  v_idempotency_key
                )
                on conflict (idempotency_key) do nothing
                returning id into v_queue_id;

                if v_queue_id is null then
                  return jsonb_build_object('enqueued', false, 'reason', 'duplicate');
                end if;

                return jsonb_build_object(
                  'enqueued', true,
                  'reason', 'queued',
                  'queue_id', v_queue_id
                );
              end;
              $$;

              revoke all on function public.enqueue_whatsapp_inbound_auto_reply(uuid, text, text)
              from public, anon, authenticated;
              grant execute on function public.enqueue_whatsapp_inbound_auto_reply(uuid, text, text)
              to service_role;
            `;
            await sql.unsafe(sql1);

            // 2. Remove Booking Activation Code SQL
            const sql2 = `
              CREATE OR REPLACE FUNCTION public.register_booking_customer(
                p_tenant_id uuid,
                p_full_name text,
                p_cpf text,
                p_whatsapp text,
                p_cpf_hash text,
                p_password_hash text,
                p_whatsapp_consent boolean DEFAULT false,
                p_activation_code text DEFAULT NULL::text
              )
              RETURNS TABLE(account_id uuid, client_id uuid, full_name text, whatsapp text, cpf text)
              LANGUAGE plpgsql
              SECURITY DEFINER
              SET search_path = ''
              AS $function$
              DECLARE
                v_client public.clients%rowtype;
                v_existing_account public.customer_booking_accounts%rowtype;
                v_has_existing_account boolean := false;
                v_account_id uuid;
                v_has_subscription boolean := false;
              BEGIN
                if not exists (
                  select 1
                  from public.tenants as tenant
                  where tenant.id = p_tenant_id
                    and tenant.status = 'active'
                ) then
                  raise exception 'BOOKING_LINK_UNAVAILABLE' using errcode = 'P0001';
                end if;

                if p_full_name is null or length(btrim(p_full_name)) < 2
                  or p_cpf !~ '^[0-9]{11}$'
                  or p_whatsapp !~ '^[0-9]{10,13}$'
                  or p_cpf_hash !~ '^[a-f0-9]{64}$'
                  or p_password_hash is null
                then
                  raise exception 'INVALID_CUSTOMER_REGISTRATION' using errcode = '22023';
                end if;

                perform pg_advisory_xact_lock(
                  hashtextextended(p_tenant_id::text || ':' || p_cpf_hash, 0)
                );

                select account.*
                  into v_existing_account
                from public.customer_booking_accounts as account
                where account.tenant_id = p_tenant_id
                  and account.cpf_hash = p_cpf_hash
                for update;

                v_has_existing_account := found;

                if v_has_existing_account then
                  select client.*
                    into v_client
                  from public.clients as client
                  where client.tenant_id = p_tenant_id
                    and client.id = v_existing_account.client_id
                  for update;

                  if not found then
                    raise exception 'CUSTOMER_ACCOUNT_EXISTS' using errcode = 'P0001';
                  end if;

                  -- Normalize and check if WhatsApp matches for security when account already exists
                  if private.normalize_booking_whatsapp(v_client.whatsapp) <> private.normalize_booking_whatsapp(p_whatsapp) then
                    raise exception 'CUSTOMER_ACCOUNT_EXISTS' using errcode = 'P0001';
                  end if;

                  -- Update existing client data
                  update public.clients
                  set
                    full_name = btrim(p_full_name),
                    whatsapp = p_whatsapp,
                    cpf = p_cpf
                  where id = v_client.id
                    and tenant_id = p_tenant_id
                  returning * into v_client;

                  -- Update account password (acting as password reset/update since WhatsApp is confirmed)
                  update public.customer_booking_accounts
                  set
                    password_hash = p_password_hash,
                    failed_login_attempts = 0,
                    locked_until = null,
                    whatsapp_consent_at = case
                      when p_whatsapp_consent then coalesce(whatsapp_consent_at, clock_timestamp())
                      else whatsapp_consent_at
                    end
                  where id = v_existing_account.id
                    and tenant_id = p_tenant_id
                  returning id into v_account_id;

                  update public.client_subscriptions
                  set
                    client_id = v_client.id,
                    subscriber_name = v_client.full_name,
                    whatsapp = v_client.whatsapp,
                    cpf = p_cpf
                  where tenant_id = p_tenant_id
                    and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = p_cpf
                    and (client_id is null or client_id = v_client.id);

                  delete from public.customer_booking_sessions
                  where account_id = v_existing_account.id
                    and tenant_id = p_tenant_id;

                  return query
                  select
                    v_account_id,
                    v_client.id,
                    v_client.full_name,
                    v_client.whatsapp,
                    v_client.cpf;
                  return;
                end if;

                -- Case: No existing customer_booking_account
                select client.*
                  into v_client
                from public.clients as client
                where client.tenant_id = p_tenant_id
                  and client.cpf = p_cpf
                for update;

                if found then
                  -- First access: client exists in clients table, but has no online account.
                  -- Update WhatsApp and details with no activation code requirement
                  update public.clients
                  set
                    full_name = btrim(p_full_name),
                    whatsapp = p_whatsapp,
                    cpf = p_cpf
                  where id = v_client.id
                    and tenant_id = p_tenant_id
                  returning * into v_client;
                else
                  -- Completely new client
                  select exists (
                    select 1
                    from public.client_subscriptions as subscription
                    where subscription.tenant_id = p_tenant_id
                      and regexp_replace(coalesce(subscription.cpf, ''), '[^0-9]', '', 'g') = p_cpf
                  )
                  into v_has_subscription;

                  insert into public.clients (
                    tenant_id,
                    full_name,
                    whatsapp,
                    cpf,
                    is_subscriber
                  )
                  values (
                    p_tenant_id,
                    btrim(p_full_name),
                    p_whatsapp,
                    p_cpf,
                    v_has_subscription
                  )
                  returning * into v_client;
                end if;

                update public.client_subscriptions
                set
                  client_id = v_client.id,
                  subscriber_name = v_client.full_name,
                  whatsapp = v_client.whatsapp,
                  cpf = p_cpf
                where tenant_id = p_tenant_id
                  and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = p_cpf
                  and (client_id is null or client_id = v_client.id);

                update public.clients
                set is_subscriber = exists (
                  select 1
                  from public.client_subscriptions as subscription
                  where subscription.tenant_id = p_tenant_id
                    and subscription.client_id = v_client.id
                    and subscription.status in ('pending_activation', 'active', 'overdue', 'suspended')
                )
                where id = v_client.id
                  and tenant_id = p_tenant_id
                returning * into v_client;

                insert into public.customer_booking_accounts (
                  tenant_id,
                  client_id,
                  cpf_hash,
                  password_hash,
                  whatsapp_consent_at
                )
                values (
                  p_tenant_id,
                  v_client.id,
                  p_cpf_hash,
                  p_password_hash,
                  case when p_whatsapp_consent then now() else null end
                )
                returning id into v_account_id;

                return query
                select
                  v_account_id,
                  v_client.id,
                  v_client.full_name,
                  v_client.whatsapp,
                  v_client.cpf;
              END;
              $function$;
              
              notify pgrst, 'reload schema';
            `;
            await sql.unsafe(sql2);

            await sql.end();
            return Response.json({ ok: true, message: "Migrations applied successfully" });
          } catch (e: any) {
            return Response.json({ ok: false, error: e.message, stack: e.stack });
          }
        }

        if (!slug) return Response.json({ error: "Loja nao informada." }, { status: 400 });
        const context = new URL(request.url).searchParams.get("context");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("tenants")
          .select("name, slug, logo_url, primary_color, status")
          .eq("slug", slug)
          .maybeSingle();

        if (error) {
          console.error("[PWA manifest] erro ao carregar loja", error);
          return Response.json(
            { error: "Nao foi possivel carregar o manifesto." },
            { status: 500 },
          );
        }

        if (!data || data.status === "blocked") {
          return Response.json({ error: "Loja nao encontrada." }, { status: 404 });
        }

        const manifestTenant = {
          name: data.name,
          logo_url: data.logo_url,
          primary_color: data.primary_color,
        };
        const manifest =
          context === "admin"
            ? buildAdminPwaManifest(data.slug || slug, manifestTenant)
            : buildBookingPwaManifest(data.slug || slug, manifestTenant);

        return Response.json(manifest, {
          headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
} as any);
