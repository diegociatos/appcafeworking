-- ============================================================================
-- Cria os buckets de PDF que faltavam no Storage: `boletos` e `notas-fiscais`.
--
-- Sem eles, uploadBoletoPdf (bucket "boletos") e uploadNfseFile (bucket
-- "notas-fiscais") falhavam silenciosamente:
--   • boleto: pdf_url ficava NULO -> e-mail sem anexo, portal sem "Boleto (PDF)";
--   • nota:   pdf_url caía na URL externa do SEFIN (sefin.nfse.gov.br) e o XML
--             nem subia -> o anexador (anexosFinanceiros, só aceita host
--             *.supabase.co/asaas) rejeitava -> e-mail sem a nota.
--
-- Buckets PRIVADOS: os arquivos são servidos por URL assinada (service_role),
-- nunca públicos. O service_role (edge functions) ignora RLS no upload/sign,
-- então basta o bucket existir.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('boletos', 'boletos', false),
       ('notas-fiscais', 'notas-fiscais', false)
on conflict (id) do nothing;
