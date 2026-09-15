// Minha conta: dados do cadastro (leitura) e troca de senha pelo Supabase Auth.
import { useState } from "react";
import { Lock, LogOut, CheckCircle2 } from "lucide-react";
import { Card, Btn, PageHead } from "../../components/ui.jsx";
import { C, inp } from "../../lib/theme.js";
import { clienteApi } from "../../lib/clienteApi.js";
import { emailDaSessao, signOut, trocarSenha, SENHA_MINIMA } from "../../lib/supabaseAuth.js";
import { mensagemDe } from "../../lib/erros.js";
import { textoDesde } from "../../lib/unidadeNome.js";
import { Carregando, ErroCarga, Titulo, CartaoRecepcao, useDados } from "./comum.jsx";

function Dado({ rotulo, valor }) {
  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${C.border2}` }}>
      <dt style={{ fontSize: 13, color: C.text3 }}>{rotulo}</dt>
      <dd style={{ fontSize: 15, color: C.text, margin: "2px 0 0" }}>{valor || "Não informado"}</dd>
    </div>
  );
}

export default function MinhaConta({ nome }) {
  const { dados, erro, carregando, recarregar } = useDados((f) => clienteApi.minhaAssinatura(f));
  const perfil = dados?.perfil || {};
  const [f, setF] = useState({ atual: "", nova: "", repete: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState({ ok: "", erro: "" });

  const curta = f.nova.length > 0 && f.nova.length < SENHA_MINIMA;
  const diferente = f.repete.length > 0 && f.repete !== f.nova;
  const valido = f.atual && f.nova.length >= SENHA_MINIMA && f.repete === f.nova;

  const salvar = async (e) => {
    e.preventDefault();
    if (!valido || salvando) return;
    setSalvando(true);
    setMsg({ ok: "", erro: "" });
    try {
      await trocarSenha(f.atual, f.nova);
      setF({ atual: "", nova: "", repete: "" });
      setMsg({ ok: "Senha alterada. Use a nova senha no próximo acesso.", erro: "" });
    } catch (err) {
      setMsg({ ok: "", erro: mensagemDe(err, "Não foi possível trocar a senha agora.") });
    } finally {
      setSalvando(false);
    }
  };

  const campo = (id, rotulo, chave, auto) => (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: C.text3, display: "block", marginBottom: 6 }}>{rotulo}</label>
      <input id={id} type="password" value={f[chave]} onChange={(e) => setF({ ...f, [chave]: e.target.value })} autoComplete={auto} style={inp} />
    </div>
  );

  return (
    <div>
      <PageHead title="Minha conta" sub="Seus dados de cadastro e a senha de acesso." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="cw-grid-stack">
        <Card>
          <Titulo>Dados do cadastro</Titulo>
          {carregando && !dados && <Carregando />}
          {erro && <ErroCarga mensagem={erro} onTentar={recarregar} />}
          {(dados || erro) && (
            <dl style={{ margin: 0 }}>
              <Dado rotulo="Nome ou empresa" valor={perfil.nome || nome} />
              <Dado rotulo="E-mail de acesso" valor={perfil.email || emailDaSessao()} />
              <Dado rotulo="Telefone" valor={perfil.telefone} />
              <Dado rotulo="CPF ou CNPJ" valor={perfil.documento} />
              {perfil.desde && <Dado rotulo="Cliente desde" valor={textoDesde(perfil.desde)} />}
            </dl>
          )}
          <p style={{ fontSize: 13, color: C.text3, margin: "12px 0 0" }}>Para corrigir algum dado, fale com a recepção.</p>
        </Card>

        <Card>
          <Titulo>Trocar senha</Titulo>
          <form onSubmit={salvar} noValidate>
            {campo("senha-atual", "Senha atual", "atual", "current-password")}
            {campo("senha-nova", `Nova senha (mínimo ${SENHA_MINIMA} caracteres)`, "nova", "new-password")}
            {curta && <div style={{ fontSize: 13, color: C.amber, margin: "-6px 0 10px" }}>Use pelo menos {SENHA_MINIMA} caracteres.</div>}
            {campo("senha-repete", "Repita a nova senha", "repete", "new-password")}
            {diferente && <div style={{ fontSize: 13, color: C.amber, margin: "-6px 0 10px" }}>As senhas não são iguais.</div>}
            <div role="status" aria-live="polite">
              {msg.ok && <div style={{ fontSize: 14, color: C.green, background: C.greenPale, borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}><CheckCircle2 size={14} aria-hidden="true" /> {msg.ok}</div>}
            </div>
            {msg.erro && <div role="alert" style={{ fontSize: 14, color: C.red, background: C.redPale, borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>{msg.erro}</div>}
            <Btn type="submit" disabled={!valido || salvando}><Lock size={15} aria-hidden="true" /> {salvando ? "Salvando…" : "Salvar nova senha"}</Btn>
          </form>
        </Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }} className="cw-grid-stack">
        <CartaoRecepcao compacto />
        <Btn variant="ghost" onClick={() => signOut()}><LogOut size={15} aria-hidden="true" /> Sair da conta</Btn>
      </div>
    </div>
  );
}
