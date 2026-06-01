import React from "react";
import { C, serif } from "../lib/theme.js";

/**
 * Logo CafeWorking — versão SVG fiel à marca:
 * - Wi-fi/ondas no topo (teal)
 * - Xícara estilizada (marrom café)
 * - Filamento de lâmpada na base (marrom café)
 * - Tipografia: "Cafe" (marrom) + "Working" (teal)
 */
export default function Logo({ size = 36, showText = true, showSub = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="CafeWorking">
        {/* Wi-fi / ondas */}
        <path d="M36 16 Q50 6 64 16" stroke={C.teal} strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M40 23 Q50 16 60 23" stroke={C.teal} strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M44 30 Q50 26 56 30" stroke={C.teal} strokeWidth="5" strokeLinecap="round" fill="none" />
        {/* Xícara */}
        <path
          d="M30 40 L70 40 L62 70 Q60 78 50 78 Q40 78 38 70 Z"
          fill="none"
          stroke={C.cafe}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* Asa */}
        <path
          d="M68 44 Q82 44 82 56 Q82 66 70 66"
          fill="none"
          stroke={C.cafe}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Vapor/grão dentro */}
        <path
          d="M48 48 Q44 54 48 60 Q52 54 48 48"
          fill={C.cafe}
        />
        {/* Filamento da lâmpada (base) */}
        <path d="M44 82 L56 82" stroke={C.cafe} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M46 88 L54 88" stroke={C.cafe} strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      {showText && (
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontFamily: serif, fontSize: size * 0.52, color: C.text }}>
            <span style={{ color: C.cafe }}>Cafe</span>
            <span style={{ color: C.teal }}>Working</span>
          </div>
          {showSub && (
            <div
              style={{
                fontSize: Math.max(9, size * 0.2),
                letterSpacing: 2,
                color: C.text4,
                marginTop: 3,
                fontWeight: 500,
              }}
            >
              ADMIN · GRUPO CIATOS
            </div>
          )}
        </div>
      )}
    </div>
  );
}
