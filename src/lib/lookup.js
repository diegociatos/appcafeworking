// ============================================================================
// lookup — consulta pública de CNPJ (BrasilAPI) e CEP (ViaCEP).
// Ambas grátis, sem chave e com CORS liberado para o navegador.
// Retornam objeto normalizado, ou null em caso de erro/dado inválido.
// ============================================================================

const soDigitos = (v) => String(v || "").replace(/\D/g, "");
const titulo = (s) =>
  String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Consulta CNPJ (14 dígitos) na BrasilAPI. */
export async function buscarCnpj(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
    if (!res.ok) return null;
    const j = await res.json();
    return {
      cnpj: d,
      razaoSocial: j.razao_social || "",
      nomeFantasia: j.nome_fantasia || "",
      email: (j.email || "").toLowerCase(),
      telefone: j.ddd_telefone_1 ? String(j.ddd_telefone_1).replace(/\D/g, "") : "",
      cep: soDigitos(j.cep),
      logradouro: titulo(j.logradouro),
      numero: j.numero || "",
      complemento: j.complemento || "",
      bairro: titulo(j.bairro),
      municipio: titulo(j.municipio),
      uf: (j.uf || "").toUpperCase(),
    };
  } catch {
    return null;
  }
}

/** Consulta CEP (8 dígitos) no ViaCEP. Traz o código IBGE do município. */
export async function buscarCep(cep) {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!res.ok) return null;
    const j = await res.json();
    if (j.erro) return null;
    return {
      cep: d,
      logradouro: j.logradouro || "",
      bairro: j.bairro || "",
      cidade: j.localidade || "",
      uf: (j.uf || "").toUpperCase(),
      ibge: j.ibge || "", // código IBGE de 7 dígitos do município (cLocEmi da NFS-e)
    };
  } catch {
    return null;
  }
}
