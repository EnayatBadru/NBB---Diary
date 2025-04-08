/**
 * Objeto para armazenar os listeners de scroll de cada popup
 */
const scrollHandlers = {};

/**
 * Exibe um popup do tipo especificado ('success' | 'error' | 'alert') com a mensagem dada.
 * @param {'success'|'error'|'alert'} type 
 * @param {string} message 
 */
export function showPopup(type, message) {
  // Para popups que não sejam de alerta, fecha os que estiverem abertos
  if (type !== 'alert') {
    document.querySelectorAll('.popup__container.active, .popup__container.closing')
      .forEach(el => el.classList.remove('active', 'closing'));
  }

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

  // Reinicia a animação
  void container.offsetWidth;
  container.classList.add('active');

  // Para popups que não sejam de alerta, configura o fechamento via scroll
  if (type !== 'alert') {
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

    scrollHandlers[type] = handleScroll;
    window.addEventListener('scroll', handleScroll);
  }
}

/**
 * Fecha o popup do tipo especificado, executando a animação de saída.
 * @param {'success'|'error'|'alert'} type 
 */
export function closePopup(type) {
  const container = document.getElementById(type);
  if (!container) {
    console.error(`Popup "${type}" não encontrado.`);
    return;
  }

  if (scrollHandlers[type]) {
    window.removeEventListener('scroll', scrollHandlers[type]);
    delete scrollHandlers[type];
  }

  container.classList.remove('active');
  container.classList.add('closing');

  container.addEventListener('animationend', function handler(e) {
    container.classList.remove('closing');
    container.removeEventListener('animationend', handler);
  }, { once: true });
}

// Registra os botões de fechar popup automaticamente (exceto o de alerta, que tem tratamento customizado)
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".popup__container:not(#alert) .footer__popup button").forEach(btn => {
    btn.addEventListener("click", () => {
      const container = btn.closest(".popup__container");
      if (container?.id) {
        closePopup(container.id);
      }
    });
  });
});