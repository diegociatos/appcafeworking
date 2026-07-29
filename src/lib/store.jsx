// CafeWorking — store compartilhado (estado global do app)
//
// Modelo de FRANQUIAS:
//  - franqueador (super admin / Grupo Ciatos) = você. Vê e gerencia tudo.
//  - franqueado (usuário master) = dono de 1..N unidades. Identificado por
//    nome, documento (CPF/CNPJ) e e-mail.
//  - unidade tem `tipo` ("propria" | "franqueada") e `franqueadoId`
//    (null quando é própria do Grupo Ciatos).
//  - cada unidade é autônoma: salas e cardápio da cafeteria têm `unidadeId`.
//
// "Ver como franqueado" (viewAs) filtra o app para enxergar só as unidades
// daquele franqueado — preview da experiência dele, sem login real ainda.
//
// 🔌 Quando ligarmos ao banco Neon, as funções add/update/remove daqui
// passam a fazer as chamadas async — as telas não precisam mudar.
import { createContext, useContext, useMemo, useState, useRef, useEffect } from "react";
import { UNIDADES, RESERVAS_INIT, CLIENTES, LEADS_INIT, ETAPAS_CRM, ORIGENS_INIT, EVENTOS } from "./data.js";
import { boletosApi } from "./boletosApi.js";
import { nfseApi } from "./nfseApi.js";
import {
  upsertConfigFiscal, insertCliente, patchCliente, deleteClienteDb,
  putAppState, delAppState, upsertSalaDb, deleteSalaDb, insertCreditoDb,
} from "./supabaseDb.js";
import { getCurrentCompetencia, parseDateToCompetencia } from "./dateUtils.js";
import { legacyReservaToDateRange, dateRangeToLegacy, temConflito, TZ } from "./reservas.js";
import { reservasApi } from "./reservasApi.js";
import {
  PERFIS, SECOES, gerarDadosBoleto,
  seedUnidades, seedFranqueados, seedUsuarios, seedContas, seedLancamentos,
  seedCategorias, seedCatalogo, seedCorresp, seedConversas, seedPedidos,
  seedSalas, seedProdutos, seedBankAccounts, seedBoletos, seedContratos,
  seedEstoque, seedPatrimonio, seedConfigFiscal, seedNotasFiscais, seedPlanos,
} from "./storeSeeds.js";

// Reexporta constantes de config para as telas que as importam de store.jsx.
export { PERFIS, SECOES };

// Backend ligado? Em produção (Supabase configurado) o app não exibe os dados
// de demonstração — parte vazio e hidrata do banco; mutações persistem.
const REAL = nfseApi.configured;
const seedOr = (seed) => (REAL ? [] : seed);

const StoreContext = createContext(null);

// Competencia atual (mes 0..11 + ano) a partir da data real - sem datas fixas.
const { mes: MES_ATUAL, ano: ANO_ATUAL } = getCurrentCompetencia();

// Sequencial de nota fiscal (modo demo). Mutado no provider (emitirNota).
let _nfSeq = 124;

