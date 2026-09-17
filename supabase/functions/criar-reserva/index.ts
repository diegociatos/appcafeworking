// ============================================================================
// Edge Function: criar-reserva  (criação transacional e segura de reserva)
//
// POST /functions/v1/criar-reserva
// body: { unidade_id, sala_id, cliente_id?, cliente_nome, cliente_email?,
//         start_at, end_at, base?, origem?, valor? }
//
// Autorização por papel:
//   • staff (master/recepcao/financeiro) ou platform_admin → reserva para
//     qualquer cliente da unidade;
//   • cliente final → só para si mesmo, com as regras da área do cliente:
//     horário futuro (seg–sex, 8h–18h, hora cheia, até 30 dias), só salas
//     reserváveis pelo app, valor calculado aqui (o que vier do navegador é
//     ignorado) e, em sala sem preço por hora, precisa ter horas no plano.
// A não-corrida e o conflito são garantidos no banco (criar_reserva_segura).
// Com e-mail do cliente, manda a confirmação (respeita a preferência "reservas").
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";
import { dispatchNotificacao } from "../_shared/notify/index.ts";
import {
  calcularReserva, mensagemReserva, padraoEmail, salaReservavelPeloCliente, tipoCredito, validarReservaCliente,
} from "../_shared/reservaCliente.ts";
import { descontoSalaDoCliente } from "../_shared/direitosPlano.ts";
import { registrarLancamentoReserva } from "../_shared/lancamentoReserva.ts";

const CODIGOS_CONHECIDOS = /CONFLITO|SALA_CONTRATADA|SALA_INATIVA|BASE_INVALIDA|PERIODO_INVALIDO|PERIODO_PASSADO|SALA_INEXISTENTE|SALA_DE_OUTRA_UNIDADE/;

