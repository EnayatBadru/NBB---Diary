/**
 * Sistema de popup aprimorado
 * Suporta tipos: 'success', 'error', 'alert', 'info'
 */

const scrollHandlers = {};
const autoCloseTimers = {};

export function showPopup(type, message, options = {}) {
  try {
    if (!['success', 'error', 'alert', 'info'].includes(type)) {
      type = 'info';
    }
    
    const { 
      duration = type === 'alert' ? 0 : 3000,  
      closeOnScroll = type !== 'alert'
    } = options;
    
    if (type !== 'alert') {
      const existingPopup = document.getElementById(type);
      if (existingPopup) {
        closePopup(type);
      }
    }

    let container = document.getElementById(type);
    if (!container) {
      container = document.createElement('div');
      container.id = type;
      container.className = 'popup__container';
      container.style.position = 'fixed';
      container.style.top = '20px';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.padding = '15px 20px';
      container.style.borderRadius = '5px';
      container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      container.style.zIndex = '9999';
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.gap = '10px';
      container.style.maxWidth = '90%';
      container.style.opacity = '0';
      container.style.transition = 'opacity 0.3s, transform 0.3s';
      
      switch(type) {
        case 'success':
          container.style.backgroundColor = '#4CAF50';
          container.style.color = 'white';
          break;
        case 'error':
          container.style.backgroundColor = '#F44336';
          container.style.color = 'white';
          break;
        case 'alert':
          container.style.backgroundColor = '#FF9800';
          container.style.color = 'white';
          break;
        case 'info':
        default:
          container.style.backgroundColor = '#2196F3';
          container.style.color = 'white';
      }
      
      const msgEl = document.createElement('div');
      msgEl.className = 'mensagens';
      msgEl.style.flex = '1';
      
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.style.background = 'none';
      closeBtn.style.border = 'none';
      closeBtn.style.color = 'white';
      closeBtn.style.fontSize = '20px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.padding = '0 0 0 10px';
      closeBtn.addEventListener('click', () => closePopup(type));
      
      container.appendChild(msgEl);
      container.appendChild(closeBtn);
      document.body.appendChild(container);
    }

    const msgEl = container.querySelector('.mensagens');
    if (msgEl) {
      msgEl.textContent = message;
    }

    if (autoCloseTimers[type]) {
      clearTimeout(autoCloseTimers[type]);
      delete autoCloseTimers[type];
    }
    
    if (scrollHandlers[type]) {
      window.removeEventListener('scroll', scrollHandlers[type]);
      delete scrollHandlers[type];
    }

    container.style.opacity = '0';
    container.style.transform = 'translateX(-50%) translateY(-10px)';
    void container.offsetWidth;
    container.style.opacity = '1';
    container.style.transform = 'translateX(-50%) translateY(0)';
    container.classList.add('active');

    if (duration > 0) {
      autoCloseTimers[type] = setTimeout(() => {
        closePopup(type);
      }, duration);
    }

    if (closeOnScroll) {
      const scrollStart = window.scrollY;
      const maxScroll = window.innerHeight * 0.2;

      const handleScroll = () => {
        const scrolled = Math.abs(window.scrollY - scrollStart);
        if (scrolled > maxScroll) {
          closePopup(type);
        }
      };

      scrollHandlers[type] = handleScroll;
      window.addEventListener('scroll', handleScroll);
    }
  } catch (error) {
    console.error("Erro ao mostrar popup:", error);
    alert(`${type.toUpperCase()}: ${message}`);
  }
}

export function closePopup(type) {
  const container = document.getElementById(type);
  if (!container) return;

  if (scrollHandlers[type]) {
    window.removeEventListener('scroll', scrollHandlers[type]);
    delete scrollHandlers[type];
  }

  if (autoCloseTimers[type]) {
    clearTimeout(autoCloseTimers[type]);
    delete autoCloseTimers[type];
  }

  container.style.opacity = '0';
  container.style.transform = 'translateX(-50%) translateY(-10px)';
  container.classList.remove('active');
  container.classList.add('closing');

  setTimeout(() => {
    if (container.parentNode) {
      container.classList.remove('closing');
    }
  }, 300);
}

export function confirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    try {
      const {
        title = 'Confirmação',
        confirmText = 'Confirmar',
        cancelText = 'Cancelar'
      } = options;
      
      const backdrop = document.createElement('div');
      backdrop.style.position = 'fixed';
      backdrop.style.top = '0';
      backdrop.style.left = '0';
      backdrop.style.width = '100%';
      backdrop.style.height = '100%';
      backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      backdrop.style.zIndex = '10000';
      backdrop.style.display = 'flex';
      backdrop.style.justifyContent = 'center';
      backdrop.style.alignItems = 'center';
      
      const dialog = document.createElement('div');
      dialog.style.backgroundColor = '#fff';
      dialog.style.borderRadius = '8px';
      dialog.style.padding = '20px';
      dialog.style.width = '350px';
      dialog.style.maxWidth = '90%';
      dialog.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
      
      const titleEl = document.createElement('h3');
      titleEl.textContent = title;
      titleEl.style.margin = '0 0 15px 0';
      
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.marginBottom = '20px';
      
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'flex-end';
      buttonContainer.style.gap = '10px';
      
      const cancelButton = document.createElement('button');
      cancelButton.textContent = cancelText;
      cancelButton.style.padding = '8px 15px';
      cancelButton.style.backgroundColor = '#f1f1f1';
      cancelButton.style.border = 'none';
      cancelButton.style.borderRadius = '4px';
      cancelButton.style.cursor = 'pointer';
      
      const confirmButton = document.createElement('button');
      confirmButton.textContent = confirmText;
      confirmButton.style.padding = '8px 15px';
      confirmButton.style.backgroundColor = '#e74c3c';
      confirmButton.style.color = 'white';
      confirmButton.style.border = 'none';
      confirmButton.style.borderRadius = '4px';
      confirmButton.style.cursor = 'pointer';
      
      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(confirmButton);
      dialog.appendChild(titleEl);
      dialog.appendChild(messageEl);
      dialog.appendChild(buttonContainer);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      
      cancelButton.addEventListener('click', () => {
        document.body.removeChild(backdrop);
        resolve(false);
      });
      
      confirmButton.addEventListener('click', () => {
        document.body.removeChild(backdrop);
        resolve(true);
      });

      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
          document.body.removeChild(backdrop);
          document.removeEventListener('keydown', escHandler);
          resolve(false);
        }
      });
    } catch (error) {
      console.error("Erro ao exibir diálogo de confirmação:", error);
      const confirmed = window.confirm(message);
      resolve(confirmed);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".popup__container").forEach(container => {
    if (container.id) {
      container.querySelectorAll(".footer__popup button, button.close-popup").forEach(btn => {
        btn.addEventListener("click", () => closePopup(container.id));
      });
    }
  });
});