export function StoreProvider({ children }) {
  const [unidades, setUnidades] = useState(seedOr(seedUnidades));
  const [franqueados, setFranqueados] = useState(seedOr(seedFranqueados));
  const [usuarios, setUsuarios] = useState(seedOr(seedUsuarios));
  const [clientes, setClientes] = useState(seedOr(CLIENTES));
  const [contas, setContas] = useState(seedOr(seedContas));
  const [lancamentos, setLancamentos] = useState(seedOr(seedLancamentos));
  const [catalogo, setCatalogo] = useState(seedOr(seedCatalogo));
  const [categorias, setCategorias] = useState(seedCategorias);   // chart of accounts (global) — mantém
  const [pedidos, setPedidos] = useState(seedOr(seedPedidos));
  const [correspondencias, setCorrespondencias] = useState(seedOr(seedCorresp));
  const [conversas, setConversas] = useState(seedOr(seedConversas));
  const [salas, setSalas] = useState(seedOr(seedSalas));
  const [produtos, setProdutos] = useState(seedProdutos);
  const [bankAccounts, setBankAccounts] = useState(seedOr(seedBankAccounts));
  const [boletos, setBoletos] = useState(seedOr(seedBoletos));
  const [contratos, setContratos] = useState(seedOr(seedContratos));
  const [estoque, setEstoque] = useState(seedOr(seedEstoque));
  const [patrimonio, setPatrimonio] = useState(seedOr(seedPatrimonio));
  const [configFiscal, setConfigFiscal] = useState(seedOr(seedConfigFiscal));
  const [notasFiscais, setNotasFiscais] = useState(seedOr(seedNotasFiscais));
  const [planos, setPlanos] = useState(seedOr(seedPlanos));
  const [recibos, setRecibos] = useState(seedOr([]));
  const [creditLedger, setCreditLedger] = useState(seedOr([]));
  const [reservas, setReservas] = useState(seedOr(RESERVAS_INIT));
  // CRM: leads são dados (por unidade, persistem); etapas/origens são a
  // estrutura do funil (config padrão, compartilhada — não some no modo real).
  const [leads, setLeads] = useState(seedOr(LEADS_INIT));
  const [crmEtapas, setCrmEtapas] = useState(ETAPAS_CRM);
  const [crmOrigens, setCrmOrigens] = useState(ORIGENS_INIT);
  const [eventos, setEventos] = useState(seedOr(EVENTOS));

  // ---- Sync engine: persiste cada entidade operacional no banco -----------
  // Observa cada lista; quando há backend/sessão, faz upsert do que mudou
  // (debounce 600ms/item, cancelando writes substituídos) e apaga o que saiu
  // (imediato). Falha de rede → retry com backoff (3x); persistindo a falha,
  // marca em `syncErrors` para a UI avisar. Demo (REAL=false) = no-op.
  const syncedRef = useRef({});          // entity -> Map(id -> { unidadeId, json })
  const syncTimersRef = useRef(new Map()); // "entity:id" -> timeoutId (debounce)
  const [syncErrors, setSyncErrors] = useState([]); // [{ entity, id, unidadeId, erro }]
  const docsGlobaisHidratadosRef = useRef(!REAL); // docs globais (categorias, etapas/origens do CRM) só sincronizam após hidratar (evita sobrescrever com o seed)

  const _syncKey = (entity, id) => entity + ":" + id;
  const _markSyncErr = (entity, id, unidadeId, erro) =>
    setSyncErrors((es) => (es.some((e) => e.entity === entity && e.id === id)
      ? es : [...es, { entity, id, unidadeId, erro: String(erro?.message || erro || "") }]));
  const _clearSyncErr = (entity, id) =>
    setSyncErrors((es) => (es.some((e) => e.entity === entity && e.id === id)
      ? es.filter((e) => !(e.entity === entity && e.id === id)) : es));

  // Executa a escrita com retry/backoff (até 3 tentativas). putAppState/
  // delAppState lançam em falha → entramos no catch.
  const _comBackoff = (fn, entity, unidadeId, id, tentativa = 0) => {
    Promise.resolve()
      .then(fn)
      .then(() => _clearSyncErr(entity, id))
      .catch((erro) => {
        if (tentativa < 2) setTimeout(() => _comBackoff(fn, entity, unidadeId, id, tentativa + 1), 700 * Math.pow(2, tentativa));
        else _markSyncErr(entity, id, unidadeId, erro);
      });
  };
  const _agendarPut = (entity, unidadeId, id, item) => {
    const k = _syncKey(entity, id);
    const ant = syncTimersRef.current.get(k);
    if (ant) clearTimeout(ant.t);
    const t = setTimeout(() => {
      syncTimersRef.current.delete(k);
      _comBackoff(() => putAppState(entity, unidadeId, id, item), entity, unidadeId, id);
    }, 600);
    // Guarda o timer + como gravar IMEDIATAMENTE (keepalive) caso a página seja
    // recarregada/fechada antes do debounce — senão a escrita se perde ("some
    // após F5"). O flush é disparado em visibilitychange(hidden)/pagehide.
    syncTimersRef.current.set(k, {
      t,
      flush: () => putAppState(entity, unidadeId, id, item, { keepalive: true }).catch(() => {}),
    });
  };
  const _cancelarPut = (entity, id) => {
    const k = _syncKey(entity, id);
    const v = syncTimersRef.current.get(k);
    if (v) { clearTimeout(v.t); syncTimersRef.current.delete(k); }
  };
  // Rede de segurança: ao ocultar/fechar/recarregar a página, grava na hora
  // (keepalive) tudo que ainda estava no debounce. Cobre F5, fechar aba e
  // navegar — o CafeWorking não tem cache local, então sem isso a última
  // edição não sincronizada some. Deletes já são imediatos (não entram aqui).
  useEffect(() => {
    if (!REAL) return;
    const flush = () => {
      for (const [, v] of syncTimersRef.current) {
        clearTimeout(v.t);
        try { v.flush?.(); } catch (_) { /* ignore */ }
      }
      syncTimersRef.current.clear();
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  const useSync = (entity, list) => useEffect(() => {
    if (!REAL) return;
    const prev = syncedRef.current[entity] || new Map();
    const cur = new Map();
    for (const it of list) {
      if (!it || it.id == null || !it.unidadeId) continue;
      const json = JSON.stringify(it);
      cur.set(it.id, { unidadeId: it.unidadeId, json });
      const p = prev.get(it.id);
      if (!p || p.json !== json) _agendarPut(entity, it.unidadeId, it.id, it); // debounce
    }
    // Removidos: cancela write pendente e apaga imediatamente (com retry).
    for (const [id, v] of prev) if (!cur.has(id)) {
      _cancelarPut(entity, id);
      _comBackoff(() => delAppState(entity, v.unidadeId, id), entity, v.unidadeId, id);
    }
    syncedRef.current[entity] = cur;
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  useSync("salas", salas);
  useSync("reservas", reservas);
  useSync("lancamentos", lancamentos);
  useSync("contas", contas);
  useSync("catalogo", catalogo);
  useSync("estoque", estoque);
  useSync("patrimonio", patrimonio);
  useSync("contratos", contratos);
  useSync("correspondencias", correspondencias);
  useSync("pedidos", pedidos);
  useSync("conversas", conversas);
  useSync("leads", leads);
  useSync("eventos", eventos);
  useSync("planos", planos);
  useSync("recibos", recibos);
  // creditLedger NÃO usa app_state: em produção a fonte da verdade é a tabela
  // relacional creditos_ledger (Fase 2 — consumo gravado server-side). Em demo
  // fica só em memória.

  const [activeUnit, setActiveUnit] = useState(UNIDADES[0].id);

  // Docs globais (sem unidadeId) não entram no useSync por-item. Persistimos
  // cada um como um doc único de app_state (reusa o _agendarPut → debounce +
  // flush no unload). Só sincroniza depois de hidratar, para não sobrescrever o
  // que já está salvo com o seed padrão.
  // Só sincroniza sob uma unidade REAL (hidratada), nunca sob o seed default
  // (ex.: "lux" antes do login/enterViewAs) — senão cria docs órfãos.
  const unidadeRealAtiva = () => unidades.some((u) => u.id === activeUnit);
  // Grava IMEDIATAMENTE (sem debounce) — docs globais mudam pouco e não podem
  // se perder por corrida de F5. _comBackoff já traz retry/backoff.
  const _gravarDocGlobal = (entity, doc) => {
    if (!REAL || !docsGlobaisHidratadosRef.current || !unidadeRealAtiva()) return;
    _comBackoff(() => putAppState(entity, activeUnit, "geral", doc), entity, activeUnit, "geral");
  };
  useEffect(() => { _gravarDocGlobal("planoContas", { itens: categorias }); }, [categorias, activeUnit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { _gravarDocGlobal("crmEtapas", { itens: crmEtapas }); }, [crmEtapas, activeUnit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { _gravarDocGlobal("crmOrigens", { itens: crmOrigens }); }, [crmOrigens, activeUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  const [viewAs, setViewAs] = useState(null); // id do franqueado, ou null = franqueador
  const [perfil, setPerfilState] = useState("franqueador"); // perfil de acesso previewado
  const [meuPerfil, setMeuPerfil] = useState({
    nome: "Diego Garcia",
    cargo: "Administrador",
    email: "diego.garcia@grupociatos.com.br",
    telefone: "(31) 99712-9789",
    foto: "",
  });
  const updateMeuPerfil = (patch) => setMeuPerfil((p) => ({ ...p, ...patch }));
  // Preferências de notificação (canal × evento). {} = ainda nos padrões.
  const [notificacaoPrefs, setNotificacaoPrefs] = useState({});
  const updateNotificacaoPrefs = (prefs) => setNotificacaoPrefs(prefs);

  // Opt-in do cliente por categoria. Transacionais (cobranca/correspondencia)
  // sempre vão; opcionais (cafeteria/reservas/novidades) respeitam a escolha.
  const [clienteNotifPrefs, setClienteNotifPrefs] = useState({
    cobranca: true, correspondencia: true, cafeteria: true, reservas: true, novidades: false,
  });
  const updateClienteNotifPrefs = (patch) => setClienteNotifPrefs((p) => ({ ...p, ...patch }));
  const _categoriaEvento = (evento) =>
    evento.indexOf("boleto") === 0 ? "cobranca"
      : evento.indexOf("cafe") === 0 ? "cafeteria"
      : evento === "reserva" ? "reservas"
      : evento === "correspondencia" ? "correspondencia" : "novidades";

  // Notificações ao cliente (e-mail) — DEMONSTRAÇÃO: registra o que SERIA
  // enviado. Em produção, cada gatilho chama a Edge Function `enviar-email`
  // (Resend); aqui só gravamos no "outbox" para mostrar o histórico.
  const [notificacoesEmail, setNotificacoesEmail] = useState([]);
  const _brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const _emailDe = (nome) =>
    (nome || "cliente").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") + "@cliente.com.br";
  const _assuntoEmail = (evento, d = {}) => ({
    boleto_nova: `Nova cobrança · ${_brl(d.valor)}`,
    boleto_pago: `Pagamento confirmado · ${_brl(d.valor)}`,
    correspondencia: "Você recebeu uma correspondência",
    cafe_pedido: `Pedido recebido · ${_brl(d.total)}`,
    cafe_pronto: "Seu pedido está pronto ☕",
  }[evento] || "Notificação CafeWorking");
  const enfileirarEmail = (unidadeId, { cliente, email, evento, dados = {} }) => {
    // Respeita o opt-in do cliente para categorias opcionais.
    const cat = _categoriaEvento(evento);
    const opcional = cat === "cafeteria" || cat === "reservas" || cat === "novidades";
    if (opcional && clienteNotifPrefs[cat] === false) return null;
    const reg = {
      id: "ntf" + Date.now() + Math.floor(Math.random() * 1000),
      unidadeId, cliente: cliente || "Cliente", destinatario: email || _emailDe(cliente),
      canal: "email", evento, assunto: _assuntoEmail(evento, dados), dados,
      status: "enviado", createdAt: new Date().toISOString(),
    };
    setNotificacoesEmail((ns) => [reg, ...ns].slice(0, 60));
    return reg;
  };
  const notificacoesEmailDe = (unidadeId) => notificacoesEmail.filter((n) => n.unidadeId === unidadeId);

  // Franqueados ------------------------------------------------------------
  const addFranqueado = (f) => {
    const id = "fr" + Date.now();
    setFranqueados((fs) => [...fs, { criadoEm: "Agora", ...f, id }]);
    return id;
  };
  const updateFranqueado = (id, patch) =>
    setFranqueados((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeFranqueado = (id) => {
    // remove o vínculo das unidades (viram sem dono) e apaga o franqueado
    setUnidades((us) => us.map((u) => (u.franqueadoId === id ? { ...u, franqueadoId: null, tipo: "propria" } : u)));
    setFranqueados((fs) => fs.filter((f) => f.id !== id));
  };

  // Usuários da equipe (master/franqueador cadastram e definem permissão) ---
  const addUsuario = (u) => {
    const id = "us" + Date.now();
    setUsuarios((list) => [...list, { ativo: true, ...u, id }]);
    return id;
  };
  // Adiciona um usuário já criado no backend (mantém id/vínculos retornados).
  const adicionarUsuario = (u) => setUsuarios((list) => (list.some((x) => x.id === u.id) ? list : [u, ...list]));
  const updateUsuario = (id, patch) =>
    setUsuarios((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const removeUsuario = (id) => setUsuarios((list) => list.filter((u) => u.id !== id));
  const usuariosDe = (unidadeId) => usuarios.filter((u) => u.unidadeId === unidadeId);

  // Unidades ---------------------------------------------------------------
  const addUnidade = (u) => {
    const id = u.id || "u" + Date.now();
    setUnidades((us) => [
      ...us,
      { salas: 0, ocupacao: 0, membros: 0, receita: 0, cor: "#6E4E3B", tipo: "propria", franqueadoId: null, ...u, id },
    ]);
    return id;
  };
  const updateUnidade = (id, patch) =>
    setUnidades((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  // Salas (por unidade) ----------------------------------------------------
  // Salas: estado local (app_state) + write-through na tabela relacional (modo
  // real), para a reserva transacional encontrar a sala.
  const addSala = (unidadeId, s) => {
    const nova = { id: "s" + Date.now(), unidadeId, ...s };
    setSalas((ss) => [...ss, nova]);
    if (REAL) upsertSalaDb(nova).catch(() => {});
    return nova.id;
  };
  const updateSala = (id, patch) =>
    setSalas((ss) => ss.map((s) => {
      if (s.id !== id) return s;
      const u = { ...s, ...patch };
      if (REAL) upsertSalaDb(u).catch(() => {});
      return u;
    }));
  const removeSala = (id) => {
    setSalas((ss) => ss.filter((s) => s.id !== id));
    if (REAL) deleteSalaDb(id).catch(() => {});
  };

  // Produtos da cafeteria (por unidade) ------------------------------------
  const addProduto = (unidadeId, p) =>
    setProdutos((ps) => [...ps, { id: "p" + Date.now(), unidadeId, ativo: true, ...p }]);
  const updateProduto = (id, patch) =>
    setProdutos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removeProduto = (id) => setProdutos((ps) => ps.filter((p) => p.id !== id));

  // Reservas ---------------------------------------------------------------
  // addReserva — híbrido: aceita formato antigo (dia/inicio/dur) e novo
  // (startAt/endAt). Calcula as datas reais, valida CONFLITO no store (não só no
  // modal) e só lança no financeiro se a reserva for criada. Retorna
  // { ok, reserva } ou { ok:false, error }.
  const addReserva = (r) => {
    const sala = salas.find((s) => s.id === r.sala);
    const unidadeId = r.unidadeId || sala?.unidadeId;
    // Datas reais: usa startAt/endAt se vierem; senão deriva do formato antigo.
    let startAt = r.startAt, endAt = r.endAt;
    if (!startAt || !endAt) {
      const { start, end } = legacyReservaToDateRange(r);
      startAt = start.toISOString(); endAt = end.toISOString();
    }
    const durHoras = Math.max(1, Math.round((new Date(endAt) - new Date(startAt)) / 3_600_000));
    const valor = r.valor != null ? r.valor : (sala?.valorHora || 0) * (r.dur || durHoras);
    const id = r.id || "r" + Date.now();
    const origem = r.origem || "recepcao";
    const nova = {
      ...r, id, unidadeId, base: r.base ?? null,
      startAt, endAt, timezone: TZ,
      status: r.status || "confirmada", valor, origem,
      paymentStatus: r.paymentStatus || "pendente",
      createdAt: r.createdAt || new Date().toISOString(),
      vista: origem !== "app",
    };
    // Conflito validado no STORE (defesa além do modal).
    if (temConflito(nova, reservas, { salaTemBases: (sala?.bases || 0) > 0 })) {
      return { ok: false, error: (sala?.bases || 0) > 0 ? "Essa base já está reservada nesse horário." : "Esse horário já está reservado para este espaço." };
    }
    setReservas((rs) => [...rs, nova]);
    if (unidadeId) enfileirarEmail(unidadeId, { cliente: r.cliente, evento: "reserva", dados: { sala: sala?.nome, quando: [r.dia, r.inicio].filter(Boolean).join(" ") } });
    // Contabiliza o valor da reserva no financeiro (conta a receber)
    if (valor > 0 && unidadeId) {
      const sub = sala?.tipo === "Privativa" ? "Aluguel de Salas Privativas" : "Aluguel de Sala de Reunião";
      addLancamento(unidadeId, {
        tipo: "entrada", descricao: `Reserva ${sala?.nome || ""} · ${r.cliente}`,
        categoria: "Receita Operacional Bruta", subcategoria: sub, valor,
        contaId: contas.find((c) => c.unidadeId === unidadeId)?.id, data: "—", status: "previsto",
      });
    }
    return { ok: true, reserva: nova };
  };

  // Versão segura/transacional. Modo real → Edge Function (sem corrida,
  // valida papel e conflito no banco). Modo demo → caminho local síncrono.
  // Sempre assíncrona; retorna { ok, reserva } | { ok:false, error }.
  const criarReserva = async (r) => {
    if (!reservasApi.configured) return addReserva(r);
    const sala = salas.find((s) => s.id === r.sala);
    const unidadeId = r.unidadeId || sala?.unidadeId;
    let startAt = r.startAt, endAt = r.endAt;
    if (!startAt || !endAt) { const { start, end } = legacyReservaToDateRange(r); startAt = start.toISOString(); endAt = end.toISOString(); }
    const durHoras = Math.max(1, Math.round((new Date(endAt) - new Date(startAt)) / 3_600_000));
    const valor = r.valor != null ? r.valor : (sala?.valorHora || 0) * (r.dur || durHoras);
    const resp = await reservasApi.criar({
      unidade_id: unidadeId, sala_id: r.sala, cliente_id: r.clienteId ?? null,
      cliente_nome: r.cliente, cliente_email: r.email ?? null,
      start_at: startAt, end_at: endAt, base: r.base ?? null, origem: r.origem || "recepcao", valor,
    });
    if (!resp.ok) return resp;
    // O servidor pode ter consumido crédito do plano e recalculado o valor para
    // cobrar só o excedente — usamos esse valor como fonte da verdade.
    const valorFinal = resp.reserva?.valor != null ? Number(resp.reserva.valor) : valor;
    const nova = {
      ...r, id: resp.reserva.id, unidadeId, startAt, endAt, base: r.base ?? null,
      status: "confirmada", valor: valorFinal, origem: r.origem || "recepcao",
      paymentStatus: resp.reserva.payment_status || "pendente", vista: (r.origem || "recepcao") !== "app",
    };
    setReservas((rs) => [...rs, nova]);
    // Reflete o consumo de crédito no ledger local (o débito já foi gravado no
    // banco pela Edge Function; aqui só atualiza a tela sem novo fetch).
    const cr = resp.credito;
    if (cr && cr.cobertas > 0) {
      setCreditLedger((ls) => [{
        id: "cl_" + Date.now() + Math.floor(Math.random() * 1000), unidadeId,
        clienteId: r.clienteId || null, clienteEmail: r.email || null, tipo: cr.tipo,
        quantidade: -cr.cobertas, saldoApos: cr.saldoApos, origem: "consumo",
        motivo: `Reserva ${sala?.nome || ""}`.trim(), referenciaId: resp.reserva.id,
        createdAt: new Date().toISOString(),
      }, ...ls]);
    }
    if (unidadeId) enfileirarEmail(unidadeId, { cliente: r.cliente, evento: "reserva", dados: { sala: sala?.nome } });
    if (valorFinal > 0 && unidadeId) {
      const sub = sala?.tipo === "Privativa" ? "Aluguel de Salas Privativas" : "Aluguel de Sala de Reunião";
      addLancamento(unidadeId, { tipo: "entrada", descricao: `Reserva ${sala?.nome || ""} · ${r.cliente}`, categoria: "Receita Operacional Bruta", subcategoria: sub, valor: valorFinal, contaId: contas.find((c) => c.unidadeId === unidadeId)?.id, data: "—", status: "previsto" });
    }
    return { ok: true, reserva: nova, credito: cr || null };
  };
  const marcarReservasVistas = (unidadeId) =>
    setReservas((rs) => rs.map((r) => (r.unidadeId === unidadeId && r.origem === "app" && !r.vista ? { ...r, vista: true } : r)));
  const removeReserva = (id) => setReservas((rs) => rs.filter((r) => r.id !== id));

  // Pedidos da cafeteria (cliente faz no app → recepção recebe) -------------
  const addPedido = (unidadeId, p) => {
    const id = "pd" + Date.now();
    setPedidos((ps) => [{ id, unidadeId, status: "recebido", origem: "app", ...p }, ...ps]);
    // Baixa automática de estoque + CMV. Quando o produto tem ficha técnica,
    // consome cada insumo (qtd da ficha × quantidade vendida) e calcula o CMV
    // pelo custo dos insumos. Sem ficha, baixa pelo próprio nome (comportamento
    // legado), preservando produtos cadastrados antes da ficha técnica.
    let cmv = 0;
    if (p.itens?.length) {
      const consumo = {}; // nome do insumo → quantidade total a baixar
      p.itens.forEach((x) => {
        const prod = catalogo.find(
          (it) => it.tipo === "produto" && it.unidadeId === unidadeId && it.nome === x.nome
        );
        const ficha = prod?.ficha;
        const q = x.q || 1;
        if (ficha && ficha.length) {
          ficha.forEach((f) => {
            if (!f.nome) return;
            consumo[f.nome] = (consumo[f.nome] || 0) + (f.qtd || 1) * q;
          });
        } else {
          consumo[x.nome] = (consumo[x.nome] || 0) + q;
        }
      });
      setEstoque((es) => es.map((it) => {
        if (it.unidadeId !== unidadeId || !(it.nome in consumo)) return it;
        return { ...it, quantidade: Math.max(0, it.quantidade - consumo[it.nome]) };
      }));
      cmv = Object.entries(consumo).reduce((s, [nome, qtd]) => {
        const e = estoque.find((x) => x.unidadeId === unidadeId && x.nome === nome);
        return s + (e ? e.custo * qtd : 0);
      }, 0);
      // Fallback: nenhum insumo bateu no estoque → usa o CMV informado nos itens.
      if (cmv === 0) cmv = p.itens.reduce((s, x) => s + (x.cmv || 0) * (x.q || 1), 0);
    }
    // Integração com o Financeiro: receita da venda (entrada) + CMV (custo direto).
    const caixa = contas.find((c) => c.unidadeId === unidadeId && /caixa/i.test(c.banco))?.id
      || contas.find((c) => c.unidadeId === unidadeId)?.id || "";
    const dataBR = `${String(new Date().getDate()).padStart(2, "0")}/${String(MES_ATUAL + 1).padStart(2, "0")}`;
    if (p.total > 0) {
      addLancamento(unidadeId, { tipo: "entrada", descricao: `Venda cafeteria · ${p.cliente || "balcão"}`, categoria: "Receita Operacional Bruta", subcategoria: "Cafeteria", valor: p.total, contaId: caixa, status: "pago", data: dataBR, origem: "cafeteria" });
    }
    if (cmv > 0) {
      addLancamento(unidadeId, { tipo: "saida", descricao: `Custo cafeteria (CMV) · ${p.cliente || "balcão"}`, categoria: "Custo Direto", subcategoria: "Insumos cafeteria", valor: Math.round(cmv * 100) / 100, contaId: caixa, status: "pago", data: dataBR, origem: "cafeteria-cmv" });
    }
    enfileirarEmail(unidadeId, { cliente: p.cliente, evento: "cafe_pedido", dados: { total: p.total } });
    return id;
  };
  const updatePedido = (id, patch) => {
    setPedidos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    if (patch.status === "pronto") {
      const pe = pedidos.find((p) => p.id === id);
      if (pe) enfileirarEmail(pe.unidadeId, { cliente: pe.cliente, evento: "cafe_pronto", dados: {} });
    }
  };
  const removePedido = (id) => setPedidos((ps) => ps.filter((p) => p.id !== id));
  const pedidosDe = (unidadeId) => pedidos.filter((p) => p.unidadeId === unidadeId);

  // Correspondências (endereço fiscal) -------------------------------------
  const addCorrespondencia = (unidadeId, c) =>
    setCorrespondencias((cs) => [{ id: "co" + Date.now(), unidadeId, status: "aguardando", ...c }, ...cs]);
  const updateCorrespondencia = (id, patch) => {
    setCorrespondencias((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    // Ao avisar o cliente (status "notificado"), dispara o e-mail.
    if (patch.status === "notificado") {
      const co = correspondencias.find((c) => c.id === id);
      if (co) enfileirarEmail(co.unidadeId, { cliente: co.cliente, evento: "correspondencia", dados: { remetente: co.remetente, tipo: co.tipo } });
    }
  };
  const removeCorrespondencia = (id) => setCorrespondencias((cs) => cs.filter((c) => c.id !== id));
  const correspondenciasDe = (unidadeId) => correspondencias.filter((c) => c.unidadeId === unidadeId);

  // Eventos & auditório (por unidade) --------------------------------------
  const eventosDe = (unidadeId) => eventos.filter((e) => e.unidadeId === unidadeId);
  const addEvento = (unidadeId, e) => {
    const novo = { id: "ev" + Date.now(), unidadeId, inscritos: 0, ...e };
    setEventos((es) => [novo, ...es]);
    return novo;
  };
  const updateEvento = (id, patch) => setEventos((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEvento = (id) => setEventos((es) => es.filter((e) => e.id !== id));

  // Chat / conversas (cliente <-> recepção) --------------------------------
  const conversasDe = (unidadeId) => conversas.filter((c) => c.unidadeId === unidadeId);
  const enviarMensagemCliente = (unidadeId, cliente, txt) => {
    setConversas((cs) => {
      const existe = cs.find((c) => c.unidadeId === unidadeId && c.cliente === cliente);
      if (existe) {
        return cs.map((c) => (c.id === existe.id ? { ...c, online: true, unread: (c.unread || 0) + 1, msgs: [...c.msgs, { de: "cli", txt, h: "agora" }] } : c));
      }
      return [...cs, { id: "cv" + Date.now(), unidadeId, cliente, online: true, unread: 1, msgs: [{ de: "cli", txt, h: "agora" }] }];
    });
  };
  const responderConversa = (id, txt) => setConversas((cs) => cs.map((c) => (c.id === id ? { ...c, msgs: [...c.msgs, { de: "adm", txt, h: "Agora" }] } : c)));
  const marcarConversaLida = (id) => setConversas((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));

  // Financeiro: contas bancárias -------------------------------------------
  const addConta = (unidadeId, c) => setContas((cs) => [...cs, { id: "cb" + Date.now(), unidadeId, saldo: 0, ...c }]);
  const updateConta = (id, patch) => setContas((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeConta = (id) => setContas((cs) => cs.filter((c) => c.id !== id));
  const contasDe = (unidadeId) => contas.filter((c) => c.unidadeId === unidadeId);

  // Financeiro: lançamentos (fluxo de caixa) -------------------------------
  const addLancamento = (unidadeId, l) => {
    // Competência: usa l.mes se vier; senão deriva da DATA DE COMPETÊNCIA (ou data/hoje).
    const mes = l.mes != null ? l.mes : parseDateToCompetencia(l.dataCompetencia || l.data).mes;
    setLancamentos((ls) => [...ls, { id: "lc" + Date.now(), unidadeId, status: "pago", ...l, mes }]);
  };
  // Importação em lote (planilha de fluxo de caixa). Um único setState → cada
  // item ganha id/unidadeId e persiste pelo useSync. Retorna quantos entraram.
  const addLancamentosBulk = (unidadeId, lista) => {
    if (!unidadeId || !lista?.length) return 0;
    const base = Date.now();
    const novos = lista.map((l, i) => {
      const mes = l.mes != null ? l.mes : parseDateToCompetencia(l.dataCompetencia || l.data).mes;
      return { id: `lc${base}_${i}`, unidadeId, status: "pago", ...l, mes };
    });
    setLancamentos((ls) => [...ls, ...novos]);
    return novos.length;
  };
  // Conta a pagar/receber recorrente: provisiona um lançamento "previsto" por mês.
  // boletoCfg (opcional, só p/ entrada): { gerar, bankAccountId, sacado, sacadoDocumento }
  // → emite 1 boleto por parcela e vincula lançamento ↔ boleto.
  const addContaRecorrente = (unidadeId, base, meses, boletoCfg) => {
    const grupo = "rec" + Date.now();
    const ts = Date.now();
    const novos = meses.map((m, i) => ({ ...base, id: `lc${ts}_${m}_${i}`, unidadeId, mes: m, status: "previsto", grupoRecorrencia: meses.length > 1 ? grupo : undefined }));
    const novosBoletos = [];
    if (boletoCfg && boletoCfg.gerar && base.tipo === "entrada") {
      const conta = bankAccounts.find((b) => b.id === boletoCfg.bankAccountId);
      novos.forEach((lanc, i) => {
        const id = `bol_${ts}_${i}`;
        const dia = ((lanc.data || "10").split("/")[0] || "10").padStart(2, "0").slice(0, 2);
        const ano = ANO_ATUAL + Math.floor(lanc.mes / 12); // suporta virada de ano
        const venc = `${ano}-${String((lanc.mes % 12) + 1).padStart(2, "0")}-${dia}`;
        novosBoletos.push({
          id, unidadeId, bankAccountId: boletoCfg.bankAccountId,
          sacado: boletoCfg.sacado || base.descricao, sacadoDocumento: boletoCfg.sacadoDocumento || "",
          valor: lanc.valor, vencimento: venc, instrucoes: lanc.descricao,
          ...gerarDadosBoleto(conta?.banco || "inter"),
          status: "registrado", pdfUrl: "", createdAt: new Date().toISOString().slice(0, 10),
          lancamentoId: lanc.id,
        });
        lanc.boletoId = id;
      });
    }
    setLancamentos((ls) => [...ls, ...novos]);
    if (novosBoletos.length) setBoletos((bs) => [...bs, ...novosBoletos]);
    return { lancamentos: novos, boletos: novosBoletos };
  };
  const updateLancamento = (id, patch) => setLancamentos((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLancamento = (id) => setLancamentos((ls) => ls.filter((l) => l.id !== id));
  const lancamentosDe = (unidadeId) => lancamentos.filter((l) => l.unidadeId === unidadeId);

  // Financeiro: catálogo de produtos/serviços ------------------------------
  const addItemCatalogo = (unidadeId, it) => setCatalogo((c) => [...c, { id: "ct" + Date.now(), unidadeId, ativo: true, ...it }]);
  const updateItemCatalogo = (id, patch) => setCatalogo((c) => c.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItemCatalogo = (id) => setCatalogo((c) => c.filter((it) => it.id !== id));
  const catalogoDe = (unidadeId) => catalogo.filter((it) => it.unidadeId === unidadeId);

  // Financeiro: categorias e subcategorias ---------------------------------
  const addCategoria = (c) => setCategorias((cs) => [...cs, { id: "cat" + Date.now(), subs: [], ...c }]);
  const updateCategoria = (id, patch) => setCategorias((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCategoria = (id) => setCategorias((cs) => cs.filter((c) => c.id !== id));

  // Helpers de escopo ------------------------------------------------------
  const salasDe = (unidadeId) => salas.filter((s) => s.unidadeId === unidadeId);
  // Produtos da cafeteria = itens do catálogo do tipo "produto" (cadastrados em
  // "Produtos e Serviços"). Mapeados para o formato que o PDV/cafeteria espera.
  const produtosDe = (unidadeId) =>
    catalogo
      .filter((it) => it.unidadeId === unidadeId && it.tipo === "produto")
      .map((it) => ({
        id: it.id, unidadeId: it.unidadeId, nome: it.nome,
        cat: it.categoria || "Outros", preco: it.preco,
        emoji: it.emoji || "🛍️", cmv: it.custo || 0,
        foto: it.foto || "", ativo: it.ativo, ficha: it.ficha || [],
      }));
  const unidadesDe = (franqueadoId) => unidades.filter((u) => u.franqueadoId === franqueadoId);

  // Clientes (membros do coworking) ---------------------------------------
  const clientesDe = (unidadeNome) => clientes.filter((c) => !unidadeNome || c.unidade === unidadeNome);
  // Write-through: persiste no banco quando há backend/sessão (RLS por unidade).
  const addCliente = (c) => {
    const unidadeId = c.unidadeId || unidades.find((u) => u.nome === c.unidade)?.id || activeUnit;
    const novo = {
      id: "c" + Date.now(), status: "ativo", docs: [],
      desde: c.desde || String(new Date().getFullYear()),
      ...c, unidadeId,
    };
    setClientes((cs) => [novo, ...cs]);
    if (nfseApi.configured) insertCliente(novo).catch(() => {});
    return novo;
  };
  const updateCliente = (id, patch) => {
    setClientes((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (nfseApi.configured) patchCliente(id, patch).catch(() => {});
  };
  const removeCliente = (id) => {
    setClientes((cs) => cs.filter((c) => c.id !== id));
    if (nfseApi.configured) deleteClienteDb(id).catch(() => {});
  };

  // Estoque -----------------------------------------------------------------
  const estoqueDe = (unidadeId) => estoque.filter((e) => e.unidadeId === unidadeId);
  const estoqueBaixoDe = (unidadeId) =>
    estoque.filter((e) => e.unidadeId === unidadeId && e.quantidade <= e.estoqueMinimo);
  const addItemEstoque = (unidadeId, it) =>
    setEstoque((es) => [...es, { id: "es" + Date.now(), unidadeId, quantidade: 0, estoqueMinimo: 0, unidade: "un", custo: 0, ...it }]);
  const updateItemEstoque = (id, patch) =>
    setEstoque((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeItemEstoque = (id) => setEstoque((es) => es.filter((e) => e.id !== id));
  // Entrada (+) ou baixa (−) de estoque; nunca abaixo de zero.
  const ajustarEstoque = (id, delta) =>
    setEstoque((es) => es.map((e) => (e.id === id ? { ...e, quantidade: Math.max(0, e.quantidade + delta) } : e)));
  // Compra/reposição: dá entrada no estoque, atualiza o custo e lança no
  // Financeiro como CONTA A PAGAR. A compra é "Conta Movimentação" (estoque é
  // ativo) — o custo só vira resultado (CMV) quando o item é vendido.
  const comprarEstoque = (unidadeId, itemId, { quantidade, custoUnit, fornecedor, pago }) => {
    const item = estoque.find((e) => e.id === itemId);
    if (quantidade > 0) ajustarEstoque(itemId, quantidade);
    if (custoUnit > 0) updateItemEstoque(itemId, { custo: custoUnit });
    const total = (quantidade || 0) * (custoUnit || 0);
    if (total > 0 && item) {
      const caixa = contas.find((c) => c.unidadeId === unidadeId)?.id || "";
      const dataBR = `${String(new Date().getDate()).padStart(2, "0")}/${String(MES_ATUAL + 1).padStart(2, "0")}`;
      addLancamento(unidadeId, {
        tipo: "saida", descricao: `Compra · ${item.nome}${fornecedor ? ` · ${fornecedor}` : ""}`,
        categoria: "Conta Movimentação", subcategoria: "Compra de estoque",
        valor: Math.round(total * 100) / 100, contaId: caixa,
        status: pago ? "pago" : "previsto", data: dataBR, origem: "compra-estoque",
      });
    }
  };

  // Venda de item de REVENDA (loja) ao cliente: baixa o estoque e lança no
  // financeiro a receita (preço de venda) + o custo direto (CMV).
  const venderEstoque = (unidadeId, itemId, quantidade = 1, cliente = "") => {
    const item = estoque.find((e) => e.id === itemId);
    if (!item || quantidade <= 0) return;
    const qtd = Math.min(quantidade, item.quantidade);
    if (qtd <= 0) return;
    ajustarEstoque(itemId, -qtd);
    const receita = Math.round((item.precoVenda || 0) * qtd * 100) / 100;
    const cmv = Math.round((item.custo || 0) * qtd * 100) / 100;
    const caixa = contas.find((c) => c.unidadeId === unidadeId && /caixa/i.test(c.banco))?.id
      || contas.find((c) => c.unidadeId === unidadeId)?.id || "";
    const dataBR = `${String(new Date().getDate()).padStart(2, "0")}/${String(MES_ATUAL + 1).padStart(2, "0")}`;
    if (receita > 0) addLancamento(unidadeId, { tipo: "entrada", descricao: `Venda · ${item.nome}${cliente ? ` · ${cliente}` : ""} (${qtd}x)`, categoria: "Receita Operacional Bruta", subcategoria: "Loja / Revenda", valor: receita, contaId: caixa, status: "pago", data: dataBR, origem: "loja" });
    if (cmv > 0) addLancamento(unidadeId, { tipo: "saida", descricao: `Custo revenda · ${item.nome} (${qtd}x)`, categoria: "Custo Direto", subcategoria: "Material de consumo", valor: cmv, contaId: caixa, status: "pago", data: dataBR, origem: "loja-cmv" });
    return { receita, cmv, qtd };
  };

  // Patrimônio (ativos mobilizados) -----------------------------------------
  const patrimonioDe = (unidadeId) => patrimonio.filter((a) => a.unidadeId === unidadeId);
  const addAtivo = (unidadeId, a) =>
    setPatrimonio((ps) => [...ps, { id: "pt" + Date.now(), unidadeId, quantidade: 1, valorUnitario: 0, anexo: null, ...a }]);
  const updateAtivo = (id, patch) =>
    setPatrimonio((ps) => ps.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAtivo = (id) => setPatrimonio((ps) => ps.filter((a) => a.id !== id));

  // Nota fiscal (NFS-e) — config por unidade + emissão -----------------------
  const configFiscalDe = (unidadeId) => configFiscal.find((c) => c.unidadeId === unidadeId);
  const updateConfigFiscal = (unidadeId, patch) =>
    setConfigFiscal((cs) => {
      const existe = cs.some((c) => c.unidadeId === unidadeId);
      return existe ? cs.map((c) => (c.unidadeId === unidadeId ? { ...c, ...patch } : c))
        : [...cs, { unidadeId, emissor: "nacional", ambiente: "homologacao", emissaoAtiva: true, aliquotaISS: 0, ...patch }];
    });
  // Salva a config fiscal: atualiza em memória e persiste no banco (PostgREST)
  // quando há backend/sessão. Os campos do certificado são gravados à parte
  // (Edge Function salvar-certificado), por isso não vão neste upsert.
  const salvarConfigFiscal = (unidadeId, patch) => {
    updateConfigFiscal(unidadeId, patch);
    if (nfseApi.configured) upsertConfigFiscal({ unidadeId, ...patch }).catch(() => {});
  };
  const notasFiscaisDe = (unidadeId) => notasFiscais.filter((n) => n.unidadeId === unidadeId);

  const _mapApiNota = (n) => ({
    id: n.id, unidadeId: n.unidade_id, numero: n.numero,
    tomador: n.tomador, tomadorDoc: n.tomador_documento, descricao: n.descricao,
    valor: Number(n.valor), iss: Number(n.iss || 0), status: n.status,
    emitidaEm: (n.created_at || "").slice(0, 10), pdfUrl: n.pdf_url || "", xmlUrl: n.xml_url || "",
    boletoId: n.boleto_id || null,
  });

  // PRODUÇÃO: a Edge Function assina (xmldsig) e transmite ao SEFIN Nacional
  // (ou BHISS). DEMO: gera número/ISS plausíveis em memória.
  const emitirNFSe = (unidadeId, dados) => {
    if (nfseApi.configured) {
      nfseApi.emitir({
        unidade_id: unidadeId, tomador: dados.tomador, tomador_documento: dados.tomadorDoc,
        tomador_email: dados.tomadorEmail, valor: dados.valor, descricao: dados.descricao,
        boleto_id: dados.boletoId,
      }).then(({ nota }) => setNotasFiscais((ns) => [_mapApiNota(nota), ...ns]))
        .catch((e) => console.warn("emitir NFS-e:", e.message));
      return;
    }
    const cfg = configFiscal.find((c) => c.unidadeId === unidadeId);
    const iss = Math.round(((dados.valor || 0) * (cfg?.aliquotaISS || 0) / 100) * 100) / 100;
    const nota = {
      id: "nf" + Date.now(), unidadeId,
      numero: String(++_nfSeq).padStart(6, "0"),
      tomador: dados.tomador || "Tomador", tomadorDoc: dados.tomadorDoc || "",
      descricao: dados.descricao || cfg?.descricaoServico || "Serviço",
      valor: dados.valor, iss, status: "autorizada",
      emitidaEm: new Date().toISOString().slice(0, 10), pdfUrl: "", xmlUrl: "", boletoId: dados.boletoId,
    };
    setNotasFiscais((ns) => [nota, ...ns]);
    return nota;
  };
  const cancelarNF = (id) => {
    const aplicar = () => setNotasFiscais((ns) => ns.map((n) => (n.id === id ? { ...n, status: "cancelada" } : n)));
    if (nfseApi.configured) { nfseApi.cancelar(id).then(aplicar).catch(() => {}); return; }
    aplicar();
  };

  // Envia o certificado A1 (.pfx) ao backend (Vault) e marca a config.
  // Retorna uma Promise para a UI mostrar sucesso/erro. Só em produção.
  const salvarCertificadoFiscal = (unidadeId, { pfxBase64, senha }) => {
    if (!nfseApi.configured) {
      // DEMO: registra que "recebeu" o certificado, sem enviar a lugar nenhum.
      updateConfigFiscal(unidadeId, { certificadoEnviadoEm: new Date().toISOString().slice(0, 10), certificadoTitular: "Certificado (demo)" });
      return Promise.resolve({ ok: true, demo: true });
    }
    return nfseApi.salvarCertificado({ unidade_id: unidadeId, pfx_base64: pfxBase64, senha }).then((r) => {
      updateConfigFiscal(unidadeId, {
        certificadoRef: r.certificado_ref, certificadoTitular: r.titular,
        certificadoValidade: r.validade, certificadoEnviadoEm: new Date().toISOString().slice(0, 10),
      });
      return r;
    });
  };

  // Planos vendáveis (por unidade) — cobrança e autocheckout do cliente ------
  const planosDe = (unidadeId, incluirInativos = false) =>
    planos.filter((p) => p.unidadeId === unidadeId && (incluirInativos || p.ativo !== false));
  const addPlano = (unidadeId, p) => {
    const id = "pl_" + Date.now();
    setPlanos((ps) => [...ps, { id, unidadeId, recorrencia: "mensal", emiteNF: true, ativo: true, ...p, preco: Number(p.preco || 0) }]);
    return id;
  };
  const updatePlano = (id, patch) =>
    setPlanos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch, ...(patch.preco != null ? { preco: Number(patch.preco) } : {}) } : p)));
  const removePlano = (id) => setPlanos((ps) => ps.filter((p) => p.id !== id));

  // Recibos — comprovante simples (quando não se emite nota fiscal) ----------
  const recibosDe = (unidadeId) => recibos.filter((r) => r.unidadeId === unidadeId);
  const emitirRecibo = (unidadeId, dados) => {
    const numero = String(recibos.filter((r) => r.unidadeId === unidadeId).length + 1).padStart(5, "0");
    const rec = {
      id: "rec_" + Date.now(), unidadeId, numero,
      cliente: dados.cliente || "Cliente", clienteDoc: dados.clienteDoc || "",
      valor: Number(dados.valor || 0), descricao: dados.descricao || "Recebimento",
      forma: dados.forma || "", cobrancaId: dados.cobrancaId || null,
      emitidoEm: new Date().toISOString().slice(0, 10),
    };
    setRecibos((rs) => [rec, ...rs]);
    return rec;
  };
  const removeRecibo = (id) => setRecibos((rs) => rs.filter((r) => r.id !== id));

  // Créditos do plano — ledger auditável (saldo = soma das movimentações) ------
  const CREDITO_TIPOS = ["sala_reuniao", "coworking", "daypass", "correspondencia"];
  const ledgerDe = (clienteId) => creditLedger.filter((e) => e.clienteId === clienteId);
  const saldoCreditos = (clienteId, tipo) =>
    creditLedger.filter((e) => e.clienteId === clienteId && e.tipo === tipo).reduce((s, e) => s + (e.quantidade || 0), 0);
  const saldosCliente = (clienteId) =>
    CREDITO_TIPOS.reduce((a, t) => ((a[t] = saldoCreditos(clienteId, t)), a), {});
  const lancarCredito = (unidadeId, clienteId, tipo, quantidade, origem, motivo, referenciaId) => {
    if (!clienteId || !tipo || !quantidade) return null;
    const cli = clientes.find((c) => c.id === clienteId);
    const reg = {
      id: "cl_" + Date.now() + Math.floor(Math.random() * 1000), unidadeId, clienteId,
      clienteEmail: cli?.email || null, tipo,
      quantidade, saldoApos: saldoCreditos(clienteId, tipo) + quantidade,
      origem: origem || "ajuste_manual", motivo: motivo || "", referenciaId: referenciaId || null,
      createdAt: new Date().toISOString(),
    };
    setCreditLedger((ls) => [reg, ...ls]);
    // Produção: persiste no ledger relacional (fonte da verdade). Best-effort.
    if (REAL) insertCreditoDb(reg).catch(() => {});
    return reg;
  };
  // Direito do plano → tipo de crédito.
  const DIREITO_CREDITO = { horasReuniao: "sala_reuniao", horasCoworking: "coworking", dayPass: "daypass", correspondencias: "correspondencia" };
  const concederCreditosPlano = (cliente, plano) => {
    if (!cliente?.id || !plano) return 0;
    const d = plano.direitos || {};
    let n = 0;
    Object.entries(DIREITO_CREDITO).forEach(([campo, tipo]) => {
      const q = Number(d[campo] || 0);
      if (q > 0) { lancarCredito(cliente.unidadeId, cliente.id, tipo, q, "plano", `Plano ${plano.nome}`, plano.id); n++; }
    });
    return n;
  };
  const consumirCredito = (clienteId, tipo, quantidade = 1, referenciaId) => {
    const saldo = saldoCreditos(clienteId, tipo);
    if (saldo < quantidade) return { ok: false, saldo };
    const cli = clientes.find((c) => c.id === clienteId);
    lancarCredito(cli?.unidadeId, clienteId, tipo, -quantidade, "consumo", "", referenciaId);
    return { ok: true, saldo: saldo - quantidade };
  };
  const ajustarCredito = (unidadeId, clienteId, tipo, quantidade, motivo) =>
    lancarCredito(unidadeId, clienteId, tipo, quantidade, "ajuste_manual", motivo);

  // Boletos / contas bancárias --------------------------------------------
  // ⚠️ Demonstração: em produção, addBankAccount manda a credencial pro Vault
  // e emitirBoleto/cancelarBoleto chamam as Edge Functions (boletosApi.js).
  const bankAccountsDe = (unidadeId) => bankAccounts.filter((b) => b.unidadeId === unidadeId);
  const addBankAccount = (unidadeId, data) =>
    setBankAccounts((bs) => [...bs, { id: "ba_" + Date.now(), unidadeId, ativo: true, ...data }]);
  const updateBankAccount = (id, patch) =>
    setBankAccounts((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBankAccount = (id) => setBankAccounts((bs) => bs.filter((b) => b.id !== id));
  // Conexão (consentimento OAuth) com o banco. Em produção, o "Conectar"
  // redireciona pro consentimento do banco e o callback marca como conectado;
  // aqui (demo) simulamos a autorização concedida.
  const conectarBanco = (id) =>
    setBankAccounts((bs) => bs.map((b) => (b.id === id ? { ...b, conexao: { status: "conectado", boleto: true, pix: true, conectadoEm: new Date().toISOString().slice(0, 10) } } : b)));
  const desconectarBanco = (id) =>
    setBankAccounts((bs) => bs.map((b) => (b.id === id ? { ...b, conexao: { status: "desconectado", boleto: false, pix: false } } : b)));

  const boletosDe = (unidadeId) =>
    boletos.filter((b) => b.unidadeId === unidadeId).slice().reverse();

  // Mapeia a linha do banco (Edge Function) para o formato do front.
  const _mapApiBoleto = (r, unidadeId) => ({
    id: r.id, unidadeId: r.unidade_id || unidadeId, bankAccountId: r.bank_account_id,
    sacado: r.sacado, sacadoDocumento: r.sacado_documento, valor: Number(r.valor),
    vencimento: r.vencimento, nossoNumero: r.nosso_numero, linhaDigitavel: r.linha_digitavel,
    codigoBarras: r.codigo_barras, pixCopiaCola: r.pix_copia_cola, status: r.status,
    pdfUrl: r.pdf_url || "", createdAt: (r.created_at || "").slice(0, 10),
  });
  const _avisarBoletoEmail = (unidadeId, b, email) =>
    enfileirarEmail(unidadeId, { cliente: b.sacado, email, evento: "boleto_nova",
      dados: { valor: b.valor, vencimento: b.vencimento, linhaDigitavel: b.linhaDigitavel, pixCopiaCola: b.pixCopiaCola } });

  const emitirBoleto = (unidadeId, dados) => {
    // PRODUÇÃO: emite pela Edge Function (credenciais no Vault, nunca no front).
    if (boletosApi.configured) {
      boletosApi.emitir({
        bank_account_id: dados.bankAccountId, sacado: dados.sacado,
        sacado_documento: dados.sacadoDocumento, sacado_email: dados.sacadoEmail,
        valor: dados.valor, vencimento: dados.vencimento, instrucoes: dados.instrucoes,
      }).then(({ boleto }) => {
        const b = _mapApiBoleto(boleto, unidadeId);
        setBoletos((bs) => [...bs, b]);
        _avisarBoletoEmail(unidadeId, b, dados.sacadoEmail);
      }).catch((e) => {
        setBoletos((bs) => [...bs, { id: "bolerr_" + Date.now(), unidadeId, ...dados, status: "erro", erro: String(e?.message || e), createdAt: new Date().toISOString().slice(0, 10) }]);
      });
      return null;
    }
    // DEMO: gera dados plausíveis localmente.
    const conta = bankAccounts.find((b) => b.id === dados.bankAccountId);
    const novo = {
      id: "bol_" + Date.now(), unidadeId, ...dados,
      ...gerarDadosBoleto(conta?.banco || "inter"),
      status: "registrado", pdfUrl: "", createdAt: new Date().toISOString().slice(0, 10),
    };
    setBoletos((bs) => [...bs, novo]);
    _avisarBoletoEmail(unidadeId, novo, dados.sacadoEmail);
    return novo;
  };

  const cancelarBoleto = (id) => {
    const aplicar = () => setBoletos((bs) => bs.map((b) => (b.id === id ? { ...b, status: "cancelado" } : b)));
    if (boletosApi.configured) { boletosApi.cancelar(id).then(aplicar).catch(() => {}); return; }
    aplicar();
  };

  // Sincroniza a situação com o banco (consultar-boleto). Em produção, a baixa
  // chega sozinha pelo webhook; este botão força um "puxar agora".
  const sincronizarBoleto = (id) => {
    if (!boletosApi.configured) return;
    boletosApi.consultar(id).then(({ boleto }) => {
      const r = _mapApiBoleto(boleto, undefined);
      setBoletos((bs) => bs.map((b) => (b.id === id ? { ...b, status: r.status, linhaDigitavel: r.linhaDigitavel || b.linhaDigitavel, pixCopiaCola: r.pixCopiaCola || b.pixCopiaCola, pdfUrl: r.pdfUrl || b.pdfUrl } : b)));
      if (r.status === "pago") {
        const bb = boletos.find((x) => x.id === id);
        if (bb?.lancamentoId) setLancamentos((ls) => ls.map((l) => (l.id === bb.lancamentoId ? { ...l, status: "pago" } : l)));
      }
    }).catch(() => {});
  };
  // Simula a baixa que, em produção, chega pela Edge Function de webhook.
  // Se o boleto veio de uma conta a receber, dá baixa no lançamento vinculado.
  const baixarBoleto = (id) => {
    const bol = boletos.find((b) => b.id === id);
    setBoletos((bs) => bs.map((b) => (b.id === id ? { ...b, status: "pago", paidAt: new Date().toISOString().slice(0, 10) } : b)));
    if (bol?.lancamentoId) setLancamentos((ls) => ls.map((l) => (l.id === bol.lancamentoId ? { ...l, status: "pago" } : l)));
    if (bol) {
      enfileirarEmail(bol.unidadeId, { cliente: bol.sacado, evento: "boleto_pago", dados: { valor: bol.valor } });
      // NFS-e automática na baixa da cobrança, se a unidade emite nota.
      const cfg = configFiscal.find((c) => c.unidadeId === bol.unidadeId);
      if (cfg?.emissaoAtiva && bol.status !== "pago") {
        emitirNFSe(bol.unidadeId, { tomador: bol.sacado, tomadorDoc: bol.sacadoDocumento, valor: bol.valor, descricao: bol.instrucoes, boletoId: bol.id });
      }
    }
  };

  // Contratos recorrentes ---------------------------------------------------
  const mesFimContrato = (c) => Math.min(c.mesInicial + c.meses - 1, 11);
  const contratosDe = (unidadeId) => contratos.filter((c) => c.unidadeId === unidadeId);
  // "Vencendo" = ativo cujo prazo já chegou ao fim → financeiro precisa renovar.
  const contratosVencendoDe = (unidadeId) =>
    contratos.filter((c) => c.unidadeId === unidadeId && c.status === "ativo" && mesFimContrato(c) <= MES_ATUAL);

  // Provisiona as cobranças mensais (contas a receber + boletos) de um período.
  const gerarCobrancasContrato = (c, inicio, fim, valor, sufixo = "") => {
    const meses = [];
    for (let m = inicio; m <= fim; m++) meses.push(m);
    if (!meses.length) return;
    const contaCx = contas.find((x) => x.unidadeId === c.unidadeId)?.id || "";
    const base = {
      tipo: "entrada",
      descricao: `${c.plano} · ${c.cliente}${sufixo}`,
      categoria: "Receita Operacional Bruta", subcategoria: "",
      valor, contaId: contaCx, data: String(c.diaVencimento || "10"),
      recorrente: true, contratoId: c.id,
    };
    addContaRecorrente(c.unidadeId, base, meses, {
      gerar: true, bankAccountId: c.bankAccountId, sacado: c.cliente, sacadoDocumento: c.documento,
    });
  };

  const addContrato = (unidadeId, cfg) => {
    const id = "ct_" + Date.now();
    const contrato = {
      id, unidadeId, cliente: cfg.cliente, documento: cfg.documento, plano: cfg.plano,
      valorMensal: cfg.valorMensal, bankAccountId: cfg.bankAccountId, diaVencimento: cfg.diaVencimento || "10",
      mesInicial: cfg.mesInicial, meses: cfg.meses, status: "ativo", criadoEm: new Date().toISOString().slice(0, 7),
    };
    setContratos((cs) => [...cs, contrato]);
    gerarCobrancasContrato(contrato, cfg.mesInicial, Math.min(cfg.mesInicial + cfg.meses - 1, 11), cfg.valorMensal);
    return contrato;
  };

  // Renova: novo prazo a partir do mês seguinte, com valor atualizado.
  const renovarContrato = (id, patch) => {
    const c = contratos.find((x) => x.id === id);
    if (!c) return;
    const inicio = Math.min(MES_ATUAL + 1, 11);
    const novoValor = patch?.valorMensal ?? c.valorMensal;
    const novoPrazo = patch?.meses ?? c.meses;
    setContratos((cs) => cs.map((x) => (x.id === id
      ? { ...x, valorMensal: novoValor, meses: novoPrazo, mesInicial: inicio, status: "ativo", renovadoEm: new Date().toISOString().slice(0, 7) }
      : x)));
    gerarCobrancasContrato({ ...c, valorMensal: novoValor }, inicio, Math.min(inicio + novoPrazo - 1, 11), novoValor, " (renovado)");
  };

  const encerrarContrato = (id) => setContratos((cs) => cs.map((c) => (c.id === id ? { ...c, status: "encerrado" } : c)));

  // Modo "ver como franqueado" + perfis de acesso --------------------------
  const enterViewAs = (franqueadoId) => {
    const us = unidades.filter((u) => u.franqueadoId === franqueadoId);
    setViewAs(franqueadoId);
    setPerfilState("master");
    if (us[0]) setActiveUnit(us[0].id);
  };
  const exitViewAs = () => {
    setViewAs(null);
    setPerfilState("franqueador");
  };

  // Pré-visualizar o app como um perfil de usuário
  const setPerfil = (p) => {
    setPerfilState(p);
    if (p === "master") {
      const fr = franqueados[0];
      if (fr) {
        setViewAs(fr.id);
        const us = unidades.filter((u) => u.franqueadoId === fr.id);
        if (us[0]) setActiveUnit(us[0].id);
      }
    } else {
      setViewAs(null);
    }
  };

  // Pré-visualizar como um usuário específico (usa o perfil e a unidade dele)
  const verComoUsuario = (u) => {
    setPerfilState(u.perfil);
    const un = unidades.find((x) => x.id === u.unidadeId);
    setViewAs(un?.franqueadoId || null);
    if (u.unidadeId) setActiveUnit(u.unidadeId);
  };

  // PRODUÇÃO: aplica o perfil/unidade do usuário LOGADO a partir dos vínculos
  // (unidade_members). Sem vínculos = admin da plataforma (franqueador).
  const ROLE_PERFIL = { franqueador: "franqueador", admin: "franqueador", master: "master", financeiro: "financeiro", recepcao: "recepcao", cliente: "cliente" };
  const CARGO_LABEL = { franqueador: "Administrador", master: "Master", financeiro: "Financeiro", recepcao: "Recepção", cliente: "Cliente" };
  // Atualiza a identidade exibida (rodapé do menu) com o usuário REALMENTE logado.
  const _aplicarIdentidade = (ident, perfilKey) => {
    if (!ident) return;
    const doEmail = ident.email ? ident.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
    setMeuPerfil((p) => ({
      ...p,
      nome: ident.nome || doEmail || p.nome,
      email: ident.email || p.email,
      cargo: CARGO_LABEL[perfilKey] || p.cargo,
      foto: "",
    }));
  };
  const aplicarSessaoUsuario = (membros, isPlatformAdmin, ident = null) => {
    // Admin da plataforma (vendedor do app) → painel da plataforma + Contas.
    if (isPlatformAdmin) { setPerfilState("franqueador"); setViewAs(null); _aplicarIdentidade(ident, "franqueador"); return; }
    if (!membros || !membros.length) { setPerfilState("franqueador"); setViewAs(null); _aplicarIdentidade(ident, "franqueador"); return; }
    const m = membros[0];
    const perfilKey = ROLE_PERFIL[m.role] || "master";
    setPerfilState(perfilKey);
    setViewAs(m.franqueado_id || null);
    if (m.unidade_id) setActiveUnit(m.unidade_id);
    _aplicarIdentidade(ident, perfilKey);
  };

  // Após onboarding: adiciona a conta + unidade recém-criadas ao estado.
  const adicionarCoworking = ({ conta, unidade }) => {
    if (conta) setFranqueados((fs) => (fs.some((f) => f.id === conta.id) ? fs : [...fs, conta]));
    if (unidade) setUnidades((us) => (us.some((u) => u.id === unidade.id) ? us : [...us, unidade]));
  };
  // Remove a conta e tudo dela do estado (após excluir no backend).
  const removerCoworking = (contaId) => {
    setFranqueados((fs) => fs.filter((f) => f.id !== contaId));
    setUnidades((us) => us.filter((u) => u.franqueadoId !== contaId));
  };
  // Remove uma unidade do estado (após excluir no backend).
  const removerUnidade = (unidadeId) => setUnidades((us) => us.filter((u) => u.id !== unidadeId));

  // Substitui o seed pelos dados reais do banco (quando logado/configurado).
  const hydrateFromDb = (dados) => {
    if (!dados) return; // backend indisponível → mantém o seed (demo)
    // Reflete o banco EXATAMENTE (inclusive vazio) — não mantém dado antigo.
    if (dados.contas) setFranqueados(dados.contas);
    if (dados.unidades) setUnidades(dados.unidades);
    if (dados.usuarios) setUsuarios(dados.usuarios);
    if (dados.clientes) setClientes(dados.clientes);
  };

  // config_fiscal (linha do banco, snake) → formato do store (camel).
  const _mapConfigFiscal = (r) => ({
    unidadeId: r.unidade_id, municipio: r.municipio, codigoMunicipio: r.codigo_municipio, uf: r.uf, cnpj: r.cnpj,
    inscricaoMunicipal: r.inscricao_municipal, regime: r.regime,
    codigoServico: r.codigo_servico, descricaoServico: r.descricao_servico,
    aliquotaISS: Number(r.aliquota_iss || 0), emissor: r.emissor, ambiente: r.ambiente,
    certificadoRef: r.certificado_ref, certificadoTitular: r.certificado_titular,
    certificadoValidade: r.certificado_validade, certificadoEnviadoEm: r.certificado_enviado_em,
    emissaoAtiva: r.emissao_ativa,
    codigoTributacaoNacional: r.codigo_tributacao_nacional, codigoServicoMunicipal: r.codigo_servico_municipal,
    nbs: r.nbs, regimeEspecial: r.regime_especial, aliquotaSimples: Number(r.aliquota_simples || 0),
    issRetido: r.iss_retido, exigibilidadeIss: r.exigibilidade_iss,
  });

  // Hidrata as entidades operacionais (app_state) + as de tabela própria
  // (boletos, notas, config fiscal). Chamado pelo App.jsx após o login.
  const hydrateOperacional = ({ appState, boletos: bs, notas, config, reservas: reservasDb, creditos } = {}) => {
    if (appState?.length) {
      const byEntity = {};
      for (const r of appState) (byEntity[r.entity] ||= []).push(r.doc);
      const apply = (entity, setter) => {
        if (!byEntity[entity]) return;
        setter(byEntity[entity]);
        const m = new Map();
        for (const it of byEntity[entity]) {
          if (it?.id != null && it?.unidadeId) m.set(it.id, { unidadeId: it.unidadeId, json: JSON.stringify(it) });
        }
        syncedRef.current[entity] = m;
      };
      apply("salas", setSalas); apply("reservas", setReservas); apply("lancamentos", setLancamentos);
      apply("contas", setContas); apply("catalogo", setCatalogo); apply("estoque", setEstoque);
      apply("patrimonio", setPatrimonio); apply("contratos", setContratos);
      apply("correspondencias", setCorrespondencias); apply("pedidos", setPedidos);
      apply("conversas", setConversas); apply("leads", setLeads); apply("eventos", setEventos);
      apply("planos", setPlanos); apply("recibos", setRecibos);
      // Docs globais (doc único) — carrega UMA VEZ por carregamento de página.
      // Re-hidratações (refresh de sessão) NÃO recarregam, para não sobrescrever
      // uma edição local recém-feita. PREFERE o doc da unidade REAL, nunca um id
      // seed órfão (ex.: "lux"), que teria os padrões e apagaria as customizações.
      if (!docsGlobaisHidratadosRef.current) {
        const seedUnitIds = new Set(UNIDADES.map((u) => u.id));
        const pickDocGlobal = (entity) => {
          const rows = appState.filter((r) => r.entity === entity);
          if (!rows.length) return null;
          return (rows.find((r) => !seedUnitIds.has(r.unidade_id)) || rows[0]).doc;
        };
        // Plano de contas: usa o doc salvo EXATAMENTE (respeita exclusões do
        // usuário). NÃO mescla defaults — senão categorias deletadas voltavam.
        const pcDoc = pickDocGlobal("planoContas");
        if (pcDoc?.itens?.length) setCategorias(pcDoc.itens);
        const ceDoc = pickDocGlobal("crmEtapas");
        if (ceDoc?.itens?.length) setCrmEtapas(ceDoc.itens);
        const coDoc = pickDocGlobal("crmOrigens");
        if (coDoc?.itens?.length) setCrmOrigens(coDoc.itens);
      }
      // creditLedger NÃO vem do app_state (migrado para a tabela relacional).
      // Backfill: as salas vivem no app_state; garante que existam também na
      // tabela relacional (a função criar_reserva_segura valida a sala lá).
      if (REAL && byEntity.salas) byEntity.salas.forEach((s) => upsertSalaDb(s).catch(() => {}));
    }
    if (bs?.length) setBoletos(bs.map((b) => _mapApiBoleto(b, b.unidade_id)));
    if (notas?.length) setNotasFiscais(notas.map(_mapApiNota));
    if (config?.length) setConfigFiscal(config.map(_mapConfigFiscal));
    // Reservas relacionais (tabela) — fonte das reservas novas. Mescla com as do
    // app_state por id (a relacional prevalece).
    if (reservasDb?.length) {
      const mapped = reservasDb.map((r) => ({
        id: r.id, unidadeId: r.unidade_id, sala: r.sala_id, base: r.base ?? null,
        cliente: r.cliente_nome, clienteId: r.cliente_id, email: r.cliente_email,
        startAt: r.start_at, endAt: r.end_at, ...dateRangeToLegacy(r.start_at, r.end_at),
        status: r.status, origem: r.origem, valor: Number(r.valor || 0),
        paymentStatus: r.payment_status, vista: r.origem !== "app",
      }));
      const ids = new Set(mapped.map((m) => m.id));
      setReservas((prev) => [...prev.filter((r) => !ids.has(r.id)), ...mapped]);
    }
    // Créditos do plano (ledger relacional). Substitui qualquer estado anterior.
    if (creditos) setCreditLedger(creditos);
    // A partir daqui os docs globais podem sincronizar (já hidratou).
    docsGlobaisHidratadosRef.current = true;
  };

  // Unidades visíveis no modo atual
  const unidadesVisiveis = viewAs ? unidades.filter((u) => u.franqueadoId === viewAs) : unidades;
  const franqueadoAtivo = viewAs ? franqueados.find((f) => f.id === viewAs) : null;

  const value = useMemo(
    () => ({
      unidades, franqueados, usuarios, salas, produtos, reservas,
      leads, setLeads, crmEtapas, setCrmEtapas, crmOrigens, setCrmOrigens,
      eventos, eventosDe, addEvento, updateEvento, removeEvento,
      removerCoworking, removerUnidade,
      activeUnit, setActiveUnit,
      unidadeAtiva: unidades.find((u) => u.id === activeUnit) || unidadesVisiveis[0] || unidades[0],
      unidadesVisiveis,
      viewAs, franqueadoAtivo, enterViewAs, exitViewAs,
      perfil, setPerfil, verComoUsuario, aplicarSessaoUsuario, adicionarCoworking, hydrateFromDb, hydrateOperacional,
      meuPerfil, updateMeuPerfil,
      notificacaoPrefs, updateNotificacaoPrefs,
      notificacoesEmail, notificacoesEmailDe, enfileirarEmail,
      clienteNotifPrefs, updateClienteNotifPrefs,
      addFranqueado, updateFranqueado, removeFranqueado,
      addUsuario, adicionarUsuario, updateUsuario, removeUsuario, usuariosDe,
      clientes, clientesDe, addCliente, updateCliente, removeCliente,
      addUnidade, updateUnidade,
      addSala, updateSala, removeSala,
      addProduto, updateProduto, removeProduto,
      addReserva, criarReserva, removeReserva, marcarReservasVistas,
      pedidos, addPedido, updatePedido, removePedido, pedidosDe,
      correspondencias, addCorrespondencia, updateCorrespondencia, removeCorrespondencia, correspondenciasDe,
      conversas, conversasDe, enviarMensagemCliente, responderConversa, marcarConversaLida,
      salasDe, produtosDe, unidadesDe,
      contas, lancamentos, catalogo, categorias,
      addConta, updateConta, removeConta, contasDe,
      addLancamento, addLancamentosBulk, addContaRecorrente, updateLancamento, removeLancamento, lancamentosDe,
      addItemCatalogo, updateItemCatalogo, removeItemCatalogo, catalogoDe,
      addCategoria, updateCategoria, removeCategoria,
      bankAccounts, boletos,
      bankAccountsDe, addBankAccount, updateBankAccount, removeBankAccount, conectarBanco, desconectarBanco,
      boletosDe, emitirBoleto, cancelarBoleto, baixarBoleto, sincronizarBoleto,
      contratos, contratosDe, contratosVencendoDe, mesFimContrato,
      addContrato, renovarContrato, encerrarContrato,
      estoque, estoqueDe, estoqueBaixoDe, addItemEstoque, updateItemEstoque, removeItemEstoque, ajustarEstoque, comprarEstoque, venderEstoque,
      patrimonio, patrimonioDe, addAtivo, updateAtivo, removeAtivo,
      configFiscal, configFiscalDe, updateConfigFiscal, salvarConfigFiscal, notasFiscais, notasFiscaisDe, emitirNFSe, cancelarNF, salvarCertificadoFiscal,
      planos, planosDe, addPlano, updatePlano, removePlano,
      recibos, recibosDe, emitirRecibo, removeRecibo,
      creditLedger, CREDITO_TIPOS, ledgerDe, saldoCreditos, saldosCliente, concederCreditosPlano, consumirCredito, ajustarCredito,
      syncErrors,
    }),
    // As ações (addX/updateX/...) são closures estáveis recriadas a cada render;
    // memorizamos o value apenas pelos ESTADOS. Incluir as funções nas deps
    // anularia o useMemo (novo objeto a cada render) — comportamento indesejado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unidades, franqueados, usuarios, clientes, salas, produtos, bankAccounts, boletos, contratos, estoque, patrimonio, configFiscal, notasFiscais, planos, recibos, creditLedger, syncErrors, reservas, leads, crmEtapas, crmOrigens, eventos, pedidos, correspondencias, conversas, contas, lancamentos, catalogo, categorias, activeUnit, viewAs, perfil, meuPerfil, notificacaoPrefs, notificacoesEmail, clienteNotifPrefs]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore precisa estar dentro de <StoreProvider>");
  return ctx;
}
