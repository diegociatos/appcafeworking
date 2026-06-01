import React from "react";
import { Plus, MapPin, Edit3, Building2 } from "lucide-react";
import { Card, Btn, PageHead } from "../components/ui.jsx";
import { C, serif, fmtShort } from "../lib/theme.js";
import { UNIDADES } from "../lib/data.js";

export default function Unidades() {
  return (
    <div>
      <PageHead
        title="Unidades"
        sub="Gestão completa dos seus espaços CafeWorking"
        action={
          <Btn>
            <Plus size={16} /> Nova unidade
          </Btn>
        }
      />
      {UNIDADES.map((u, i) => (
        <Card key={u.id} className={`cw-fade cw-fade-${i + 1}`} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: `${u.cor}16`,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Building2 size={30} color={u.cor} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: serif, fontSize: 24, color: C.text }}>{u.nome}</div>
              <div
                style={{
                  fontSize: 13,
                  color: C.text3,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginTop: 3,
                }}
              >
                <MapPin size={13} /> {u.endereco}
              </div>
            </div>
            {[
              ["Salas", u.salas],
              ["Membros", u.membros],
              ["Ocupação", u.ocupacao + "%"],
              ["Receita/mês", fmtShort(u.receita)],
            ].map(([l, v], j) => (
              <div key={j} style={{ textAlign: "center", minWidth: 90 }}>
                <div style={{ fontFamily: serif, fontSize: 22, color: u.cor }}>{v}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>{l}</div>
              </div>
            ))}
            <Btn variant="ghost">
              <Edit3 size={15} /> Gerenciar
            </Btn>
          </div>
        </Card>
      ))}
    </div>
  );
}
