// CafeWorking — design tokens
// Paleta fiel à logomarca: marrom café + teal escuro + creme

export const C = {
  // Backgrounds
  cream: "#F7F4EE",
  cream2: "#EFE9DF",
  white: "#FFFFFF",

  // Texto (não-preto absoluto, mais quente)
  text: "#1F1F1C",
  text2: "#3D3A35",
  text3: "#6B6560",
  text4: "#A09890",

  // Bordas
  border: "rgba(31,31,28,.1)",
  border2: "rgba(31,31,28,.06)",
  gray: "#D8D1C7",
  gray2: "#E8E2D8",

  // Marca — Café (extraído da logo)
  cafe: "#6E4E3B",
  cafe2: "#8A6550",
  cafe3: "#B8967C",
  cafePale: "rgba(110,78,59,.08)",
  cafeLine: "rgba(110,78,59,.15)",

  // Marca — Teal (extraído da logo)
  teal: "#0E4B4F",
  teal2: "#1A6468",
  teal3: "#2A7E82",
  tealPale: "rgba(14,75,79,.07)",
  tealLine: "rgba(14,75,79,.15)",

  // Status
  green: "#3D7A5A",
  greenPale: "rgba(61,122,90,.1)",
  amber: "#B8862F",
  amberPale: "rgba(184,134,47,.12)",
  red: "#A8453A",
  redPale: "rgba(168,69,58,.1)",
  blue: "#335C81",
  bluePale: "rgba(51,92,129,.1)",
};

// Tipografia da marca: Book Antiqua em todo o app (Palatino/Georgia fazem o
// mesmo papel em macOS/iOS/Linux/Android). `serif` (títulos/números) e `sans`
// (interface) apontam para a mesma pilha — todas as letras Book Antiqua.
const bookAntiqua =
  "'Book Antiqua', 'Palatino Linotype', Palatino, 'URW Palladio L', 'Palatino LT STD', Georgia, serif";
export const serif = bookAntiqua;
export const sans = bookAntiqua;

// Sombras em camadas (profundidade suave e consistente).
export const shadow = {
  sm: "0 1px 2px rgba(31,31,28,.04), 0 4px 12px rgba(31,31,28,.04)",
  md: "0 2px 6px rgba(31,31,28,.05), 0 12px 30px rgba(31,31,28,.07)",
  lg: "0 24px 60px rgba(31,31,28,.16)",
  brand: "0 6px 18px rgba(110,78,59,.28)",
  teal: "0 6px 18px rgba(14,75,79,.26)",
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };

export const fmt = (n) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtShort = (n) => {
  if (n >= 1000) return "R$ " + (n / 1000).toFixed(1).replace(".", ",") + "k";
  return fmt(n);
};

export const inp = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 11,
  padding: "11px 14px",
  fontFamily: sans,
  fontSize: 14,
  outline: "none",
  background: "#fff",
  color: C.text,
  transition: "border-color .15s ease, box-shadow .15s ease, background .15s ease",
};
