import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dispatchNotificacao } from './notify/index.ts';

export function tokenRetornosValido(recebido: string | null, esperado: string): boolean {
  return esperado.length >= 32 && recebido === esperado;
}

/** Retira uma única vez cada agendamento. Não reenvia em caso de resultado incerto. */
export async function processarRetornos(admin: SupabaseClient, appUrl: string, enviar = dispatchNotificacao) {
  const { data: fila, error } = await admin.rpc('crm_retirar_retornos');
  if (error) throw new Error('Não foi possível retirar retornos da fila.');
  const resumo = { enviados: 0, erros: 0, cancelados: 0 };
  for (const retorno of fila || []) {
    try {
      const [{ data: membros, error: erroMembros }, { data: plataforma, error: erroPlataforma }, { data: usuarios, error: erroUsuarios }] = await Promise.all([
        admin.from('unidade_members').select('user_id').eq('user_id', retorno.responsavel_id).eq('unidade_id', retorno.unidade_id).neq('role','cliente'),
        admin.from('platform_admins').select('user_id').eq('user_id', retorno.responsavel_id),
        admin.from('usuarios').select('ativo').eq('auth_user_id', retorno.responsavel_id).eq('unidade_id', retorno.unidade_id),
      ]);
      if (erroMembros || erroPlataforma || erroUsuarios) throw new Error('Não foi possível validar o acesso do responsável.');
      if ((!membros?.length && !plataforma?.length) || usuarios?.some(u => u.ativo === false)) throw new Error('Responsável sem acesso ativo à unidade.');
      const { data: lead, error: erroLead } = await admin.from('app_state').select('doc')
        .eq('unidade_id', retorno.unidade_id).eq('entity','leads').eq('item_id',retorno.lead_id).maybeSingle();
      if (erroLead) throw new Error('Não foi possível consultar o lead.');
      if (!lead || lead.doc.etapa === 'fechado') {
        const { error: erroCancelar } = await admin.from('crm_retornos').update({ status: 'cancelado', erro: 'Lead fechado ou removido.' }).eq('id',retorno.id).eq('status','processando');
        if (erroCancelar) throw new Error('Não foi possível encerrar o retorno.');
        resumo.cancelados++; continue;
      }
      const { data: identidade, error: erroIdentidade } = await admin.auth.admin.getUserById(retorno.responsavel_id);
      const email = identidade?.user?.email;
      if (erroIdentidade || !email) throw new Error('Responsável sem e-mail de acesso disponível.');
      const { data: comentario, error: erroComentario } = await admin.from('crm_comentarios').select('texto,autor_nome,created_at')
        .eq('id',retorno.comentario_id).eq('unidade_id',retorno.unidade_id).eq('lead_id',retorno.lead_id).maybeSingle();
      if (erroComentario || !comentario) throw new Error('Não foi possível consultar a conversa do retorno.');
      const data = new Date(retorno.agendado_para).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const envio = await enviar(admin, {
        unidade_id: retorno.unidade_id, evento: 'aviso_equipe', email,
        dados: { assunto: `Retomar contato com ${lead.doc.nome}`, link: `${appUrl.replace(/\/$/,'')}/?p=crm`, linhas: [
          `Está na hora de entrar em contato novamente com ${lead.doc.nome}.`,
          `Retorno agendado: ${data} (Brasília).`,
          ...[lead.doc.tel ? `Telefone: ${lead.doc.tel}` : '', lead.doc.email ? `E-mail do cliente: ${lead.doc.email}` : ''].filter(Boolean),
          `Conversa registrada por ${comentario.autor_nome}: ${comentario.texto}`,
        ], retorno_id: retorno.id },
      });
      const { error: erroSalvar } = await admin.from('crm_retornos').update(envio.ok
        ? { status: 'enviado', enviado_em: new Date().toISOString(), erro: null }
        : { status: 'erro', erro: 'O provedor de e-mail não confirmou o envio. Consulte Notificações.' })
        .eq('id',retorno.id).eq('status','processando');
      if (erroSalvar) {
        // A mensagem pode ter saído; manter processando impede duplicação automática.
        resumo.erros++; continue;
      }
      if (envio.ok) resumo.enviados++; else resumo.erros++;
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Não foi possível processar o retorno.';
      await admin.from('crm_retornos').update({ status: 'erro', erro: mensagem }).eq('id',retorno.id).eq('status','processando');
      resumo.erros++;
    }
  }
  return resumo;
}
