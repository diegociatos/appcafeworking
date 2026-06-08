import React, { useRef } from "react";
import { X, ImagePlus, Trash2, Repeat, Paperclip, FileText } from "lucide-react";
import { C, sans, serif } from "../lib/theme.js";

export const Card = ({ children, style, className = "", ...p }) => (
  <div
    className={`cw-lift cw-card ${className}`}
    style={{
      background: C.white,
      border: `1px solid ${C.border2}`,
      borderRadius: 16,
      padding: 22,
      ...style,
    }}
    {...p}
  >
    {children}
  </div>
);

export const Badge = ({ children, color = C.teal, bg }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
      color,
      background: bg || `${color}14`,
      padding: "3px 10px",
      borderRadius: 20,
      letterSpacing: 0.3,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

export const Btn = ({ children, variant = "primary", style, ...p }) => {
  const variants = {
    primary: { background: C.cafe, color: "#fff" },
    teal: { background: C.teal, color: "#fff" },
    ghost: { background: "transparent", color: C.text2, border: `1px solid ${C.border}` },
    soft: { background: C.cafePale, color: C.cafe },
  };
  return (
    <button
      className="cw-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: sans,
        fontWeight: 600,
        fontSize: 14,
        padding: "10px 18px",
        borderRadius: 12,
        ...variants[variant],
        ...style,
      }}
      {...p}
    >
      {children}
    </button>
  );
};

export const PageHead = ({ title, sub, action }) => (
  <div
    className="cw-fade"
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: 24,
      flexWrap: "wrap",
      gap: 12,
    }}
  >
    <div>
      <h1
        style={{
          fontFamily: serif,
          fontSize: "clamp(26px, 4vw, 34px)",
          fontWeight: 400,
          color: C.text,
          lineHeight: 1.1,
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 14, color: C.text3, marginTop: 4, maxWidth: 720 }}>{sub}</p>
    </div>
    {action}
  </div>
);

export const Field = ({ label, children, style }) => (
  <div style={{ marginBottom: 14, ...style }}>
    <label
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: C.text3,
        display: "block",
        marginBottom: 6,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </label>
    {children}
  </div>
);

export const Modal = ({ children, title, onClose, maxWidth = 440 }) => (
  <div
    onClick={onClose}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(31,31,28,.4)",
      backdropFilter: "blur(4px)",
      display: "grid",
      placeItems: "center",
      zIndex: 100,
      padding: 20,
      animation: "fadeUp .2s ease",
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "#fff",
        borderRadius: 20,
        padding: 26,
        width: "100%",
        maxWidth,
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 24px 60px rgba(31,31,28,.18)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <span style={{ fontFamily: serif, fontSize: 22 }}>{title}</span>
        <button onClick={onClose} aria-label="Fechar">
          <X size={22} color={C.text3} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export const Empty = ({ icon: Icon, title, sub }) => (
  <div style={{ padding: 40, textAlign: "center", color: C.text4 }}>
    {Icon && <Icon size={36} style={{ opacity: 0.4, marginBottom: 10 }} />}
    <div style={{ fontSize: 14 }}>
      <b style={{ color: C.text3 }}>{title}</b>
      {sub && <div style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  </div>
);

// Upload de imagem: arquivo (vira data URL) ou colar uma URL. O valor é
// sempre uma string (data:... ou https://...). 🔌 Ao ligar storage real,
// o arquivo passa a subir e `onChange` recebe a URL pública.
export const ImageInput = ({ value, onChange, height = 150 }) => {
  const fileRef = useRef(null);
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      {value ? (
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
          <img
            src={value}
            alt="prévia"
            style={{ width: "100%", height, objectFit: "cover", display: "block", background: C.cream2 }}
          />
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Trocar"
              style={{ background: "rgba(0,0,0,.55)", color: "#fff", borderRadius: 8, padding: 6, display: "grid", placeItems: "center" }}
            >
              <Repeat size={15} />
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              title="Remover"
              style={{ background: "rgba(0,0,0,.55)", color: "#fff", borderRadius: 8, padding: 6, display: "grid", placeItems: "center" }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            width: "100%",
            height,
            border: `2px dashed ${C.gray}`,
            borderRadius: 12,
            background: C.cream,
            color: C.text3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 8,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <ImagePlus size={26} />
          Enviar foto
        </button>
      )}
      <input
        type="url"
        value={value && value.startsWith("data:") ? "" : value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={value && value.startsWith("data:") ? "Foto enviada do dispositivo" : "ou cole uma URL de imagem"}
        disabled={!!(value && value.startsWith("data:"))}
        style={{
          width: "100%",
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "9px 12px",
          fontFamily: sans,
          fontSize: 13,
          outline: "none",
          background: value && value.startsWith("data:") ? C.cream2 : "#fff",
          color: C.text3,
        }}
      />
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
    </div>
  );
};

// Anexo de arquivo genérico (imagem OU PDF/documento). value = {nome,tipo,url}|null.
// 🔌 Ao ligar storage real, sobe o arquivo e guarda a URL pública.
export const FileInput = ({ value, onChange, accept = "image/*,application/pdf", label = "Anexar arquivo" }) => {
  const ref = useRef(null);
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ nome: file.name, tipo: file.type, url: reader.result });
    reader.readAsDataURL(file);
  };
  const isImg = value && ((value.tipo || "").startsWith("image") || /^data:image/.test(value.url || ""));
  return (
    <div>
      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8 }}>
          {isImg ? (
            <img src={value.url} alt={value.nome} style={{ width: 44, height: 44, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 7, background: C.cream2, display: "grid", placeItems: "center", flexShrink: 0 }}><FileText size={20} color={C.teal} /></div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value.nome}</div>
            <div style={{ fontSize: 11, color: C.green }}>Anexado ✓</div>
          </div>
          <button type="button" onClick={() => ref.current?.click()} title="Trocar" style={{ color: C.text3, padding: 6 }}><Repeat size={15} /></button>
          <button type="button" onClick={() => onChange(null)} title="Remover" style={{ color: C.red, padding: 6 }}><Trash2 size={15} /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          style={{ width: "100%", border: `2px dashed ${C.gray}`, borderRadius: 12, background: C.cream, color: C.text3, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px", fontSize: 13, fontWeight: 600 }}
        >
          <Paperclip size={18} /> {label}
        </button>
      )}
      <input ref={ref} type="file" accept={accept} onChange={onFile} style={{ display: "none" }} />
    </div>
  );
};
