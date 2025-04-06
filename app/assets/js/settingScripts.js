// Alternar entre seções
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    // Remover classe active de todos os itens e seções
    document
      .querySelectorAll(".nav-item")
      .forEach((nav) => nav.classList.remove("active"));
    document
      .querySelectorAll(".section")
      .forEach((section) => section.classList.remove("active"));

    // Adicionar classe active ao item clicado e à seção correspondente
    item.classList.add("active");
    const sectionId = item.getAttribute("data-section");
    document.getElementById(sectionId).classList.add("active");
  });
});

// Processar formulário de perfil
document.getElementById("form-perfil").addEventListener("submit", function (e) {
  e.preventDefault();
  const nome = document.getElementById("nome").value;
  const bio = document.getElementById("bio").value;
  localStorage.setItem("nome", nome);
  localStorage.setItem("bio", bio);
  showPopup("success", "Perfil salvo com sucesso!");
});

// Processar formulário de conta
document.getElementById("form-conta").addEventListener("submit", function (e) {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const senhaAtual = document.getElementById("senha-atual").value;
  const novaSenha = document.getElementById("nova-senha").value;

  if (!novaSenha) {
    showPopup("success", "Email atualizado com sucesso!");
  } else if (senhaAtual === novaSenha) {
    showPopup("error", "A nova senha deve ser diferente da atual.");
  } else {
    showPopup("success", "Conta atualizada com sucesso!");
  }
});

// Processar formulário de privacidade
document
  .getElementById("form-privacidade")
  .addEventListener("submit", function (e) {
    e.preventDefault();
    const visibilidade = document.getElementById("visibilidade").value;
    localStorage.setItem("visibilidade", visibilidade);
    showPopup("success", "Configurações de privacidade salvas com sucesso!");
  });

document.addEventListener("DOMContentLoaded", function () {
  const forms = document.querySelectorAll("form");
  forms.forEach((form) => {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      showPopup("success", "Configurações salvas com sucesso!");
    });
  });

  const deleteBtn = document.querySelector(".delete-account");
  deleteBtn.addEventListener("click", function () {
    showPopup("success", "Conta excluída com sucesso!");
  });

  const navItems = document.querySelectorAll(".nav-item");
  const mainContent = document.querySelector(".main-content");

  navItems.forEach((item) => {
    item.addEventListener("click", function () {
      const sectionId = item.getAttribute("data-section");
      document.querySelectorAll(".section").forEach((sec) => {
        sec.classList.remove("active");
      });
      document.getElementById(sectionId).classList.add("active");

      navItems.forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");

      if (window.innerWidth <= 480) {
        mainContent.classList.add("active");
      }
    });
  });

  const closeBtns = document.querySelectorAll(".close-popup-btn");
  closeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.innerWidth <= 480) {
        document.querySelector(".main-content").classList.remove("active");
      }
    });
  });
});
