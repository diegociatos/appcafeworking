// Canais de atendimento do CafeWorking mostrados ao cliente.
export const CONTATO = {
  whatsapp: "(31) 99712-9789",
  whatsappLink: (texto = "Olá! Sou cliente do CafeWorking e preciso de ajuda.") =>
    `https://wa.me/5531997129789?text=${encodeURIComponent(texto)}`,
  email: "atendimento@cafeworking.com.br",
  horario: "Segunda a sexta, das 8h às 18h",
};
