import React, { useState, useEffect } from "react";
import { LogIn, Lock, Mail, User, Phone, MapPin, Building2, Loader2, UserPlus } from "lucide-react";
import { C, serif, sans, inp } from "../lib/theme.js";
import { Btn } from "../components/ui.jsx";
import Logo from "../components/Logo.jsx";
import { signInWithPassword } from "../lib/supabaseAuth.js";
import { fetchUnidadesPublicas, cadastrarCliente } from "../lib/authPublic.js";

const card = { background: "#fff", border: `1px solid ${C.border2}`, borderRadius: 20, padding: 28, boxShadow: "0 20px 50px rgba(31,31,28,.10)" };
const rotulo = { fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: C.text2 };
const iconWrap = { position: "absolute", left: 12, top: 13 };

export default function Login() {
  const [modo, setModo] = useState("login"); // login | signup

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: sans, padding: 20,
      background: `radial-gradient(1000px 600px at 85% -10%, rgba(110,78,59,.14), transparent 55%), radial-gradient(900px 600px at -5% 110%, rgba(14,75,79,.14), transparent 55%), ${C.cream}`,
    }}>
      <div className="cw-fade" style={{ width: "100%", maxWidth: modo === "signup" ? 440 : 392 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <Logo size={52} />
          <div style={{ fontFamily: serif, fontSize: 21, color: C.text, marginTop: 14, letterSpacing: "-0.01em" }}>
            {modo === "login" ? "Bem-vindo de volta" : "Crie sua conta"}
          </div>
          <div style={{ fontSize: 13.5, color: C.text3, marginTop: 3 }}>
            {modo === "login" ? "Gestão completa do seu coworking, em um só lugar." : "Reserve salas, peça na cafeteria e gerencie tudo pelo app."}
          </div>
        </div>
        {modo === "login" ? <LoginCard irParaCadastro={() => setModo("signup")} /> : <SignupCard irParaLogin={() => setModo("login")} />}
      </div>
    </div>
  );
}

function LoginCard({ irParaCadastro }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e) => {
    e?.preventDefault?.();
    if (!email.trim() || !senha) return;
    setErro(""); setCarregando(true);
    try {
      await signInWithPassword(email.trim(), senha);
    } catch (err) {
      setErro(err?.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : (err?.message || "Não foi possível entrar."));
      setCarregando(false);
    }
  };

  return (
    <form onSubmit={entrar} style={card}>
      <div style={{ fontFamily: serif, fontSize: 21, color: C.text, marginBottom: 4, letterSpacing: "-0.01em" }}>Entrar</div>
      <div style={{ fontSize: 13, color: C.text3, marginBottom: 20 }}>Acesse sua conta.</div>

      <label style={rotulo}>E-mail</label>
      <div style={{ position: "relative", margin: "6px 0 14px" }}>
        <Mail size={16} color={C.text4} style={iconWrap} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" style={{ ...inp, paddingLeft: 36 }} autoComplete="username" />
      </div>

      <label style={rotulo}>Senha</label>
      <div style={{ position: "relative", margin: "6px 0 6px" }}>
        <Lock size={16} color={C.text4} style={iconWrap} />
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" style={{ ...inp, paddingLeft: 36 }} autoComplete="current-password" />
      </div>

      {erro && <div style={{ fontSize: 12.5, color: C.red, background: C.redPale, borderRadius: 9, padding: "8px 12px", margin: "10px 0" }}>{erro}</div>}

      <Btn type="submit" disabled={carregando || !email.trim() || !senha} style={{ width: "100%", marginTop: 14, opacity: (carregando || !email.trim() || !senha) ? 0.7 : 1 }}>
        {carregando ? <><Loader2 size={16} className="cw-spin" /> Entrando…</> : <><LogIn size={16} /> Entrar</>}
      </Btn>

      <div style={{ textAlign: "center", fontSize: 13, color: C.text3, marginTop: 18 }}>
        Ainda não tem conta?{" "}
        <button type="button" onClick={irParaCadastro} style={{ color: C.cafe, fontWeight: 600 }}>Cadastre-se</button>
      </div>
    </form>
  );
}

