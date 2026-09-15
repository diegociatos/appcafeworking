"""
Publica os modelos de contrato do site no Supabase (tabela contratos_modelos).

Cada publicação cria uma NOVA versão vigente da categoria na unidade; a anterior
sai de vigência e continua guardada (os aceites apontam para ela). O hash do
texto é calculado pelo banco. Só publica o que mudou em relação à versão vigente.

  python supabase/contratos/publicar.py --testar   # publica e desfaz (confere)
  python supabase/contratos/publicar.py            # publica de verdade

O texto é normalizado antes de publicar (quebras de linha LF, sem espaço no fim
das linhas), para que a mesma versão do arquivo gere sempre o mesmo hash.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
LUXEMBURGO = "un_cafeworkingluxembu_e78be3"
ESTORIL = "un_cafeworkingestoril_a1c7e2"

# (unidade, categoria, título exibido no aceite, arquivo)
MODELOS = [
    (LUXEMBURGO, "endereco_fiscal", "Contrato de endereço fiscal e comercial", "endereco_fiscal_luxemburgo_v2.txt"),
    (LUXEMBURGO, "coworking", "Contrato de sala compartilhada (coworking)", "coworking_luxemburgo_v1.txt"),
    (LUXEMBURGO, "sala_privativa", "Contrato de sala privativa", "sala_privativa_luxemburgo_v1.txt"),
    (LUXEMBURGO, "abertura_empresa", "Contrato de abertura de empresa", "abertura_empresa_luxemburgo_v1.txt"),
    (LUXEMBURGO, "sala_hora", "Termo de reserva de sala de reunião por hora", "sala_hora_luxemburgo_v1.txt"),
    (ESTORIL, "endereco_fiscal", "Contrato de endereço fiscal e comercial", "endereco_fiscal_estoril_v1.txt"),
]


def normalizar(texto):
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(l.rstrip() for l in texto.split("\n")).strip() + "\n"


def literal(texto, tag):
    marcador = f"${tag}$"
    if marcador in texto:
        sys.exit(f"o texto contém {marcador}; troque a tag")
    return f"{marcador}{texto}{marcador}"


def vigentes():
    """(unidade, categoria) -> hash da versão vigente."""
    unidades = ", ".join(f"'{u}'" for u in sorted({m[0] for m in MODELOS}))
    r = subprocess.run(["supabase", "db", "query", "--linked",
                        f"select unidade_id, categoria, hash from public.contratos_modelos where unidade_id in ({unidades}) and vigente"],
                       cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r"\{.*\}", (r.stdout or ""), re.S)
    if not m:
        sys.exit("não consegui ler as versões vigentes:\n" + (r.stdout or "") + (r.stderr or ""))
    return {(row["unidade_id"], row["categoria"]): row["hash"] for row in json.loads(m.group(0)).get("rows", [])}


def montar_sql(testar, modelos):
    partes = ["begin;"]
    chamadas = []
    for i, (unidade, categoria, titulo, arquivo) in enumerate(modelos):
        corpo = normalizar((AQUI / arquivo).read_text(encoding="utf-8"))
        chamadas.append(
            f"(select to_jsonb(c) - 'corpo' from public.publicar_contrato_modelo("
            f"{literal(unidade, 'u')}, {literal(categoria, 'k')}, {literal(titulo, 't')}, {literal(corpo, f'corpo{i}')}) c)"
        )
    lista = ", ".join(chamadas)
    if testar:
        partes.append(
            "do $dry$ declare r jsonb; begin "
            f"select jsonb_build_array({lista}) into r; "
            "raise exception 'TESTE_OK %', r::text; end $dry$;"
        )
    else:
        partes.append(f"select jsonb_build_array({lista}) as publicados;")
        partes.append("commit;")
    return "\n".join(partes)


def main():
    testar = "--testar" in sys.argv
    esperado = {}
    for unidade, categoria, _, arquivo in MODELOS:
        corpo = normalizar((AQUI / arquivo).read_text(encoding="utf-8"))
        esperado[(unidade, categoria)] = hashlib.sha256(corpo.encode("utf-8")).hexdigest()

    atuais = vigentes()
    modelos = [m for m in MODELOS if atuais.get((m[0], m[1])) != esperado[(m[0], m[1])]]
    for unidade, categoria, _, _ in MODELOS:
        chave = (unidade, categoria)
        if atuais.get(chave) == esperado[chave]:
            print(f"  --  {unidade[:22]:<22} {categoria:<16} sem mudança (vigente {esperado[chave][:12]}…)")
    if not modelos:
        print("\nNada a publicar: os textos vigentes já são os dos arquivos.")
        return 0

    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8", newline="\n") as f:
        f.write(montar_sql(testar, modelos))
        caminho = f.name
    try:
        r = subprocess.run(["supabase", "db", "query", "--linked", "-f", caminho], cwd=REPO,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
    finally:
        os.unlink(caminho)
    saida = (r.stdout or "") + (r.stderr or "")

    if testar:
        m = re.search(r"TESTE_OK (\[.*?\])(?:\\n|\"|$)", saida.replace('\\"', '"'))
    else:
        m = re.search(r'"publicados":\s*(\[.*?\])\s*\}', saida, re.S)
    if not m:
        print("FALHOU:\n" + saida[-3000:])
        return 1
    publicados = json.loads(m.group(1))

    falhas = 0
    for p in publicados:
        chave = (p["unidade_id"], p["categoria"])
        ok = p["hash"] == esperado.get(chave) and p["vigente"] is True
        falhas += not ok
        print(f"  {'OK ' if ok else 'ERR'} {p['unidade_id'][:22]:<22} {p['categoria']:<16} versão {p['versao']}  hash {p['hash'][:12]}…  {p['titulo']}")
    print(("\nTESTE: publicado e desfeito, nada ficou gravado." if testar else "\nPUBLICADO.") if not falhas else f"\n{falhas} FALHA(S)")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
