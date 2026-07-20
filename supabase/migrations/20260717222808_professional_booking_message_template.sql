begin;

-- Preserve tenant-specific customizations. Only stores still using the previous
-- system default receive the new professional booking message automatically.
update public.tenant_whatsapp_settings
set
  professional_booking_template = $template$📅 *Olá, {profissional}! Você recebeu um novo agendamento.*

👤 Cliente: *{cliente}*
💼 Serviço: *{servico}*
📆 Data: *{data}*
🕒 Horário: *{hora}*

✨ Desejamos um excelente atendimento!$template$,
  updated_at = now()
where btrim(professional_booking_template) =
  'Olá, {profissional}! Novo agendamento: {cliente}, serviço {servico}, em {data} às {hora}.';

alter table public.tenant_whatsapp_settings
  alter column professional_booking_template set default
    $template$📅 *Olá, {profissional}! Você recebeu um novo agendamento.*

👤 Cliente: *{cliente}*
💼 Serviço: *{servico}*
📆 Data: *{data}*
🕒 Horário: *{hora}*

✨ Desejamos um excelente atendimento!$template$;

commit;
