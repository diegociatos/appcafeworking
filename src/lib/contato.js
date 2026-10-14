// Canais de atendimento do CafeWorking mostrados ao cliente.
export const CONTATO = {
  whatsapp: "(31) 99657-1215",
  whatsappLink: (texto = "Olá! Sou cliente do CafeWorking e preciso de ajuda.") =>
    `https://wa.me/5531996571215?text=${encodeURIComponent(texto)}`,
  email: "atendimento@cafeworking.com.br",
  horario: "Segunda a sexta, das 8h às 18h",
};
