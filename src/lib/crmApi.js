import { getAccessToken, supabaseConfigured } from './supabaseAuth.js';
const URL = import.meta.env?.VITE_SUPABASE_URL || '';
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

async function request(path, body) {
  const token = await getAccessToken();
  if (!token) throw new Error('Entre novamente para acessar o atendimento.');
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || 'Não foi possível salvar o atendimento. Tente novamente.');
  return data;
}

export const crmApi = {
  configured: supabaseConfigured,
  async carregar(unidadeId) {
    const filtro = `unidade_id=eq.${encodeURIComponent(unidadeId)}`;
    const [atendimentos, comentarios, retornos] = await Promise.all([
      request(`crm_atendimentos?${filtro}&select=*`),
      request(`crm_comentarios?${filtro}&select=*&order=created_at.asc`),
      request(`crm_retornos?${filtro}&select=*&order=agendado_para.desc`),
    ]);
    return { atendimentos, comentarios, retornos };
  },
  registrar: (unidadeId, leadId, acao, extra = {}) => request('rpc/crm_registrar_atendimento', {
    p_unidade_id: unidadeId, p_lead_id: leadId, p_acao: acao, ...extra,
  }),
};
