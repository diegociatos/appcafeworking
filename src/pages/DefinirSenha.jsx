import { useState } from "react";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";
import { C, serif, sans, inp } from "../lib/theme.js";
import { Btn } from "../components/ui.jsx";
import Logo from "../components/Logo.jsx";
import { definirSenha, signOut, tipoDefinicaoSenha, SENHA_MINIMA } from "../lib/supabaseAuth.js";

// Tela de senha para quem chegou por link de e-mail, já com sessão:
//  • primeiro acesso (e-mail de boas-vindas, ?acesso=novo): "Crie sua senha";
//  • esqueci a senha: "Crie uma nova senha".
export default function DefinirSenha() {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const primeiroAcesso = tipoDefinicaoSenha() === "novo";

  const curta = senha.length > 0 && senha.length < SENHA_MINIMA;
  const diferente = confirma.length > 0 && confirma !== senha;
  const valido = senha.length >= SENHA_MINIMA && confirma === senha;

  const salvar = async (e) => {
    e?.preventDefault?.();
    if (!valido || salvando) return;
    setErro(""); setSalvando(true);
    try {
      await definirSenha(senha); // libera o app ao terminar
    } catch (err) {
      setErro(err?.message || "Não foi possível salvar a senha.");
      setSalvando(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: sans, padding: 20, background: C.cream }}>
      <form onSubmit={salvar} style={{ width: "100%", maxWidth: 400, background: C.white, borderRadius: 22, padding: 30, boxShadow: "0 30px 70px rgba(31,31,28,.12)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><Logo size={48} /></div>
        <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 500, color: C.text, textAlign: "center" }}>
          {primeiroAcesso ? "Crie sua senha" : "Crie uma nova senha"}
        </h1>
        <p style={{ fontSize: 14, color: C.text3, textAlign: "center", margin: "6px 0 20px" }}>
          {primeiroAcesso
            ? "Seu plano está ativo. Defina a senha para entrar na área do cliente."
            : "Escolha uma senha nova para entrar na sua conta."}
        </p>

        <label htmlFor="nova-senha" style={{ fontSize: 13, fontWeight: 600, color: C.text2 }}>Nova senha</label>
        <div style={{ position: "relative", margin: "6px 0 4px" }}>
          <Lock size={16} color={C.text4} style={{ position: "absolute", left: 12, top: 13 }} aria-hidden="true" />
          <input id="nova-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
            placeholder={`mínimo ${SENHA_MINIMA} caracteres`} style={{ ...inp, paddingLeft: 36 }} autoComplete="new-password" autoFocus
            aria-describedby="nova-senha-dica" />
        </div>
        <div id="nova-senha-dica" style={{ fontSize: 12, color: curta ? C.amber : C.text3 }}>Use pelo menos {SENHA_MINIMA} caracteres, com letras e números.</div>

        <label htmlFor="confirma-senha" style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text2, marginTop: 12 }}>Repita a senha</label>
        <div style={{ position: "relative", margin: "6px 0 4px" }}>
          <Lock size={16} color={C.text4} style={{ position: "absolute", left: 12, top: 13 }} aria-hidden="true" />
          <input id="confirma-senha" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)}
            style={{ ...inp, paddingLeft: 36 }} autoComplete="new-password" />
        </div>
        {diferente && <div style={{ fontSize: 12, color: C.amber }}>As senhas não são iguais.</div>}

        {erro && <div role="alert" style={{ fontSize: 13, color: C.red, background: C.redPale, borderRadius: 9, padding: "8px 12px", marginTop: 12 }}>{erro}</div>}

        <Btn type="submit" disabled={!valido || salvando} style={{ width: "100%", marginTop: 18, justifyContent: "center", opacity: !valido || salvando ? 0.7 : 1 }}>
          {salvando ? <><Loader2 size={16} className="cw-spin" aria-hidden="true" /> Salvando…</> : <><CheckCircle2 size={16} aria-hidden="true" /> Salvar e entrar</>}
        </Btn>
        <button type="button" onClick={() => signOut()} style={{ display: "block", margin: "14px auto 0", fontSize: 13, color: C.text3 }}>
          Sair
        </button>
      </form>
    </div>
  );
}
