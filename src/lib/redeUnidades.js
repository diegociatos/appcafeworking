export const ETAPAS_REDE = ['Empresa', 'Imóvel', 'Documentos', 'Espaços', 'Fotos', 'Serviços', 'Financeiro', 'Análise CafeWorking', 'Publicado'];
export const SERVICOS_REDE = ['endereco_fiscal', 'coworking', 'sala_hora', 'sala_privativa'];
export function progressoRede(dados = {}, documentos = [], requisitos = []) {
  const texto = (valor) => Boolean(String(valor || '').trim());
  const soEndereco = dados.servicos?.length === 1 && dados.servicos[0] === 'endereco_fiscal';
  return [
    texto(dados.empresa) && texto(dados.responsavel),
    ['endereco', 'cidade', 'uf', 'bairro', 'horarios'].every((k) => texto(dados[k])),
    requisitos.filter((r) => r.obrigatorio).every((r) => documentos.some((d) => d.tipo === r.tipo && d.revisao_status === 'aprovado' && (!d.validade || d.validade >= new Date().toISOString().slice(0, 10)))),
    soEndereco || dados.espacosConferidos === true,
    Array.isArray(dados.fotos) && dados.fotos.length > 0,
    Array.isArray(dados.servicos) && dados.servicos.length > 0 && dados.servicos.every((s) => SERVICOS_REDE.includes(s)),
    dados.financeiroConferido === true,
  ];
}
export function statusDocumento(doc, hoje = new Date()) {
  if (doc.revisao_status !== 'aprovado' || !doc.validade) return doc.revisao_status || 'pendente';
  const dias = Math.ceil((new Date(`${doc.validade}T23:59:59Z`) - hoje) / 86400000);
  return dias < 0 ? 'vencido' : dias <= 30 ? 'vencendo' : 'aprovado';
}
