export function validarEmailsCliente(principal, adicionais = []) {
  const normalizar = (v) => String(v || "").trim().toLowerCase();
  const email = normalizar(principal);
  const lista = [...new Set(adicionais.map(normalizar).filter(Boolean))].filter(v => v !== email);
  if (lista.length > 10) throw new Error("Cadastre até 10 e-mails adicionais.");
  if (lista.length && !email) throw new Error("Informe o e-mail principal antes dos adicionais.");
  if ([email, ...lista].filter(Boolean).some(v => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v))) throw new Error("Confira os e-mails: use um endereço válido por campo.");
  return { email, emailsAdicionais: lista };
}
