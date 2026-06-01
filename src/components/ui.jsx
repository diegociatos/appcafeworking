import React from "react";
import { X } from "lucide-react";
import { C, sans, serif } from "../lib/theme.js";

export const Card = ({ children, style, className = "", ...p }) => (
  <div
    className={`cw-lift ${className}`}
    style={{
      background: C.white,
      border: `1px solid ${C.border2}`,
      borderRadius: 18,
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
