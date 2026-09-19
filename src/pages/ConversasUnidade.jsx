import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Search, Send, RefreshCw, UserRound, ShieldCheck } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { redeRest } from '../lib/redeUnidadesApi.js';
import { Card, Btn, PageHead, Badge, Empty } from '../components/ui.jsx';
import { inp, C } from '../lib/theme.js';
import { emailDaSessao } from '../lib/supabaseAuth.js';

const papel = { admin: 'Supervisão CafeWorking', unidade: 'Equipe da unidade', cliente: 'Cliente' };

export default function ConversasUnidade({ go }) {
  const { clientes, activeUnit, perfil } = useStore();
  const [busca, setBusca] = useState('');
  const [cliente, setCliente] = useState('');
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [versao, setVersao] = useState(0);
  const fim = useRef(null);
  const meus = useMemo(() => clientes.filter((c) => c.unidadeId === activeUnit && (perfil !== 'cliente' || c.email?.toLowerCase() === emailDaSessao()?.toLowerCase())), [clientes, activeUnit, perfil]);
  const filtrados = meus.filter((c) => `${c.nome} ${c.email || ''}`.toLowerCase().includes(busca.toLowerCase()));
  const selecionado = meus.find((c) => c.id === cliente) || meus[0];
  const selecionadoId = selecionado?.id;

  useEffect(() => { if (!cliente && meus[0]) setCliente(meus[0].id); }, [cliente, meus]);
  useEffect(() => {
    let vivo = true;
    const carregar = (silencioso = false) => {
      if (!selecionadoId) return;
      if (!silencioso) setCarregando(true);
      redeRest(`unidade_mensagens?unidade_id=eq.${encodeURIComponent(activeUnit)}&cliente_id=eq.${encodeURIComponent(selecionadoId)}&order=created_at.desc&limit=100`, undefined, 'GET')
        .then((r) => { if (vivo) { setMensagens((r || []).reverse()); setErro(''); } })
        .catch((e) => vivo && setErro(e.message)).finally(() => vivo && setCarregando(false));
    };
    setMensagens([]); setTexto(''); setErro(''); carregar();
    const timer = window.setInterval(() => carregar(true), 15000);
    return () => { vivo = false; window.clearInterval(timer); };
  }, [activeUnit, selecionadoId, versao]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens.length]);

  const enviar = async (e) => {
    e.preventDefault(); if (!selecionado || !texto.trim()) return;
    setBusy(true); setErro('');
    try {
      await redeRest('rpc/enviar_mensagem_unidade', { p_unidade: activeUnit, p_cliente: selecionado.id, p_texto: texto.trim() });
      setTexto(''); setVersao((v) => v + 1);
    } catch (error) { setErro(error.message); } finally { setBusy(false); }
  };

  return <div><PageHead title="Conversas" sub="Atendimento entre cliente e unidade, com supervisão identificada da CafeWorking." action={<Btn variant="ghost" onClick={() => setVersao((v) => v + 1)} disabled={carregando}><RefreshCw size={15} /> Atualizar</Btn>} />
    <Card style={{ padding: 0, overflow: 'hidden' }}><div className="cw-chat-layout" style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', minHeight: 590 }}>
      <aside style={{ borderRight: `1px solid ${C.border2}`, background: C.cream, padding: 14 }}>
        <div style={{ position: 'relative', marginBottom: 12 }}><Search size={16} color={C.text4} style={{ position: 'absolute', left: 12, top: 12 }} /><input aria-label="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" style={{ ...inp, paddingLeft: 36, margin: 0 }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}><b style={{ fontSize: 12.5 }}>Clientes da unidade</b><Badge color={C.teal}>{meus.length}</Badge></div>
        <div style={{ display: 'grid', gap: 5, maxHeight: 480, overflowY: 'auto' }}>{filtrados.map((c) => <button key={c.id} onClick={() => setCliente(c.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, textAlign: 'left', background: selecionado?.id === c.id ? C.cafePale : 'transparent', color: C.text, width: '100%' }}><span style={{ width: 34, height: 34, borderRadius: '50%', background: selecionado?.id === c.id ? C.cafe : C.white, color: selecionado?.id === c.id ? '#fff' : C.cafe, display: 'grid', placeItems: 'center', fontWeight: 700 }}>{c.nome?.charAt(0) || '?'}</span><span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</b><small style={{ color: C.text3 }}>{c.plano || (c.fiscal ? 'Endereço fiscal' : 'Cliente')}</small></span></button>)}</div>
      </aside>
      <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selecionado ? <Empty icon={MessageSquare} title="Nenhum cliente disponível" sub="Cadastre ou vincule um cliente a esta unidade para iniciar o atendimento." action={perfil !== 'cliente' ? <Btn onClick={() => go?.('clientes')}>Abrir clientes</Btn> : null} /> : <>
          <header style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: 11 }}><span style={{ width: 38, height: 38, borderRadius: '50%', background: C.tealPale, display: 'grid', placeItems: 'center' }}><UserRound size={19} color={C.teal} /></span><div style={{ flex: 1 }}><b>{selecionado.nome}</b><div style={{ fontSize: 12, color: C.text3 }}>{selecionado.email || 'Sem e-mail cadastrado'} · {selecionado.status}</div></div>{perfil === 'franqueador' && <Badge color={C.teal}><ShieldCheck size={12} /> Supervisão</Badge>}</header>
          <div role="log" aria-label="Histórico da conversa" style={{ flex: 1, minHeight: 360, maxHeight: 460, overflowY: 'auto', padding: 18, background: '#fbfaf8' }}>
            {carregando && !mensagens.length && <p style={{ textAlign: 'center', color: C.text4 }}>Carregando conversa…</p>}
            {!carregando && !mensagens.length && <div style={{ textAlign: 'center', padding: '60px 20px', color: C.text4 }}><MessageSquare size={28} style={{ margin: '0 auto 8px' }} /><b style={{ display: 'block', color: C.text3 }}>Inicie o atendimento</b><span style={{ fontSize: 13 }}>As mensagens ficam registradas no histórico da unidade.</span></div>}
            {mensagens.map((m) => { const propria = perfil === 'cliente' ? m.autor_papel === 'cliente' : m.autor_papel !== 'cliente'; return <article key={m.id} style={{ maxWidth: '78%', margin: propria ? '0 0 10px auto' : '0 auto 10px 0', background: m.autor_papel === 'admin' ? C.tealPale : propria ? C.cafe : C.white, color: propria && m.autor_papel !== 'admin' ? '#fff' : C.text, border: `1px solid ${m.autor_papel === 'admin' ? `${C.teal}44` : C.border2}`, padding: '10px 12px', borderRadius: propria ? '14px 14px 3px 14px' : '14px 14px 14px 3px', overflowWrap: 'anywhere' }}><small style={{ opacity: .72 }}>{papel[m.autor_papel] || m.autor_papel} · {new Date(m.created_at).toLocaleString('pt-BR')}</small><p style={{ whiteSpace: 'pre-wrap', margin: '5px 0 0', lineHeight: 1.45 }}>{m.texto}</p></article>; })}<div ref={fim} />
          </div>
          {erro && <div role="alert" style={{ color: C.red, fontSize: 12.5, padding: '8px 18px 0' }}>{erro}</div>}
          <form onSubmit={enviar} style={{ display: 'flex', alignItems: 'flex-end', gap: 9, padding: 14, borderTop: `1px solid ${C.border2}` }}><textarea aria-label="Sua mensagem" style={{ ...inp, margin: 0, minHeight: 46, maxHeight: 120, resize: 'vertical' }} value={texto} maxLength={4000} rows={1} disabled={busy} placeholder="Escreva uma mensagem…" onChange={(e) => setTexto(e.target.value)} /><Btn type="submit" aria-label="Enviar mensagem" disabled={busy || !texto.trim()} style={{ height: 46, padding: '0 16px' }}><Send size={17} /> <span className="cw-chat-send-label">Enviar</span></Btn></form>
        </>}
      </section>
    </div></Card>
    <style>{`@media(max-width:760px){.cw-chat-layout{grid-template-columns:1fr!important}.cw-chat-layout aside{border-right:0!important;border-bottom:1px solid ${C.border2}}.cw-chat-layout aside>div:last-child{max-height:170px!important}.cw-chat-send-label{display:none}}`}</style>
  </div>;
}