function SignupCard({ irParaLogin }) {
  const [unidades, setUnidades] = useState([]);
  const [cidade, setCidade] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [f, setF] = useState({ nome: "", email: "", senha: "", telefone: "" });
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { fetchUnidadesPublicas().then(setUnidades); }, []);
  const cidades = [...new Set(unidades.map((u) => u.cidade))];
  useEffect(() => { if (!cidade && cidades.length) setCidade(cidades[0]); }, [unidades]); // eslint-disable-line
  const unidadesCidade = unidades.filter((u) => u.cidade === cidade);
  useEffect(() => { setUnidadeId(unidadesCidade[0]?.id || ""); }, [cidade, unidades]); // eslint-disable-line

  const valido = f.nome.trim() && f.email.trim() && f.senha.length >= 6 && unidadeId;

  const cadastrar = async (e) => {
    e?.preventDefault?.();
    if (!valido) { setErro(unidadeId ? "Preencha nome, e-mail e senha (mín. 6)." : "Escolha a cidade e a unidade."); return; }
    setErro(""); setCarregando(true);
    try {
      await cadastrarCliente({ nome: f.nome.trim(), email: f.email.trim(), senha: f.senha, telefone: f.telefone, unidade_id: unidadeId });
      await signInWithPassword(f.email.trim(), f.senha); // entra direto no portal
    } catch (err) {
      setErro(err?.message || "Não foi possível concluir o cadastro.");
      setCarregando(false);
    }
  };

  return (
    <form onSubmit={cadastrar} style={card}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
        <div>
          <label style={rotulo}>Cidade</label>
          <div style={{ position: "relative", marginTop: 6 }}>
            <MapPin size={16} color={C.text4} style={iconWrap} />
            <select value={cidade} onChange={(e) => setCidade(e.target.value)} style={{ ...inp, paddingLeft: 36 }}>
              {cidades.length === 0 && <option>Carregando…</option>}
              {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={rotulo}>Unidade</label>
          <div style={{ position: "relative", marginTop: 6 }}>
            <Building2 size={16} color={C.text4} style={iconWrap} />
            <select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} style={{ ...inp, paddingLeft: 36 }}>
              {unidadesCidade.length === 0 && <option value="">—</option>}
              {unidadesCidade.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
      </div>

      <label style={rotulo}>Seu nome</label>
      <div style={{ position: "relative", margin: "6px 0 12px" }}>
        <User size={16} color={C.text4} style={iconWrap} />
        <input value={f.nome} onChange={set("nome")} placeholder="Nome completo" style={{ ...inp, paddingLeft: 36 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={rotulo}>E-mail</label>
          <div style={{ position: "relative", margin: "6px 0 12px" }}>
            <Mail size={16} color={C.text4} style={iconWrap} />
            <input type="email" value={f.email} onChange={set("email")} placeholder="voce@email.com" style={{ ...inp, paddingLeft: 36 }} autoComplete="username" />
          </div>
        </div>
        <div>
          <label style={rotulo}>Telefone</label>
          <div style={{ position: "relative", margin: "6px 0 12px" }}>
            <Phone size={16} color={C.text4} style={iconWrap} />
            <input value={f.telefone} onChange={set("telefone")} placeholder="(31) 90000-0000" style={{ ...inp, paddingLeft: 36 }} />
          </div>
        </div>
      </div>

      <label style={rotulo}>Senha</label>
      <div style={{ position: "relative", margin: "6px 0 4px" }}>
        <Lock size={16} color={C.text4} style={iconWrap} />
        <input type="password" value={f.senha} onChange={set("senha")} placeholder="mínimo 6 caracteres" style={{ ...inp, paddingLeft: 36 }} autoComplete="new-password" />
      </div>

      {erro && <div style={{ fontSize: 12.5, color: C.red, background: C.redPale, borderRadius: 9, padding: "8px 12px", margin: "10px 0" }}>{erro}</div>}

      <Btn type="submit" variant="teal" disabled={carregando} style={{ width: "100%", marginTop: 14, opacity: carregando ? 0.7 : 1 }}>
        {carregando ? <><Loader2 size={16} className="cw-spin" /> Criando conta…</> : <><UserPlus size={16} /> Criar conta e entrar</>}
      </Btn>

      <div style={{ textAlign: "center", fontSize: 13, color: C.text3, marginTop: 18 }}>
        Já tem conta?{" "}
        <button type="button" onClick={irParaLogin} style={{ color: C.cafe, fontWeight: 600 }}>Entrar</button>
      </div>
    </form>
  );
}
