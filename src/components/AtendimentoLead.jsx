import { useState } from 'react';
import { Btn, Field } from './ui.jsx';
import { C, inp } from '../lib/theme.js';

export const dataAtendimento = v => v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const STATUS = { agendado: 'Lembrete agendado', processando: 'Envio em processamento', enviado: 'Lembrete enviado por e-mail', erro: 'Falha no envio do lembrete', cancelado: 'Retorno cancelado', concluido: 'Retorno concluído' };

export default function AtendimentoLead({ lead, atendimento, comentarios, retornos, onRegistrar, demo }) {
  const [texto, setTexto] = useState('');
  const [retorno, setRetorno] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const executar = async (acao, extra = {}) => {
    if (busy) return;
    setBusy(true); setErro(''); setSucesso('');
    try {
      await onRegistrar(acao, extra);
      if (acao === 'comentar') { setTexto(''); setRetorno(''); }
      setSucesso(acao === 'comentar' ? 'Conversa registrada.' : acao === 'assumir' ? 'Atendimento assumido.' : 'Retorno atualizado.');
    } catch (e) { setErro(e.message || 'Não foi possível registrar.'); }
    finally { setBusy(false); }
  };
  const pendente = retornos.some(r => ['agendado','processando'].includes(r.status));
  return <>
    <p style={{ color: C.text3 }}>{[lead.empresa, lead.tel, lead.email].filter(Boolean).join(' · ')}</p>
    {demo && <p role="status" style={{ color: C.amber }}>Demonstração: registros ficam apenas nesta tela e nenhum e-mail será enviado.</p>}
    {atendimento ? <p><b>Responsável:</b> {atendimento.responsavel_nome}<br /><span style={{ color: C.text3 }}>Assumiu em {dataAtendimento(atendimento.assumido_em)}</span></p> : <>
      <p>Este lead ainda não tem responsável pelo atendimento.</p>
      <Btn disabled={busy} onClick={() => executar('assumir')}>Assumir atendimento</Btn>
    </>}
    {lead.obs && <div style={{ background: C.cream2, padding: 12, borderRadius: 10, margin: '16px 0' }}><b>Observação original</b><p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{lead.obs}</p></div>}
    <h3 style={{ fontSize: 16, marginTop: 20 }}>Histórico de conversas</h3>
    {!comentarios.length && <p style={{ color: C.text3 }}>Nenhuma conversa registrada.</p>}
    {comentarios.map(c => <article key={c.id} style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 0' }}>
      <div style={{ fontSize: 12, color: C.text3 }}><b>{c.autor_nome}</b> · {dataAtendimento(c.created_at)}</div>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 4 }}>{c.texto}</p>
    </article>)}
    {!!retornos.length && <><h3 style={{ fontSize: 16, marginTop: 20 }}>Retornos</h3>{retornos.map(r => <div key={r.id} style={{ background: C.cream2, borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <b>{dataAtendimento(r.agendado_para)}</b><br /><span style={{ fontSize: 12 }}>{STATUS[r.status] || r.status}</span>
      {r.status === 'agendado' && <p style={{ fontSize: 12 }}>O lembrete irá para o e-mail de acesso do responsável pelo atendimento.</p>}
      {r.status === 'erro' && <p role="alert" style={{ color: C.red }}>O lembrete não foi enviado. {r.erro} Confira o contato no quadro.</p>}
      {['agendado','enviado','erro'].includes(r.status) && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <Btn variant="ghost" disabled={busy} onClick={() => executar('concluir', { p_retorno_id: r.id })}>Contato realizado</Btn>
        <Btn variant="ghost" disabled={busy} onClick={() => executar('cancelar', { p_retorno_id: r.id })}>Cancelar retorno</Btn>
      </div>}
    </div>)}</>}
    {atendimento && <div style={{ marginTop: 20 }}>
      <Field label="O que foi conversado com o cliente?"><textarea aria-label="Comentário do atendimento" maxLength={4000} rows={4} value={texto} onChange={e => setTexto(e.target.value)} style={{ ...inp, resize: 'vertical' }} placeholder="Registre a conversa, o interesse e o próximo passo." /></Field>
      <Field label="Próximo contato (opcional)"><input aria-label="Data e hora do próximo contato" type="datetime-local" disabled={pendente} value={retorno} onChange={e => setRetorno(e.target.value)} style={inp} /></Field>
      <p style={{ color: C.text3, fontSize: 12 }}>{pendente ? 'Já existe um retorno pendente. Conclua ou cancele antes de agendar outro.' : 'Horário do seu dispositivo. O lembrete por e-mail será enviado ao responsável quando chegar a hora do retorno.'}</p>
      <Btn disabled={busy || !texto.trim()} onClick={() => {
        const data = retorno ? new Date(retorno) : null;
        if (data && (Number.isNaN(data.getTime()) || data <= new Date())) { setErro('Escolha uma data e hora futuras para o retorno.'); return; }
        executar('comentar', { p_texto: texto, p_retorno_em: data?.toISOString() || null });
      }}>{busy ? 'Salvando…' : 'Registrar conversa'}</Btn>
    </div>}
    {erro && <p role="alert" style={{ color: C.red }}>{erro}</p>}
    {sucesso && <p role="status" style={{ color: C.green }}>{sucesso}</p>}
  </>;
}
