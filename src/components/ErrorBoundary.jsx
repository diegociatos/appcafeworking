import React from "react";
import { RefreshCw, Home } from "lucide-react";
import { C, serif, sans, shadow, radius } from "../lib/theme.js";
import Logo from "./Logo.jsx";

/**
 * ErrorBoundary — impede a "tela branca" quando uma página lança erro.
 * Mostra um fallback com a marca + ações. Envolva o <Page/> com key={pageId}
 * para que trocar de página remonte e limpe o erro automaticamente.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { hasError: true, erro };
  }

  componentDidCatch(erro, info) {
    console.error("ErrorBoundary capturou um erro:", erro, info?.componentStack);
  }

  reset = () => this.setState({ hasError: false, erro: null });

  irParaInicio = () => {
    this.reset();
    if (this.props.onHome) this.props.onHome();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const btn = (variante) => ({
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      padding: "11px 20px", borderRadius: radius.md, fontFamily: sans, fontSize: 14, fontWeight: 600,
      cursor: "pointer", border: `1px solid ${variante === "primario" ? C.cafe : C.border}`,
      background: variante === "primario" ? C.cafe : "#fff",
      color: variante === "primario" ? "#fff" : C.text2,
    });

    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, fontFamily: sans }}>
        <div
          role="alert"
          style={{
            maxWidth: 460, width: "100%", textAlign: "center",
            background: "#fff", border: `1px solid ${C.border2}`, borderRadius: radius.xl,
            boxShadow: shadow.lg, padding: "36px 28px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <Logo size={52} showSub={false} />
          </div>
          <div style={{ fontFamily: serif, fontSize: 22, color: C.text, marginBottom: 8 }}>
            Algo deu errado nesta tela
          </div>
          <div style={{ fontSize: 14, color: C.text3, lineHeight: 1.6, marginBottom: 22 }}>
            Tivemos um problema ao mostrar esta página. Seus dados estão seguros — tente recarregar
            ou voltar ao início. Se continuar, nos avise.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => window.location.reload()} style={btn("primario")}>
              <RefreshCw size={16} /> Recarregar
            </button>
            <button type="button" onClick={this.irParaInicio} style={btn("secundario")}>
              <Home size={16} /> Voltar ao início
            </button>
          </div>
          {this.state.erro?.message && (
            <div style={{ marginTop: 18, fontSize: 11.5, color: C.text4, fontFamily: "monospace", wordBreak: "break-word" }}>
              {String(this.state.erro.message).slice(0, 200)}
            </div>
          )}
        </div>
      </div>
    );
  }
}
