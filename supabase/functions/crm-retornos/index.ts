// ============================================================================
// Edge Function: crm-retornos  (pg_cron a cada 5 min)
//
// POST /functions/v1/crm-retornos   (deploy --no-verify-jwt)
// Cabeçalho x-rotina-token = secret ROTINA_DIARIA_TOKEN (cópia no Vault),
// o mesmo par já usado por rotina-diaria: um token só para o agendador.
// Avisa por e-mail o responsável quando chega a hora de retomar o lead.
// ============================================================================
import { adminClient } from '../_shared/supabaseAdmin.ts';
import { json } from '../_shared/cors.ts';
import { processarRetornos, tokenRetornosValido } from '../_shared/crmRetornos.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' },405);
  const token = Deno.env.get('CRM_RETORNO_TOKEN') || Deno.env.get('ROTINA_DIARIA_TOKEN') || '';
  if (token.length < 32) return json({ error: 'Agendador de retornos não configurado' },503);
  const recebido = req.headers.get('x-crm-token') || req.headers.get('x-rotina-token');
  if (!tokenRetornosValido(recebido,token)) return json({ error: 'Não autorizado' },401);
  try {
    return json(await processarRetornos(adminClient(), Deno.env.get('APP_URL') || 'https://app.cafeworking.com.br'));
  } catch { return json({ error: 'Não foi possível processar retornos' },500); }
});
