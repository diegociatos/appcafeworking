import { supabaseConfigured, getAccessToken } from './supabaseAuth.js';
const URL = import.meta.env?.VITE_SUPABASE_URL || '';
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';
const DEMO = !supabaseConfigured && new URLSearchParams(window.location.search).get('demo') === 'parceiro';
let demoMensagens = [
  { id: 'msg-1', unidade_id: 'lux', cliente_id: 'cli_demo_1', autor_papel: 'cliente', texto: 'Olá! O IPTU aprovado já está disponível para minha contabilidade?', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'msg-2', unidade_id: 'lux', cliente_id: 'cli_demo_1', autor_papel: 'unidade', texto: 'Olá! Sim. Entre em Endereço fiscal na sua área para abrir o documento.', created_at: new Date(Date.now() - 3300000).toISOString() },
];
const demoPerfil = { unidade_id: 'lux', status: 'rascunho', parecer: '', dados: { empresa: 'Unidade Parceira Demonstrativa', responsavel: 'Operador parceiro', endereco: 'Av. Principal, 1000, sala 201', cidade: 'Belo Horizonte', uf: 'MG', bairro: 'Centro', horarios: 'Segunda a sexta, 8h às 18h', caracteristicas: 'Escritório comercial com recepção e ambiente reservado para atendimento.', acessibilidade: 'Acesso por elevador', estacionamento: 'Rotativo próximo', comodidades: 'Wi-Fi, café e recepção', servicos: ['endereco_fiscal', 'sala_hora'], fotos: [], financeiroConferido: true } };
export async function redeRest(path, body, method = 'POST') {
  if (DEMO) {
    if (path.startsWith('unidade_mensagens?')) return demoMensagens;
    if (path === 'rpc/enviar_mensagem_unidade') {
      demoMensagens = [...demoMensagens, { id: `msg-${Date.now()}`, unidade_id: body.p_unidade, cliente_id: body.p_cliente, autor_papel: 'unidade', texto: body.p_texto, created_at: new Date().toISOString() }];
      return null;
    }
    return null;
  }
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
  listar: () => DEMO ? Promise.resolve([demoPerfil]) : redeRest('parceiro_unidade_perfis?select=*&order=updated_at.desc', undefined, 'GET'),
  salvar: (id, dados, enviar = false) => redeRest('rpc/salvar_perfil_parceiro', { p_unidade: id, p_dados: dados, p_enviar: enviar }),
  revisar: (id, status, parecer) => redeRest('rpc/revisar_perfil_parceiro', { p_unidade: id, p_status: status, p_parecer: parecer }),
  requisitos: () => DEMO ? Promise.resolve([{ tipo: 'iptu', obrigatorio: true, ativo: true }]) : redeRest('parceiro_requisitos?select=*&ativo=is.true', undefined, 'GET'),
  configurarRequisito: (tipo, obrigatorio, ativo = true) => redeRest('rpc/configurar_requisito_parceiro', { p_tipo: tipo, p_obrigatorio: obrigatorio, p_ativo: ativo }),
};
