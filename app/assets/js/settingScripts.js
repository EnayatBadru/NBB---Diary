document.addEventListener("DOMContentLoaded", () => {
    const setting = document.querySelector(".containerSettingMenu");
    const main = document.querySelector("#containerMain");
    const cross = document.querySelector("#closeMenu");
    const menuButtons = document.querySelectorAll("#menu li button.list");
  
    const sections = {
      perfil: document.getElementById("mainPerfil"),
      conta: document.getElementById("mainConta")
    };
  
    // Remove a classe "active" de todos os botões e seções
    const clearActive = () => {
      Object.values(sections).forEach(s => s.classList.remove("active"));
      menuButtons.forEach(btn => btn.classList.remove("active"));
    };
  
    // Remove a classe "active" dos containers (mobile)
    const clearMobileActive = () => {
      setting.classList.remove("active");
      main.classList.remove("active");
    };
  
    // Ativa a seção conforme o texto do botão
    const activateSection = (text) => {
      if (text === "perfil" && sections.perfil) {
        sections.perfil.classList.add("active");
      } else if (text === "conta" && sections.conta) {
        sections.conta.classList.add("active");
      }
    };
  
    // Ativa o primeiro botão e sua seção (desktop)
    const setDefaultActive = () => {
      clearActive();
      const firstButton = menuButtons[0];
      if (firstButton) {
        firstButton.classList.add("active");
        activateSection(firstButton.textContent.trim().toLowerCase());
      }
    };
  
    // Verifica o tamanho da tela e aplica a lógica adequada
    const handleResize = () => {
      if (window.innerWidth <= 600) {
        clearActive();
        clearMobileActive();
      } else {
        setDefaultActive();
      }
    };
  
    window.addEventListener("resize", handleResize);
    handleResize();
  
    // Adiciona os listeners para os botões do menu
    menuButtons.forEach(button => {
      button.addEventListener("click", () => {
        const text = button.textContent.trim().toLowerCase();
        clearActive();
        button.classList.add("active");
        activateSection(text);
        if (window.innerWidth <= 600) {
          setting.classList.add("active");
          main.classList.add("active");
        }
      });
    });
  
    // Ao clicar no cross, remove "active" de todos os elementos
    cross.addEventListener("click", () => {
      clearActive();
      clearMobileActive();
    });
  });
  