function quandoBR(startISO: string, endISO: string): string {
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
  return `${f(startISO, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}, das ${f(startISO, { hour: "2-digit", minute: "2-digit" })} às ${f(endISO, { hour: "2-digit", minute: "2-digit" })}`;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const b = await req.json().catch(() => null);
    for (const k of ["unidade_id", "sala_id", "cliente_nome", "start_at", "end_at"]) {
      if (!b?.[k]) return json({ error: "Preencha sala, data e horário." }, 400, req);
    }

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Entre na sua conta para reservar." }, 401, req);
    const email = (auth.user.email || "").toLowerCase();
    const admin = adminClient();

    // Papel do usuário na unidade.
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    const { data: mems } = await admin.from("unidade_members").select("role").eq("user_id", auth.user.id).eq("unidade_id", b.unidade_id);
    const ehAdmin = Boolean(pa);
    // contabilidade parceira só acompanha aberturas de empresa: não reserva
    const ehStaff = (mems || []).some((m) => m.role !== "cliente" && m.role !== "contabilidade");
    const ehCliente = (mems || []).some((m) => m.role === "cliente");

    if (!ehAdmin && !ehStaff && !ehCliente) {
      return json({ error: "Sem acesso a esta unidade." }, 403, req);
    }
    const comoCliente = !ehAdmin && !ehStaff;

    const { data: sala } = await admin.from("salas")
      .select("id, unidade_id, nome, tipo, valor_hora, active, contratada").eq("id", b.sala_id).maybeSingle();
    if (!sala || sala.unidade_id !== b.unidade_id) return json({ error: mensagemReserva("SALA_INEXISTENTE") }, 400, req);

    const alvoEmail = String(b.cliente_email || "").trim().toLowerCase();
    // Reserva manual para quem não é cliente é exceção: exige o motivo.
    const observacao = String(b.observacao || "").trim().slice(0, 500);
    if (!comoCliente && b.avulso === true && observacao.length < 5) {
      return json({ error: "Informe o motivo de reservar sem o cliente passar pelo link." }, 400, req);
    }
    const tipoCred = tipoCredito(sala.tipo);
    const valorHora = Number(sala.valor_hora || 0);
    let valorPedido: number | null = b.valor ?? null;
    let clienteNome = String(b.cliente_nome).slice(0, 200);
    let clienteId: string | null = b.cliente_id ?? null;

    // Reserva da equipe para cliente do cadastro: o saldo também conta os
    // lançamentos pelo id do cadastro (cliente antigo sem e-mail, ou horas do
    // mês lançadas antes de o e-mail ser cadastrado). O id precisa ser da unidade.
    let idDoCadastro: string | null = null;
    if (!comoCliente && clienteId) {
      const { data: cadId } = await admin.from("clientes").select("id")
        .eq("id", clienteId).eq("unidade_id", b.unidade_id).maybeSingle();
      idDoCadastro = cadId?.id ?? null;
    }

    // Saldo de horas do plano (antes de reservar, para o cliente não reservar sem cobertura).
    const saldoDoPlano = async () => {
      if (!tipoCred || (!alvoEmail && !idDoCadastro)) return 0;
      const movs = new Map<string, number>(); // por id do lançamento: sem contar duas vezes
      if (alvoEmail) {
        const { data } = await admin.from("creditos_ledger").select("id, quantidade")
          .eq("unidade_id", b.unidade_id).ilike("cliente_email", padraoEmail(alvoEmail)).eq("tipo", tipoCred);
        for (const m of data || []) movs.set(m.id, Number(m.quantidade || 0));
      }
      if (idDoCadastro) {
        const { data } = await admin.from("creditos_ledger").select("id, quantidade")
          .eq("unidade_id", b.unidade_id).eq("cliente_id", idDoCadastro).eq("tipo", tipoCred);
        for (const m of data || []) movs.set(m.id, Number(m.quantidade || 0));
      }
      return [...movs.values()].reduce((s, q) => s + q, 0);
    };

    // Desconto de sala do plano (direitos.descontoSala): vale sobre o excedente,
    // tanto para o cliente quanto para a reserva feita pela recepção. Calculado
    // aqui, no servidor — a tela só reflete o que voltar daqui.
    // Como cliente, o id do cadastro vem do navegador: só o e-mail (conferido
    // logo abaixo contra o do login) decide o desconto.
    const descontoSalaPct = await descontoSalaDoCliente(
      admin, b.unidade_id, comoCliente ? email : alvoEmail, comoCliente ? null : idDoCadastro,
    );

    if (comoCliente) {
      if (!alvoEmail || alvoEmail !== email) {
        return json({ error: "Como cliente, você só pode reservar para si mesmo." }, 403, req);
      }
      const periodo = validarReservaCliente(b.start_at, b.end_at);
      if (!periodo.ok) return json({ error: mensagemReserva(periodo.erro), codigo: periodo.erro }, 400, req);
      if (!salaReservavelPeloCliente(sala)) return json({ error: mensagemReserva("SALA_NAO_RESERVAVEL") }, 400, req);

      const calculo = calcularReserva(periodo.horas, await saldoDoPlano(), valorHora, descontoSalaPct);
      if (valorHora <= 0 && calculo.excedente > 0) {
        return json({ error: mensagemReserva("SEM_CREDITO"), codigo: "SEM_CREDITO" }, 400, req);
      }
      valorPedido = Math.round(periodo.horas * valorHora * 100) / 100;

      // Nome e id do próprio cadastro, quando existir (não confia no navegador).
      const { data: cad } = await admin.from("clientes").select("id, nome")
        .eq("unidade_id", b.unidade_id).ilike("email", padraoEmail(email)).limit(1).maybeSingle();
      if (cad) { clienteId = cad.id; clienteNome = cad.nome || clienteNome; } else { clienteId = null; }
    }

    const { data, error } = await admin.rpc("criar_reserva_segura", {
      p_id: comoCliente ? null : (b.id ?? null),
      p_unidade_id: b.unidade_id,
      p_sala_id: b.sala_id,
      p_cliente_id: clienteId,
      p_cliente_nome: clienteNome,
      p_cliente_email: alvoEmail || null,
      p_start_at: b.start_at,
      p_end_at: b.end_at,
      p_base: b.base ?? null,
      p_origem: comoCliente ? "app" : (b.origem ?? "recepcao"),
      p_valor: valorPedido,
    });

    if (error) {
      const msg = error.message || "";
      const conhecido = CODIGOS_CONHECIDOS.test(msg);
      if (!conhecido) console.error("[criar-reserva] criar_reserva_segura", msg);
      return json({ error: mensagemReserva(msg, "Não foi possível reservar agora. Tente de novo.") }, msg.includes("CONFLITO") ? 409 : conhecido ? 400 : 500, req);
    }

    if (data?.id && !comoCliente && (observacao || b.telefone)) {
      const extra: Record<string, string> = {};
      if (observacao) extra.observacao = b.avulso === true ? `Exceção: ${observacao}` : observacao;
      if (b.telefone) extra.cliente_telefone = String(b.telefone).slice(0, 40);
      const { error: eObs } = await admin.from("reservas").update(extra).eq("id", data.id);
      if (eObs) console.error("[criar-reserva] observacao", eObs.message);
      else Object.assign(data as Record<string, unknown>, extra);
    }

    // --- Consumo de crédito do plano + excedente (fail-safe) ----------------
    // Nunca derruba a reserva: qualquer erro aqui apenas mantém o valor cheio.
    let credito: Record<string, unknown> | null = null;
    try {
      if ((alvoEmail || idDoCadastro) && tipoCred) {
        const horas = Math.max(1, Math.ceil((new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 3_600_000));
        const saldo = await saldoDoPlano();
        const calc = calcularReserva(horas, saldo, valorHora, descontoSalaPct);
        if (calc.cobertas > 0) {
          await admin.from("creditos_ledger").insert({
            id: "cl_" + Date.now() + Math.floor(Math.random() * 1000),
            unidade_id: b.unidade_id, cliente_id: clienteId, cliente_email: alvoEmail || null,
            tipo: tipoCred, quantidade: -calc.cobertas, saldo_apos: saldo - calc.cobertas,
            origem: "consumo", motivo: `Reserva ${sala.nome || sala.tipo || ""}`.trim(), referencia_id: data?.id ?? null,
            created_by: auth.user.id,
          });
        }
        // Só reescreve o valor quando há preço por hora — evita zerar um valor fixo.
        if (data?.id && valorHora > 0) {
          await admin.from("reservas").update({
            valor: calc.valorExcedente,
            desconto_plano_pct: calc.descontoPct || null,
            valor_sem_desconto: calc.descontoPct > 0 ? calc.valorSemDesconto : null,
          }).eq("id", data.id);
          (data as { valor?: number }).valor = calc.valorExcedente;
        }
        credito = {
          tipo: tipoCred, horas, cobertas: calc.cobertas, excedente: calc.excedente,
          saldoAntes: saldo, saldoApos: saldo - calc.cobertas,
          valorSemDesconto: calc.valorSemDesconto, descontoPct: calc.descontoPct, descontoValor: calc.descontoValor,
          valorExcedente: calc.valorExcedente,
        };
      }
    } catch (e) {
      console.error("[criar-reserva] consumo de crédito falhou (segue sem debitar)", e);
    }

    // Reserva sem crédito de plano (sala privativa, cliente sem saldo do tipo):
    // o desconto do plano ainda vale sobre o valor cheio.
    if (!credito && descontoSalaPct > 0 && data?.id && valorHora > 0) {
      try {
        const cheio = Number((data as { valor?: number }).valor ?? valorPedido ?? 0);
        const comDesconto = Math.round(cheio * (100 - descontoSalaPct)) / 100;
        if (cheio > 0 && comDesconto !== cheio) {
          await admin.from("reservas").update({
            valor: comDesconto, desconto_plano_pct: descontoSalaPct, valor_sem_desconto: cheio,
          }).eq("id", data.id);
          (data as { valor?: number }).valor = comDesconto;
        }
      } catch (e) {
        console.error("[criar-reserva] desconto de sala falhou (segue com o valor cheio)", e);
      }
    }

    // Receita no financeiro. A recepção já lança pelo store (src/lib/store.jsx);
    // aqui entra a reserva que o cliente faz no app, que antes não gerava nada.
    const valorFinal = Number((data as { valor?: number })?.valor ?? valorPedido ?? 0);
    if (comoCliente && data?.id && valorFinal > 0) {
      await registrarLancamentoReserva(admin, {
        reservaId: String(data.id), unidadeId: b.unidade_id, salaNome: sala.nome, salaTipo: sala.tipo,
        clienteNome: clienteNome, valor: valorFinal, status: "previsto", quando: b.start_at,
        descontoPct: descontoSalaPct,
      });
    }

    await registrarAuditoria(admin, {
      unidade_id: b.unidade_id,
      ator_id: auth.user.id,
      ator_email: email,
      acao: "reserva.criada",
      entidade: "reserva",
      entidade_id: data?.id ?? null,
      detalhe: {
        sala_id: b.sala_id, base: b.base ?? null, start_at: b.start_at, end_at: b.end_at,
        cliente_nome: clienteNome, cliente_email: alvoEmail || null,
        ...(b.avulso === true ? { excecao_sem_cadastro: true, motivo: observacao } : {}),
        origem: comoCliente ? "app" : (b.origem ?? "recepcao"), valor: (data as { valor?: number })?.valor ?? valorPedido,
        credito, desconto_sala_pct: descontoSalaPct || null,
      },
      ip: ipDaReq(req),
    });

    if (alvoEmail && data?.id) {
      await dispatchNotificacao(admin, {
        unidade_id: b.unidade_id, evento: "reserva", email: alvoEmail, cliente: clienteNome,
        dados: { sala: sala.nome, quando: quandoBR(b.start_at, b.end_at), reserva_id: data.id },
      });
    }

    return json({ ok: true, reserva: data, credito, desconto_sala_pct: descontoSalaPct || 0 }, 201, req);
  } catch (e) {
    console.error("[criar-reserva]", e);
    return json({ error: "Não foi possível reservar agora. Tente de novo." }, 500, req);
  }
});
