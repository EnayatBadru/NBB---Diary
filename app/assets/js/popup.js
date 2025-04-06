function showPopup(type, message) {
    document.querySelectorAll('.popup__container.active, .popup__container.closing').forEach(el => {
      el.classList.remove('active', 'closing');
    });
  
    const container = document.getElementById(type);
    container.querySelector('.mensagens').textContent = message;
    void container.offsetWidth; // Reinicia animação
    container.classList.add('active');
  }
  
  function closePopup(type) {
    const container = document.getElementById(type);
    container.classList.remove('active');
    container.classList.add('closing');
    container.addEventListener('animationend', () => {
      container.classList.remove('closing');
    }, { once: true });
  }