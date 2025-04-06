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
  
    container.classList.remove('active');
    container.classList.add('closing');
  
    // Aguarda o fim da animação de saída
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
  