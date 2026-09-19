import { CalendarDays, Mail, MessageSquare, Users, Wallet, Building2, ArrowUpRight, Clock3, CheckCircle2, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Card, Badge, PageHead } from '../components/ui.jsx';
import { C, fmt } from '../lib/theme.js';
import { getReservaStart } from '../lib/reservas.js';
import { redeUnidadesApi } from '../lib/redeUnidadesApi.js';

const Acao = ({ icon: Icon, titulo, detalhe, cor, onClick }) => <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 14, border: `1px solid ${C.border2}`, borderRadius: 12, background: C.white, textAlign: 'left' }}>
  <span style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={19} color={cor} /></span>
  <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 13.5, color: C.text }}>{titulo}</b><small style={{ color: C.text3 }}>{detalhe}</small></span>
  <ArrowUpRight size={16} color={C.text4} />
</button>;

export default function PainelParceiro({ go }) {
  const store = useStore();
  const { activeUnit, unidadeAtiva, contaDaUnidade, reservas, correspondenciasDe, clientes, contratosDe, cobrancas = [] } = store;
  const conta = contaDaUnidade(activeUnit);
  const [perfilUnidade, setPerfilUnidade] = useState(null);
  useEffect(() => {
    let vivo = true;
    redeUnidadesApi.listar().then((lista) => vivo && setPerfilUnidade(lista?.find((p) => p.unidade_id === activeUnit) || null)).catch(() => {});
    return () => { vivo = false; };
  }, [activeUnit]);
  const soEnderecoFiscal = perfilUnidade?.dados?.servicos?.length === 1 && perfilUnidade.dados.servicos[0] === 'endereco_fiscal';
  const servicosAtivos = perfilUnidade?.dados?.servicos || [];
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const reservasHoje = reservas.filter((r) => r.unidadeId === activeUnit && r.status !== 'cancelada' && getReservaStart(r).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) === hoje);
  const correspondencias = correspondenciasDe(activeUnit).filter((c) => c.status !== 'retirada');
  const clientesUnidade = clientes.filter((c) => c.unidadeId === activeUnit && c.status !== 'inativo');
  const contratos = contratosDe(activeUnit).filter((c) => c.status !== 'cancelado');
  const recebidas = cobrancas.filter((c) => c.unidadeId === activeUnit && c.status === 'pago');
  const bruto = recebidas.reduce((s, c) => s + Number(c.valor || 0), 0);
  const pctParceiro = Number(conta?.parceiroPercentual ?? 75);
  const parteParceiro = recebidas.reduce((s, c) => s + Number(c.valorParceiro ?? (Number(c.valor || 0) * pctParceiro / 100)), 0);
  const pendencias = correspondencias.length + (soEnderecoFiscal ? 0 : reservasHoje.filter((r) => r.status === 'confirmada').length);

  const kpis = [
    ...(!soEnderecoFiscal ? [{ label: 'Reservas hoje', valor: reservasHoje.length, sub: `${reservasHoje.filter((r) => r.status === 'confirmada').length} aguardando check-in`, icon: CalendarDays, cor: C.cafe, go: 'reservas' }] : []),
    { label: 'Correspondências', valor: correspondencias.length, sub: 'aguardando atendimento', icon: Mail, cor: C.teal, go: 'corresp' },
    { label: 'Clientes ativos', valor: clientesUnidade.length, sub: `${contratos.length} contratos`, icon: Users, cor: C.teal2, go: 'clientes' },
    { label: 'Sua parte recebida', valor: fmt(parteParceiro), sub: `${pctParceiro}% de ${fmt(bruto)}`, icon: Wallet, cor: C.green, go: 'financeiro' },
  ];

  return <div>
    <PageHead title={`Bom dia · ${unidadeAtiva?.nome || 'Unidade parceira'}`} sub="Seu espaço de trabalho para operar a unidade, atender clientes e acompanhar os repasses." action={<Badge color={pendencias ? C.amber : C.green}>{pendencias ? `${pendencias} ações hoje` : 'Tudo em dia'}</Badge>} />

    <Card style={{ marginBottom: 20, background: C.cream }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><div style={{ fontFamily: 'serif', fontSize: 20, color: C.text }}>Central da recepção</div><p style={{ margin: '5px 0 0', color: C.text3, fontSize: 13 }}>Prioridades da equipe para hoje, em um só lugar.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{!soEnderecoFiscal && <Badge color={C.teal}>{reservasHoje.length} reservas</Badge>}<Badge color={C.cafe}>{correspondencias.length} correspondências</Badge><Badge color={C.green}>{clientesUnidade.length} clientes</Badge>{soEnderecoFiscal && <Badge color={C.teal}>Somente endereço fiscal</Badge>}{servicosAtivos.includes('coworking') && <Badge color={C.teal}>Coworking</Badge>}{servicosAtivos.includes('sala_hora') && <Badge color={C.cafe}>Salas por hora</Badge>}{servicosAtivos.includes('sala_privativa') && <Badge color={C.green}>Salas privativas</Badge>}</div>
      </div>
    </Card>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14, marginBottom: 20 }}>
      {kpis.map((k) => <Card key={k.label} onClick={() => go(k.go)} style={{ cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><span style={{ fontSize: 12.5, color: C.text3 }}>{k.label}</span><div style={{ fontFamily: 'serif', fontSize: 27, margin: '7px 0', color: C.text }}>{k.valor}</div><small style={{ color: k.cor, fontWeight: 600 }}>{k.sub}</small></div><span style={{ width: 42, height: 42, borderRadius: 12, background: `${k.cor}14`, display: 'grid', placeItems: 'center' }}><k.icon size={20} color={k.cor} /></span></div></Card>)}
    </div>

    <div className="cw-grid-stack" style={{ display: 'grid', gridTemplateColumns: '1.35fr .85fr', gap: 16 }}>
      <Card><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><div style={{ fontFamily: 'serif', fontSize: 20 }}>{soEnderecoFiscal ? 'Fila de correspondências' : 'Agenda de hoje'}</div><button onClick={() => go(soEnderecoFiscal ? 'corresp' : 'reservas')} style={{ color: C.cafe, fontWeight: 600, fontSize: 12 }}>Ver {soEnderecoFiscal ? 'todas' : 'agenda completa'}</button></div>
        {soEnderecoFiscal ? (correspondencias.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 10px', color: C.text4 }}><CheckCircle2 size={25} style={{ margin: '0 auto 8px' }} />Nenhuma correspondência pendente.</div> : correspondencias.slice(0, 5).map((c) => <button key={c.id} onClick={() => go('corresp')} style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${C.border2}`, textAlign: 'left' }}><Mail size={17} color={C.cafe} /><span style={{ flex: 1 }}><b style={{ display: 'block' }}>{c.cliente}</b><small style={{ color: C.text3 }}>{c.remetente || 'Remetente não informado'} · {c.tipo}</small></span><Badge color={C.amber}>{c.status}</Badge></button>)) : <>
        {reservasHoje.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 10px', color: C.text4 }}><CheckCircle2 size={25} style={{ margin: '0 auto 8px' }} />Nenhuma reserva para hoje.</div> : reservasHoje.slice(0, 5).map((r) => <button key={r.id} onClick={() => go('reservas')} style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${C.border2}`, textAlign: 'left' }}><Clock3 size={17} color={C.cafe} /><span style={{ width: 48, fontWeight: 700 }}>{getReservaStart(r).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><span style={{ flex: 1 }}><b style={{ display: 'block' }}>{r.cliente}</b><small style={{ color: C.text3 }}>{r.sala || 'Espaço reservado'}</small></span><Badge color={r.status === 'checkin' ? C.green : C.teal}>{r.status}</Badge></button>)}
        </>}
      </Card>
      <Card><div style={{ fontFamily: 'serif', fontSize: 20, marginBottom: 12 }}>Acesso rápido</div><div style={{ display: 'grid', gap: 9 }}>
        <Acao icon={MessageSquare} titulo="Conversar com clientes" detalhe="Atendimento acompanhado no app" cor={C.teal} onClick={() => go('conversas_unidade')} />
        <Acao icon={FileText} titulo="Contratos" detalhe="Consulte contratos da unidade" cor={C.cafe} onClick={() => go('assinaturas')} />
        <Acao icon={Mail} titulo="Registrar correspondência" detalhe="Fotografe e avise o cliente" cor={C.amber} onClick={() => go('corresp')} />
        <Acao icon={Building2} titulo="Configurar minha unidade" detalhe="Imóvel, IPTU, fotos e serviços" cor={C.green} onClick={() => go('minha_unidade_parceira')} />
      </div></Card>
    </div>
  </div>;
}
