import { supabaseConfigured, getAccessToken } from './supabaseAuth.js';
const URL = import.meta.env?.VITE_SUPABASE_URL || '';
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';
export async function redeRest(path, body, method = 'POST') {
  if (!supabaseConfigured) throw new Error('Disponível após configurar o ambiente de teste.');
  const token = await getAccessToken();
  if (!token) throw new Error('Entre novamente na sua conta.');
  const response = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir. Verifique se a migração foi aplicada no ambiente de teste.');
  return data;
}
export const redeUnidadesApi = {
  listar: () => redeRest('parceiro_unidade_perfis?select=*&order=updated_at.desc', undefined, 'GET'),
  salvar: (id, dados, enviar = false) => redeRest('rpc/salvar_perfil_parceiro', { p_unidade: id, p_dados: dados, p_enviar: enviar }),
  revisar: (id, status, parecer) => redeRest('rpc/revisar_perfil_parceiro', { p_unidade: id, p_status: status, p_parecer: parecer }),
  requisitos: () => redeRest('parceiro_requisitos?select=*&ativo=is.true', undefined, 'GET'),
  configurarRequisito: (tipo, obrigatorio, ativo = true) => redeRest('rpc/configurar_requisito_parceiro', { p_tipo: tipo, p_obrigatorio: obrigatorio, p_ativo: ativo }),
};
