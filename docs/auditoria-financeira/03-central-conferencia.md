# Central de conferência e proteções financeiras

Implementação preparada em `codex/conferencia-financeira`, baseada em `f03cc30`.
Revisão adicional realizada pela CLI do Claude, somente em arquivos de código
autorizados. Os testes usam casos sintéticos. Nenhuma consulta de escrita,
migração ou correção de registros de produção foi executada.

## Entregas

- Central de conferência por unidade: datas, clientes, categorias, conciliação,
  integração de boletos/cobranças e contratos sem parcela no mês. Busca, filtros
  e paginação. Não liquida, exclui ou vincula dados automaticamente.
- Sugestões de conciliação com competência válida, valores em centavos,
  unidade e cliente compatíveis ou identificador comum de operação. Pagamentos
  já vinculados ficam indisponíveis até a desconciliação explícita. Sugestões
  disputadas por mais de uma obrigação não recebem ação rápida de conciliação.
- Datas explícitas inválidas não são reinterpretadas por outra data. Vencimento
  informado tem prioridade. ISO completo é reconhecido; períodos legados
  conflitantes vão para revisão. Recorrência de dia 31 continua usando o último
  dia do mês conforme regra existente.
- Edição exige datas completas, conta e classificação; uma categoria vazia não
  é substituída silenciosamente pela primeira opção.
- Projeção sinaliza os meses futuros sem despesas; não inventa compromissos.
  Uma despesa isolada não comprova orçamento completo: o aviso de conferência
  permanece mesmo quando não há meses totalmente vazios.
- DRE exclui status conciliado/cancelado da soma, evitando repetir a receita
  pelo título já satisfeito e pelo pagamento. Caixa usa data efetiva quando
  válida. Datas explícitas impossíveis são retiradas da visão de caixa e
  apresentadas como pendência, sem alterar o registro.
- Indicadores por unidade e painel usam a mesma receita comercial por data de
  pagamento, excluindo transferências/investimentos e registros de outra unidade.
- Receita Asaas já representada por cobrança ou reserva não é somada novamente.
  Sinal e complemento com total exatamente coberto pelos lançamentos da mesma
  reserva são reconhecidos. Diferenças de valor exigem revisão; não se presume
  que líquido de taxas seja igual ao bruto.
- Recebimentos sem cliente são exibidos em lotes de 25 para reduzir o custo de
  renderização dos seletores.

## Limites e implantação

Esta entrega não saneia retroativamente os registros e não substitui conciliação
com extratos. Identificador comum de reserva não prova sozinho a ausência de
lançamentos importados sem vínculo. Correspondências sem identificador continuam
pendentes de análise humana.

A proteção de conciliação valida o estado carregado e a atualização funcional
local. Não substitui bloqueio transacional entre sessões no servidor. Antes de
liberar operação concorrente de conciliação em produção, implementar RPC com
controle de versão/bloqueio e auditoria, além de restrição única para alocação
integral. Não considerar a validação de interface uma fronteira de autorização.

A central é uma primeira versão de leitura/conferência. Responsáveis, prazos,
aprovação formal por alçada, fechamento de períodos e trilha financeira completa
no servidor continuam sendo uma etapa posterior. Não há botão de aprovação que
finja possuir esses controles sem persistência e autorização no servidor.

Publicar primeiro para homologação e revisar casos conhecidos. Não executar os
scripts antigos de saneamento presentes nesta pasta como parte deste deploy.
Reverter o código não deve exigir desfazer dados: esta entrega não contém
migração nem atualização de dados históricos.
