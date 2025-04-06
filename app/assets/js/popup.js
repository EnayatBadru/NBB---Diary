/**
 * Objeto para armazenar os listeners de scroll de cada popup
 */
const scrollHandlers = {};

/**
 * Exibe um popup do tipo especificado ('success' ou 'error') com a mensagem dada.
 * @param {'success'|'error'} type 
 * @param {string} message 
 */
export function showPopup(type, message) {
  // Fecha qualquer popup ativo ou em closing
  document.querySelectorAll('.popup__container.active, .popup__container.closing')
    .forEach(el => el.classList.remove('active', 'closing'));

  const container = document.getElementById(type);
  if (!container) {
    console.error(`Popup "${type}" não encontrado.`);
    return;
  }

  const msgEl = container.querySelector('.mensagens');
  if (!msgEl) {
    console.error(`Elemento .mensagens não encontrado em #${type}`);
    return;
  }
  msgEl.textContent = message;

  // Reinicia animação
  void container.offsetWidth;
  container.classList.add('active');

  // Configura controle de scroll limitado
  const scrollStart = window.scrollY;
  const maxScroll = window.innerHeight * 0.2;

  const handleScroll = () => {
    const scrolled = Math.abs(window.scrollY - scrollStart);
    if (scrolled > maxScroll) {
      closePopup(type);
      window.removeEventListener('scroll', handleScroll);
      delete scrollHandlers[type];
    }
  };

  // Armazena o listener para que possa ser removido depois
  scrollHandlers[type] = handleScroll;
  window.addEventListener('scroll', handleScroll);
}

/**
 * Fecha o popup do tipo especificado, executando animação de saída.
 * @param {'success'|'error'} type 
 */
export function closePopup(type) {
  const container = document.getElementById(type);
  if (!container) {
    console.error(`Popup "${type}" não encontrado.`);
    return;
  }

  // Remove o listener de scroll, se existir
  if (scrollHandlers[type]) {
    window.removeEventListener('scroll', scrollHandlers[type]);
    delete scrollHandlers[type];
  }

  container.classList.remove('active');
  container.classList.add('closing');

  // Aguarda o fim da animação de saída para limpar a classe
  container.addEventListener('animationend', function handler(e) {
    container.classList.remove('closing');
    container.removeEventListener('animationend', handler);
  }, { once: true });
}

// Registra os botões de fechar popup automaticamente
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".popup__container .footer__popup button").forEach(btn => {
    btn.addEventListener("click", () => {
      const container = btn.closest(".popup__container");
      if (container?.id) {
        closePopup(container.id);
      }
    });
  });
});
