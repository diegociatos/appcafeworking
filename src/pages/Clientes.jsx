import React, { useState } from "react";
import {
  Plus, Users, Briefcase, ChevronRight, ChevronLeft, FileText,
  Building, Mail, Phone, Upload, Download, FileCheck, FileClock,
  AlertCircle,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty } from "../components/ui.jsx";
import { C, serif } from "../lib/theme.js";
import { CLIENTES } from "../lib/data.js";

export default function Clientes() {
  const [sel, setSel] = useState(null);
  const cli = CLIENTES.find((c) => c.id === sel);
  if (cli) return <ClienteDetalhe cli={cli} onBack={() => setSel(null)} />;

  return (
    <div>
      <PageHead
        title="Clientes"
        sub="Contratos, planos, documentos, faturas, reservas e histórico completo."
        action={
          <Btn>
            <Plus size={16} /> Novo cliente
          </Btn>
        }
      />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {CLIENTES.map((c, i) => {
          const novos = c.docs.filter((d) => d.status === "novo").length;
          return (
            <div
              key={c.id}
              onClick={() => setSel(c.id)}
              className="cw-lift"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 18,
                borderBottom: i < CLIENTES.length - 1 ? `1px solid ${C.border2}` : "none",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: c.fiscal ? C.tealPale : C.cafePale,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {c.fiscal ? (
                  <Briefcase size={22} color={C.teal} />
                ) : (
                  <Users size={22} color={C.cafe} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>
                  CNPJ {c.cnpj} · desde {c.desde}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge color={C.cafe}>{c.plano}</Badge>
                {c.fiscal && <Badge color={C.teal}>Endereço Fiscal</Badge>}
                {novos > 0 && (
                  <Badge color={C.amber} bg={C.amberPale}>
                    {novos} doc novo
                  </Badge>
                )}
                <Badge
                  color={c.status === "ativo" ? C.green : C.amber}
                  bg={c.status === "ativo" ? C.greenPale : C.amberPale}
                >
                  {c.status}
                </Badge>
              </div>
              <ChevronRight size={18} color={C.text4} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function ClienteDetalhe({ cli, onBack }) {
  const [docs, setDocs] = useState(cli.docs);
  return (
    <div>
      <button
        onClick={onBack}
        style={{
          fontSize: 14,
          color: C.text3,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <ChevronLeft size={16} /> Voltar para clientes
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16 }} className="cw-grid-stack">
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: cli.fiscal ? C.tealPale : C.cafePale,
                display: "grid",
                placeItems: "center",
              }}
            >
              {cli.fiscal ? (
                <Briefcase size={26} color={C.teal} />
              ) : (
                <Users size={26} color={C.cafe} />
              )}
            </div>
            <div>
              <div style={{ fontFamily: serif, fontSize: 22, color: C.text }}>{cli.nome}</div>
              <Badge
                color={cli.status === "ativo" ? C.green : C.amber}
                bg={cli.status === "ativo" ? C.greenPale : C.amberPale}
              >
                {cli.status}
              </Badge>
            </div>
          </div>
          {[
            [FileText, "CNPJ", cli.cnpj],
            [Briefcase, "Plano", cli.plano],
            [Building, "Unidade", cli.unidade],
            [Users, "Contato", cli.contato],
            [Mail, "E-mail", cli.email],
            [Phone, "Telefone", cli.tel],
          ].map(([Ic, l, v], i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < 5 ? `1px solid ${C.border2}` : "none",
              }}
            >
              <Ic size={17} color={C.text4} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.text3 }}>{l}</div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{v}</div>
              </div>
            </div>
          ))}
          {cli.fiscal && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                background: C.tealPale,
                borderRadius: 12,
                display: "flex",
                gap: 10,
              }}
            >
              <Briefcase size={18} color={C.teal} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: C.teal2 }}>
                Cliente com <b>endereço fiscal ativo</b>. Correspondências recebidas são digitalizadas
                e disponibilizadas aqui.
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div style={{ fontFamily: serif, fontSize: 20 }}>Documentos & Correspondências</div>
            <Btn
              variant="teal"
              style={{ padding: "8px 14px", fontSize: 13 }}
              onClick={() =>
                setDocs((d) => [
                  {
                    nome: "Novo documento.pdf",
                    tipo: "Correspondência",
                    data: "28/05/2026",
                    status: "novo",
                  },
                  ...d,
                ])
              }
            >
              <Upload size={15} /> Enviar
            </Btn>
          </div>
          {docs.length === 0 ? (
            <Empty icon={FileText} title="Nenhum documento ainda" />
          ) : (
            docs.map((d, i) => {
              const sc = {
                ok: [C.green, C.greenPale, "Aprovado", FileCheck],
                novo: [C.amber, C.amberPale, "Novo", FileClock],
                pendente: [C.red, C.redPale, "Pendente", AlertCircle],
              }[d.status];
              const Ic = sc[3];
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 0",
                    borderBottom: i < docs.length - 1 ? `1px solid ${C.border2}` : "none",
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: sc[1],
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Ic size={18} color={sc[0]} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{d.nome}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>
                      {d.tipo} · {d.data}
                    </div>
                  </div>
                  <Badge color={sc[0]} bg={sc[1]}>
                    {sc[2]}
                  </Badge>
                  <button style={{ color: C.text4, padding: 6 }} aria-label="Baixar">
                    <Download size={17} />
                  </button>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </div>
  );
}
