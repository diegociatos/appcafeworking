import React, { useState, useEffect } from "react";
import { LogIn, Lock, Mail, User, Phone, MapPin, Building2, Loader2, FileText, CreditCard, ExternalLink, CheckCircle2, Repeat, Zap, Copy } from "lucide-react";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { Btn } from "../components/ui.jsx";
import Logo from "../components/Logo.jsx";
import { signInWithPassword } from "../lib/supabaseAuth.js";
import { fetchUnidadesPublicas, fetchPlanosPublicos, iniciarAssinatura } from "../lib/authPublic.js";

const card = {
  position: "relative",
  background: "rgba(255,255,255,0.80)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,0.65)",
  borderRadius: 22,
  padding: 30,
  boxShadow: "0 30px 70px rgba(31,31,28,.14), 0 2px 8px rgba(31,31,28,.04)",
  overflow: "hidden",
};
const accent = { position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${C.cafe}, ${C.teal})` };
const rotulo = { fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: C.text2 };
const iconWrap = { position: "absolute", left: 12, top: 13 };

const blob = (extra) => ({ position: "absolute", borderRadius: "50%", filter: "blur(30px)", pointerEvents: "none", ...extra });

export default function Login() {
  const [modo, setModo] = useState("login"); // login | signup

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: sans, padding: 20, position: "relative", overflow: "hidden",
      background: `radial-gradient(1100px 700px at 88% -12%, rgba(110,78,59,.13), transparent 58%), radial-gradient(950px 650px at -8% 112%, rgba(14,75,79,.13), transparent 55%), ${C.cream}`,
    }}>
      <div style={blob({ top: -130, right: -90, width: 360, height: 360, background: "radial-gradient(circle, rgba(110,78,59,.20), transparent 70%)" })} />
      <div style={blob({ bottom: -150, left: -110, width: 400, height: 400, background: "radial-gradient(circle, rgba(14,75,79,.18), transparent 70%)" })} />

      <div className="cw-fade" style={{ width: "100%", maxWidth: modo === "signup" ? 456 : 400, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Logo size={56} />
          </div>
          <div style={{ fontFamily: serif, fontSize: 23, color: C.text, marginTop: 16 }}>
            {modo === "login" ? "Seja bem-vindo" : "Crie sua conta"}
          </div>
          <div style={{ fontSize: 13.5, color: C.text3, marginTop: 4 }}>
            {modo === "login" ? "Gestão completa do seu coworking, em um só lugar." : "Reserve salas, peça na cafeteria e gerencie tudo pelo app."}
          </div>
        </div>
        {modo === "login" ? <LoginCard irParaCadastro={() => setModo("signup")} /> : <SignupCard irParaLogin={() => setModo("login")} />}
        <div style={{ textAlign: "center", fontSize: 11.5, color: C.text4, marginTop: 18 }}>
          🔒 Conexão segura · CafeWorking
        </div>
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
      <div style={accent} />
      <div style={{ fontFamily: serif, fontSize: 22, color: C.text, marginBottom: 4 }}>Entrar</div>
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
  const [planos, setPlanos] = useState([]);
  const [planoId, setPlanoId] = useState("");
  const [carregandoPlanos, setCarregandoPlanos] = useState(false);
  const [f, setF] = useState({ nome: "", email: "", senha: "", telefone: "", documento: "" });
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [checkout, setCheckout] = useState(null); // { checkoutUrl, plano, valor, pix_payload }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { fetchUnidadesPublicas().then(setUnidades); }, []);
  const cidades = [...new Set(unidades.map((u) => u.cidade))];
  useEffect(() => { if (!cidade && cidades.length) setCidade(cidades[0]); }, [unidades]); // eslint-disable-line
  const unidadesCidade = unidades.filter((u) => u.cidade === cidade);
  useEffect(() => { setUnidadeId(unidadesCidade[0]?.id || ""); }, [cidade, unidades]); // eslint-disable-line
  // Carrega os planos da unidade escolhida.
  useEffect(() => {
    if (!unidadeId) { setPlanos([]); setPlanoId(""); return; }
    setCarregandoPlanos(true);
    fetchPlanosPublicos(unidadeId).then((ps) => { setPlanos(ps); setPlanoId(ps[0]?.id || ""); }).finally(() => setCarregandoPlanos(false));
  }, [unidadeId]);

  const plano = planos.find((p) => p.id === planoId);
  const valido = f.nome.trim() && f.email.trim() && f.senha.length >= 6 && unidadeId && planoId && f.documento.trim();

  const cadastrar = async (e) => {
    e?.preventDefault?.();
    if (!valido) {
      setErro(!unidadeId ? "Escolha a cidade e a unidade." : !planoId ? "Escolha um plano." : "Preencha nome, CPF/CNPJ, e-mail e senha (mín. 6).");
      return;
    }
    setErro(""); setCarregando(true);
    try {
      const r = await iniciarAssinatura({
        nome: f.nome.trim(), email: f.email.trim(), senha: f.senha, telefone: f.telefone,
        documento: f.documento, unidade_id: unidadeId, plano_id: planoId,
      });
      setCheckout(r);
    } catch (err) {
      setErro(err?.message || "Não foi possível iniciar a assinatura.");
    } finally {
      setCarregando(false);
    }
  };

  // ===== Tela de pagamento (após criar o cadastro) =====
  if (checkout) {
    return (
      <div style={card}>
        <div style={accent} />
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: C.tealPale, display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
            <CreditCard size={26} color={C.teal} />
          </div>
          <div style={{ fontFamily: serif, fontSize: 20, color: C.text }}>Falta só o pagamento</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>{checkout.plano} · <b>{fmt(checkout.valor)}</b></div>
        </div>
        <div style={{ background: C.cream, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, color: C.text2, margin: "16px 0", lineHeight: 1.55 }}>
          Sua conta foi criada e será <b>ativada assim que o pagamento for confirmado</b>. Pague por <b>cartão de crédito</b> ou <b>PIX</b> no link abaixo — depois é só entrar.
        </div>
        {checkout.checkoutUrl && (
          <a href={checkout.checkoutUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <Btn variant="teal" style={{ width: "100%", justifyContent: "center" }}><ExternalLink size={16} /> Pagar agora (cartão ou PIX)</Btn>
          </a>
        )}
        {checkout.pix_payload && (
          <button type="button" onClick={() => navigator.clipboard?.writeText(checkout.pix_payload)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 10, padding: "10px 0", border: `1px solid ${C.border}`, borderRadius: 11, fontSize: 13, color: C.text2, fontWeight: 600, background: C.white }}>
            <Copy size={14} /> Copiar PIX copia-e-cola
          </button>
        )}
        <Btn variant="ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={irParaLogin}>
          <CheckCircle2 size={16} /> Já paguei — entrar
        </Btn>
        <div style={{ fontSize: 11, color: C.text4, textAlign: "center", marginTop: 12 }}>
          A liberação é automática após a confirmação (pode levar alguns instantes no PIX).
        </div>
      </div>
    );
  }

  // ===== Formulário de cadastro =====
  return (
    <form onSubmit={cadastrar} style={card}>
      <div style={accent} />
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

      {/* Escolha do plano */}
      <label style={{ ...rotulo, display: "block", margin: "10px 0 6px" }}>Escolha seu plano</label>
      {carregandoPlanos ? (
        <div style={{ fontSize: 12.5, color: C.text3, padding: "10px 0" }}><Loader2 size={14} className="cw-spin" /> Carregando planos…</div>
      ) : planos.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.text3, background: C.cream, borderRadius: 10, padding: "10px 12px" }}>Esta unidade ainda não publicou planos. Fale com a recepção.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {planos.map((p) => {
            const sel = p.id === planoId;
            return (
              <button key={p.id} type="button" onClick={() => setPlanoId(p.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${sel ? C.cafe : C.border}`, background: sel ? C.cafePale : C.white, cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${sel ? C.cafe : C.gray}`, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  {sel && <div style={{ width: 9, height: 9, borderRadius: "50%", background: C.cafe }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{p.nome}</span>
                    {p.recorrencia === "mensal" ? <Repeat size={12} color={C.text4} /> : <Zap size={12} color={C.text4} />}
                  </div>
                  {p.descricao && <div style={{ fontSize: 11.5, color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</div>}
                </div>
                <div style={{ fontFamily: serif, fontSize: 16, color: C.cafe, flexShrink: 0 }}>{fmt(p.preco)}<span style={{ fontSize: 10.5, color: C.text4 }}>{p.recorrencia === "mensal" ? "/mês" : ""}</span></div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div>
          <label style={rotulo}>Seu nome</label>
          <div style={{ position: "relative", margin: "6px 0 0" }}>
            <User size={16} color={C.text4} style={iconWrap} />
            <input value={f.nome} onChange={set("nome")} placeholder="Nome completo" style={{ ...inp, paddingLeft: 36 }} />
          </div>
        </div>
        <div>
          <label style={rotulo}>CPF / CNPJ</label>
          <div style={{ position: "relative", margin: "6px 0 0" }}>
            <FileText size={16} color={C.text4} style={iconWrap} />
            <input value={f.documento} onChange={set("documento")} placeholder="só números" style={{ ...inp, paddingLeft: 36 }} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div>
          <label style={rotulo}>E-mail</label>
          <div style={{ position: "relative", margin: "6px 0 0" }}>
            <Mail size={16} color={C.text4} style={iconWrap} />
            <input type="email" value={f.email} onChange={set("email")} placeholder="voce@email.com" style={{ ...inp, paddingLeft: 36 }} autoComplete="username" />
          </div>
        </div>
        <div>
          <label style={rotulo}>Telefone</label>
          <div style={{ position: "relative", margin: "6px 0 0" }}>
            <Phone size={16} color={C.text4} style={iconWrap} />
            <input value={f.telefone} onChange={set("telefone")} placeholder="(31) 90000-0000" style={{ ...inp, paddingLeft: 36 }} />
          </div>
        </div>
      </div>

      <label style={{ ...rotulo, display: "block", marginTop: 12 }}>Senha</label>
      <div style={{ position: "relative", margin: "6px 0 4px" }}>
        <Lock size={16} color={C.text4} style={iconWrap} />
        <input type="password" value={f.senha} onChange={set("senha")} placeholder="mínimo 6 caracteres" style={{ ...inp, paddingLeft: 36 }} autoComplete="new-password" />
      </div>

      {erro && <div style={{ fontSize: 12.5, color: C.red, background: C.redPale, borderRadius: 9, padding: "8px 12px", margin: "10px 0" }}>{erro}</div>}

      <Btn type="submit" variant="teal" disabled={carregando} style={{ width: "100%", marginTop: 14, opacity: carregando ? 0.7 : 1 }}>
        {carregando ? <><Loader2 size={16} className="cw-spin" /> Gerando pagamento…</> : <><CreditCard size={16} /> Continuar para o pagamento</>}
      </Btn>

      <div style={{ textAlign: "center", fontSize: 13, color: C.text3, marginTop: 18 }}>
        Já tem conta?{" "}
        <button type="button" onClick={irParaLogin} style={{ color: C.cafe, fontWeight: 600 }}>Entrar</button>
      </div>
    </form>
  );
}
