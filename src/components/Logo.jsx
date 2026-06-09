import React, { useState } from "react";
import { C, serif } from "../lib/theme.js";

/**
 * Logo CafeWorking.
 *
 * Usa o ARQUIVO REAL da marca quando existir em `public/logo.png` (o ideal —
 * fica pixel-perfeito). Se o arquivo não estiver presente, cai para um desenho
 * SVG aproximado (xícara + Wi-Fi + base de lâmpada, nas cores da marca).
 *
 * Para usar a sua logo exata: salve a imagem (só o ícone, fundo transparente,
 * idealmente .png ou .svg quadrado) em `public/logo.png`.
 */
function LogoMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="CafeWorking">
      {/* Wi-Fi */}
      <path d="M31 27 Q50 12 69 27" stroke={C.teal} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M38 34 Q50 24 62 34" stroke={C.teal} strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="50" cy="40" r="3" fill={C.teal} />
      {/* Xícara */}
      <path d="M33 47 L67 47 L63 70 Q61.5 76 54 76 L46 76 Q38.5 76 37 70 Z"
        fill="none" stroke={C.cafe} strokeWidth="4.5" strokeLinejoin="round" />
      {/* Asa */}
      <path d="M67 51 Q80 51 80 60.5 Q80 70 67 70" fill="none" stroke={C.cafe} strokeWidth="4.5" strokeLinecap="round" />
      {/* Café (swirl) */}
      <path d="M50 52 Q45 57 50 62 Q55 57 50 52" fill={C.cafe} />
      {/* Base de lâmpada */}
      <path d="M45 79 L55 79 M46 84 L54 84 M47.5 88.5 L52.5 88.5" stroke={C.cafe} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 36, showText = true, showSub = true, sub = "CAFETERIA E COWORKING" }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {imgOk ? (
        <img
          src="/logo.png"
          alt="CafeWorking"
          width={size}
          height={size}
          style={{ objectFit: "contain", display: "block", flexShrink: 0 }}
          onError={() => setImgOk(false)}
        />
      ) : (
        <LogoMark size={size} />
      )}
      {showText && (
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontFamily: serif, fontSize: size * 0.52, fontWeight: 600, letterSpacing: "-0.01em" }}>
            <span style={{ color: C.cafe }}>Cafe</span>
            <span style={{ color: C.teal }}>Working</span>
          </div>
          {showSub && sub && (
            <div style={{ fontSize: Math.max(8.5, size * 0.165), letterSpacing: 1.8, color: C.text4, marginTop: 4, fontWeight: 600 }}>
              {sub}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
