import { useId, useState } from "react";
import { inp, C } from "../lib/theme.js";
export default function SelecionarCliente({ clientes, value, onChange }) {
  const [busca, setBusca] = useState("");
  const id = useId();
  const termo = busca.trim().toLocaleLowerCase();
  const lista = clientes.filter(c => c.id === value || `${c.nome} ${c.cnpj || ""}`.toLocaleLowerCase().includes(termo) || (termo.replace(/\D/g, "").length > 2 && String(c.cnpj || "").replace(/\D/g, "").includes(termo.replace(/\D/g, ""))));
  return <div style={{ marginBottom: 16 }}>
    <label htmlFor={id} style={{ display: "block", marginBottom: 6 }}>Buscar cliente cadastrado</label>
    <input id={id} type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou CPF/CNPJ" style={{ ...inp, marginBottom: 8 }} />
    <select aria-label="Selecionar cliente cadastrado" value={value} onChange={e => onChange(clientes.find(c => c.id === e.target.value) || null)} style={inp}>
      <option value="">— preencher manualmente —</option>
      {lista.map(c => <option key={c.id} value={c.id}>{c.nome}{c.cnpj ? ` · ${c.cnpj}` : ""}</option>)}
    </select>
    {busca && !lista.length && <p role="status" style={{ color: C.text3, fontSize: 12 }}>Nenhum cliente encontrado nesta unidade.</p>}
  </div>;
}
