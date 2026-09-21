// Datas de calendário são locais: não interpretar YYYY-MM-DD como meia-noite UTC.
export function parseDataAgenda(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || "")) return null;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia ? data : null;
}

export function moverPeriodoAgenda(referencia, visao, delta) {
  const data = new Date(referencia);
  if (visao === "semana") data.setDate(data.getDate() + delta * 7);
  else {
    // Ancorar no primeiro dia evita pular fevereiro ao navegar desde dia 31.
    data.setDate(1);
    if (visao === "mes") data.setMonth(data.getMonth() + delta);
    else data.setFullYear(data.getFullYear() + delta);
  }
  return data;
}
