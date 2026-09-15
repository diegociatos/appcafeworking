-- Planos de endereço fiscal vendidos pelo site (unidade Luxemburgo), iguais aos
-- cards que o site mostrava antes da contratação online. Idempotente: não
-- sobrescreve plano já existente (edições feitas na tela Planos são mantidas).
-- O plano antigo "Endereço Fiscal" (pl_1788889086695) segue para os clientes atuais.

insert into public.app_state (unidade_id, entity, item_id, doc)
values
  ('un_cafeworkingluxembu_e78be3', 'planos', 'pl_site_fiscal_basico', $json${
    "id": "pl_site_fiscal_basico", "unidadeId": "un_cafeworkingluxembu_e78be3",
    "nome": "Fiscal Básico", "preco": 119, "recorrencia": "mensal", "emiteNF": true, "ativo": true,
    "descricao": "Endereço fiscal com recebimento de correspondências",
    "categoria": "endereco_fiscal", "venderNoSite": true, "sobConsulta": false, "destaque": "",
    "beneficios": ["Endereço para CNPJ", "Recebimento de correspondências", "Digitalização sob demanda"],
    "prazoMinimoMeses": 12, "ordem": 1,
    "direitos": {"horasReuniao": 0, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": false, "descontoSala": 0, "descontoCafe": 0}
  }$json$::jsonb),
  ('un_cafeworkingluxembu_e78be3', 'planos', 'pl_site_fiscal_pro', $json${
    "id": "pl_site_fiscal_pro", "unidadeId": "un_cafeworkingluxembu_e78be3",
    "nome": "Fiscal Pro", "preco": 149, "recorrencia": "mensal", "emiteNF": true, "ativo": true,
    "descricao": "Endereço fiscal com digitalização, aviso por WhatsApp e horas de sala",
    "categoria": "endereco_fiscal", "venderNoSite": true, "sobConsulta": false, "destaque": "Mais procurado",
    "beneficios": ["Endereço para CNPJ", "Digitalização inclusa", "Notificação por WhatsApp", "2h/mês de sala de reunião inclusa"],
    "prazoMinimoMeses": 6, "ordem": 2,
    "direitos": {"horasReuniao": 2, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": false, "descontoSala": 0, "descontoCafe": 0}
  }$json$::jsonb),
  ('un_cafeworkingluxembu_e78be3', 'planos', 'pl_site_fiscal_premium', $json${
    "id": "pl_site_fiscal_premium", "unidadeId": "un_cafeworkingluxembu_e78be3",
    "nome": "Fiscal Premium", "preco": 299, "recorrencia": "mensal", "emiteNF": true, "ativo": true,
    "descricao": "Endereço fiscal completo com atendimento telefônico e recepcionista virtual",
    "categoria": "endereco_fiscal", "venderNoSite": true, "sobConsulta": false, "destaque": "",
    "beneficios": ["Endereço para CNPJ", "Digitalização e notificações", "4h/mês de sala de reunião inclusa", "Atendimento telefônico", "Recepcionista virtual"],
    "prazoMinimoMeses": 3, "ordem": 3,
    "direitos": {"horasReuniao": 4, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": false, "descontoSala": 0, "descontoCafe": 0}
  }$json$::jsonb)
on conflict (unidade_id, entity, item_id) do nothing;
