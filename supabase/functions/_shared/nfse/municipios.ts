// ============================================================================
// Mapa cidade+UF → código IBGE (cMun, 7 dígitos) do município.
//
// Usado para montar o endereço do TOMADOR na NFS-e (o layout nacional exige o
// cMun no <endNac>). Quando a cidade não está no mapa, `cMunDe` devolve
// undefined e o endereço é OMITIDO da nota (que continua válida, só sem o
// endereço do tomador). Ampliar conforme necessário.
//
// ATENÇÃO: validar os códigos contra a tabela oficial do IBGE antes de confiar
// em produção (a emissão real só liga com o certificado A1 ativo).
// ============================================================================

const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// chave: "<cidade normalizada>|<uf minúscula>"
const MAPA: Record<string, string> = {
  // Região metropolitana de BH (unidade CafeWorking Luxemburgo fica em BH)
  "belo horizonte|mg": "3106200",
  "contagem|mg": "3118601",
  "betim|mg": "3106705",
  "nova lima|mg": "3144805",
  "sabara|mg": "3154606",
  "santa luzia|mg": "3157807",
  "ribeirao das neves|mg": "3154804",
  "vespasiano|mg": "3171204",
  "ibirite|mg": "3129806",
  "lagoa santa|mg": "3136652",
  "pedro leopoldo|mg": "3149309",
  "uberlandia|mg": "3170206",
  "juiz de fora|mg": "3136702",
  "uberaba|mg": "3170107",
  // Capitais (UF)
  "sao paulo|sp": "3550308",
  "rio de janeiro|rj": "3304557",
  "brasilia|df": "5300108",
  "salvador|ba": "2927408",
  "fortaleza|ce": "2304400",
  "curitiba|pr": "4106902",
  "porto alegre|rs": "4314902",
  "recife|pe": "2611606",
  "goiania|go": "5208707",
  "belem|pa": "1501402",
  "manaus|am": "1302603",
  "vitoria|es": "3205309",
  "florianopolis|sc": "4205407",
  "campo grande|ms": "5002704",
  "cuiaba|mt": "5103403",
  "joao pessoa|pb": "2507507",
  "natal|rn": "2408102",
  "maceio|al": "2704302",
  "teresina|pi": "2211001",
  "aracaju|se": "2800308",
  "sao luis|ma": "2111300",
  "palmas|to": "1721000",
  "porto velho|ro": "1100205",
  "rio branco|ac": "1200401",
  "boa vista|rr": "1400100",
  "macapa|ap": "1600303",
};

/** Código IBGE (7 díg.) da cidade/UF, ou undefined se não mapeado. */
export function cMunDe(cidade?: string, uf?: string): string | undefined {
  if (!cidade || !uf) return undefined;
  return MAPA[`${norm(cidade)}|${norm(uf)}`];
}
