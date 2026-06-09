import React, { useState } from "react";
import { LogIn, Lock, Mail, Loader2 } from "lucide-react";
import { C, serif, sans, inp } from "../lib/theme.js";
import { Btn } from "../components/ui.jsx";
import Logo from "../components/Logo.jsx";
import { signInWithPassword } from "../lib/supabaseAuth.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e) => {
    e?.preventDefault?.();
    if (!email.trim() || !senha) return;
    setErro("");
    setCarregando(true);
    try {
      await signInWithPassword(email.trim(), senha);
      // onAuthChange no App re-renderiza e mostra o painel.
    } catch (err) {
      setErro(err?.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : (err?.message || "Não foi possível entrar."));
      setCarregando(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: sans, padding: 20,
      background: `radial-gradient(1000px 600px at 85% -10%, rgba(110,78,59,.14), transparent 55%), radial-gradient(900px 600px at -5% 110%, rgba(14,75,79,.14), transparent 55%), ${C.cream}`,
    }}>
      <div className="cw-fade" style={{ width: "100%", maxWidth: 392 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <Logo size={52} />
          <div style={{ fontFamily: serif, fontSize: 21, color: C.text, marginTop: 14, letterSpacing: "-0.01em" }}>Bem-vindo de volta</div>
          <div style={{ fontSize: 13.5, color: C.text3, marginTop: 3 }}>Gestão completa do seu coworking, em um só lugar.</div>
        </div>
        <form onSubmit={entrar} style={{ background: "#fff", border: `1px solid ${C.border2}`, borderRadius: 20, padding: 28, boxShadow: "0 20px 50px rgba(31,31,28,.10)" }}>
          <div style={{ fontFamily: serif, fontSize: 21, color: C.text, marginBottom: 4, letterSpacing: "-0.01em" }}>Entrar</div>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 20 }}>Acesse o painel da sua unidade.</div>

          <label style={{ fontSize: 12.5, fontWeight: 600, color: C.text2 }}>E-mail</label>
          <div style={{ position: "relative", margin: "6px 0 14px" }}>
            <Mail size={16} color={C.text4} style={{ position: "absolute", left: 12, top: 13 }} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br"
              style={{ ...inp, paddingLeft: 36 }} autoComplete="username" />
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 600, color: C.text2 }}>Senha</label>
          <div style={{ position: "relative", margin: "6px 0 6px" }}>
            <Lock size={16} color={C.text4} style={{ position: "absolute", left: 12, top: 13 }} />
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••"
              style={{ ...inp, paddingLeft: 36 }} autoComplete="current-password" />
          </div>

          {erro && <div style={{ fontSize: 12.5, color: C.red, background: C.redPale, borderRadius: 9, padding: "8px 12px", margin: "10px 0" }}>{erro}</div>}

          <Btn type="submit" disabled={carregando || !email.trim() || !senha}
            style={{ width: "100%", justifyContent: "center", marginTop: 14, opacity: (carregando || !email.trim() || !senha) ? 0.7 : 1 }}>
            {carregando ? <><Loader2 size={16} className="cw-spin" /> Entrando…</> : <><LogIn size={16} /> Entrar</>}
          </Btn>

          <div style={{ textAlign: "center", fontSize: 12, color: C.text4, marginTop: 16 }}>
            CafeWorking · acesso seguro
          </div>
        </form>
      </div>
    </div>
  );
}
