-- Classifica os produtos que já existiam antes dos controles de canal.
-- Tudo que é vendido fica disponível ao cliente autenticado; apenas alimentos
-- e bebidas aparecem no cardápio público. Papelaria/impressão continuam privadas.
update public.app_state
set doc = doc
  || jsonb_build_object('venderNoAppCliente', true)
  || jsonb_build_object(
    'publicarNoSite', lower(coalesce(doc ->> 'categoria', '')) in
      ('café', 'cafe', 'salgados', 'doces', 'bebidas')
  )
where entity = 'catalogo'
  and doc ->> 'tipo' = 'produto'
  and coalesce((doc ->> 'ativo')::boolean, true) = true
  and not (doc ? 'venderNoAppCliente');
