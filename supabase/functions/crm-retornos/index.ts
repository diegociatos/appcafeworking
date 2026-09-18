import { adminClient } from '../_shared/supabaseAdmin.ts';
import { json } from '../_shared/cors.ts';
import { processarRetornos, tokenRetornosValido } from '../_shared/crmRetornos.ts';

// --no-verify-jwt: endpoint exclusivo do cron, protegido pelo token próprio.
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' },405);
  const token = Deno.env.get('CRM_RETORNO_TOKEN') || '';
  if (token.length < 32) return json({ error: 'Agendador de retornos não configurado' },503);
  if (!tokenRetornosValido(req.headers.get('x-crm-token'),token)) return json({ error: 'Não autorizado' },401);
  try {
    return json(await processarRetornos(adminClient(), Deno.env.get('APP_URL') || 'https://app.cafeworking.com.br'));
  } catch { return json({ error: 'Não foi possível processar retornos' },500); }
});
