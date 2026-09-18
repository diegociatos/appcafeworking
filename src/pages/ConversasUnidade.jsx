import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { redeRest } from '../lib/redeUnidadesApi.js';
import { Card, Btn, PageHead } from '../components/ui.jsx';
import { inp, C } from '../lib/theme.js';
import { emailDaSessao } from '../lib/supabaseAuth.js';

export default function ConversasUnidade() {
  const { clientes, activeUnit, perfil } = useStore();
  const meus = clientes.filter((c) => c.unidadeId === activeUnit && (perfil !== 'cliente' || c.email?.toLowerCase() === emailDaSessao()?.toLowerCase()));
  const [cliente, setCliente] = useState('');
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [versao, setVersao] = useState(0);
  const selecionado = meus.find((c) => c.id === cliente)?.id || meus[0]?.id;
  useEffect(() => {
    let vivo = true;
    setMensagens([]); setTexto(''); setErro('');
    if (selecionado) redeRest(`unidade_mensagens?unidade_id=eq.${encodeURIComponent(activeUnit)}&cliente_id=eq.${encodeURIComponent(selecionado)}&order=created_at.desc&limit=100`, undefined, 'GET')
      .then((r) => vivo && setMensagens((r || []).reverse())).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [activeUnit, selecionado, versao]);
  const enviar = async (e) => {
    e.preventDefault(); setBusy(true); setErro('');
    try {
      await redeRest('rpc/enviar_mensagem_unidade', { p_unidade: activeUnit, p_cliente: selecionado, p_texto: texto });
      setTexto(''); setVersao((v) => v + 1);
    } catch (error) { setErro(error.message); } finally { setBusy(false); }
  };
  return <div><PageHead title="Conversas da unidade" sub="Atendimento registrado. A equipe CafeWorking pode supervisionar e intervir." />
    <Card><label htmlFor="conversa-cliente">Cliente</label>
      <select id="conversa-cliente" style={inp} disabled={busy} value={selecionado || ''} onChange={(e) => setCliente(e.target.value)}>
        {!meus.length && <option value="">Nenhum cliente nesta unidade</option>}
        {meus.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <Btn variant="ghost" disabled={busy} onClick={() => setVersao((v) => v + 1)}>Atualizar conversa</Btn>
      {erro && <p role="alert" style={{ color: C.red }}>{erro}</p>}
      <div role="log" aria-label="Histórico da conversa" style={{ maxHeight: 420, overflowY: 'auto', margin: '16px 0' }}>
        {mensagens.map((m) => <article key={m.id} style={{ background: C.cream, padding: 12, borderRadius: 12, marginBottom: 10, overflowWrap: 'anywhere' }}>
          <small>{m.autor_papel === 'admin' ? 'Supervisão CafeWorking' : m.autor_papel === 'unidade' ? 'Equipe da unidade' : 'Cliente'} · {new Date(m.created_at).toLocaleString('pt-BR')}</small>
          <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{m.texto}</p>
        </article>)}
        {!mensagens.length && <p>Nenhuma mensagem carregada. As mensagens ficam salvas após o envio confirmado.</p>}
      </div>
      <form onSubmit={enviar}><label htmlFor="conversa-texto">Sua mensagem</label>
        <textarea id="conversa-texto" style={inp} value={texto} maxLength={4000} rows={3} disabled={busy} onChange={(e) => setTexto(e.target.value)} />
        <Btn type="submit" disabled={busy || !selecionado || !texto.trim()}>{busy ? 'Enviando…' : 'Enviar mensagem'}</Btn>
      </form>
      <p style={{ fontSize: 12 }}>Sem atualização automática nesta versão. Use “Atualizar conversa” para buscar novas respostas.</p>
    </Card></div>;
}
