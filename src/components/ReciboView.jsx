import React from "react";
import { Printer, Receipt } from "lucide-react";
import { Btn } from "./ui.jsx";
import { C, serif, fmt } from "../lib/theme.js";

// Valor por extenso (reais) — simples, cobre o uso de recibos de coworking.
function porExtenso(n) {
  n = Math.round(Number(n || 0) * 100) / 100;
  const u = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ate999 = (x) => {
    if (x === 0) return "";
    if (x === 100) return "cem";
    let s = [];
    const cen = Math.floor(x / 100), res = x % 100;
    if (cen) s.push(c[cen]);
    if (res < 20) { if (res) s.push(u[res]); }
    else { const dez = Math.floor(res / 10), un = res % 10; s.push(d[dez]); if (un) s.push(u[un]); }
    return s.join(" e ");
  };
  const inteiro = Math.floor(n);
  const centavos = Math.round((n - inteiro) * 100);
  let txt = "";
  if (inteiro === 0) txt = "zero";
  else {
    const milhares = Math.floor(inteiro / 1000), resto = inteiro % 1000;
    const partes = [];
    if (milhares) partes.push((milhares === 1 ? "mil" : `${ate999(milhares)} mil`));
    if (resto) partes.push(ate999(resto));
    txt = partes.join(" e ");
  }
  let out = `${txt} ${inteiro === 1 ? "real" : "reais"}`;
  if (centavos) out += ` e ${ate999(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export default function ReciboView({ recibo, unidade }) {
  if (!recibo) return null;
  const imprimir = () => {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(`<html><head><title>Recibo ${recibo.numero}</title>
      <style>body{font-family:'Book Antiqua',Palatino,Georgia,serif;color:#1f1f1c;padding:48px;max-width:680px;margin:0 auto}
      h1{font-size:22px;margin:0 0 4px}.muted{color:#6b6b63;font-size:13px}.valor{font-size:30px;color:#6E4E3B;margin:18px 0}
      .box{border:1px solid #e6e1d8;border-radius:14px;padding:24px;margin-top:18px}.row{margin:8px 0;font-size:14px}
      .lbl{color:#6b6b63;font-size:12px}.sign{margin-top:60px;border-top:1px solid #1f1f1c;width:280px;padding-top:6px;font-size:13px}</style></head>
      <body>${reciboHtml(recibo, unidade)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  return (
    <div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, background: C.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Receipt size={20} color={C.cafe} />
          <span style={{ fontFamily: serif, fontSize: 20 }}>Recibo nº {recibo.numero}</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.text3 }}>{unidade?.nome || ""} · emitido em {(recibo.emitidoEm || "").split("-").reverse().join("/")}</div>

        <div style={{ fontFamily: serif, fontSize: 30, color: C.cafe, margin: "16px 0 4px" }}>{fmt(recibo.valor)}</div>
        <div style={{ fontSize: 12.5, color: C.text3, fontStyle: "italic" }}>({porExtenso(recibo.valor)})</div>

        <div style={{ marginTop: 16, borderTop: `1px solid ${C.border2}`, paddingTop: 14, fontSize: 13.5, lineHeight: 1.7 }}>
          Recebi de <b>{recibo.cliente}</b>{recibo.clienteDoc ? ` (${recibo.clienteDoc})` : ""} a importância acima,
          referente a <b>{recibo.descricao}</b>{recibo.forma ? `, via ${recibo.forma}` : ""}.
        </div>
      </div>
      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 14 }} onClick={imprimir}>
        <Printer size={16} /> Imprimir / salvar PDF
      </Btn>
    </div>
  );
}

function reciboHtml(r, unidade) {
  const data = (r.emitidoEm || "").split("-").reverse().join("/");
  return `<h1>RECIBO</h1><div class="muted">Nº ${r.numero} · ${unidade?.nome || ""}</div>
    <div class="valor">${fmt(r.valor)}</div>
    <div class="muted"><i>(${porExtenso(r.valor)})</i></div>
    <div class="box">
      <div class="row"><span class="lbl">Recebemos de</span><br><b>${r.cliente}</b>${r.clienteDoc ? ` — ${r.clienteDoc}` : ""}</div>
      <div class="row"><span class="lbl">Referente a</span><br>${r.descricao}${r.forma ? ` — via ${r.forma}` : ""}</div>
      <div class="row"><span class="lbl">Data</span><br>${data}</div>
      <div class="sign">${unidade?.nome || "Emitente"}</div>
    </div>`;
}
