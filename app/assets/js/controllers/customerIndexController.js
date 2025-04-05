import { subscribeToAuthChanges, signOutUser } from "../models/userModel.js";

export function initCustomerIndex() {
  const signOutBtn = document.querySelector(".sign-out");
  if (!signOutBtn) {
    console.error("Botão 'sign-out' não encontrado.");
    return;
  }

  signOutBtn.addEventListener("click", async () => {
    try {
      await signOutUser();
      window.location.href = "../splash.html";
    } catch (error) {
      alert("Erro ao fazer logout: " + error.message);
    }
  });

  // Obter dados do usuário e atualizar a mensagem de boas-vindas
  subscribeToAuthChanges((user) => {
    if (user) {
      const greeting = getGreeting();
      let welcomePronoun;
      if (user.gender === "masculino") {
        welcomePronoun = "bem-vindo";
      } else if (user.gender === "feminino") {
        welcomePronoun = "bem-vinda";
      } else {
        welcomePronoun = "bem-vindo(a)"; // Neutro para "não especificado" (ex.: login com Google)
      }
      const welcomeMessage = `${greeting}, ${user.name || "Usuário"}! Seja ${welcomePronoun} ao NBB - Diary`;

      const welcomeElement = document.querySelector("#welcome .container_welcome");
      if (welcomeElement) {
        welcomeElement.innerHTML = `
          <span class="first">${greeting}</span>
          <span class="second">${user.name || "Usuário"}</span>
          <span class="third">Seja ${welcomePronoun} ao</span>
          <span class="logo">NBB - Diary</span>
        `;
      } else {
        console.error("Elemento '.container_welcome' não encontrado.");
      }
    } else {
      // Redirecionar para a página de login se não houver usuário autenticado
      window.location.href = "../splash.html";
    }
  });
}

// Função para determinar a saudação com base no horário
function getGreeting() {
  const hour = new Date().getHours(); // Usa o fuso horário local do usuário
  if (hour >= 5 && hour < 12) {
    return "Bom dia";
  } else if (hour >= 12 && hour < 18) {
    return "Boa tarde";
  } else {
    return "Boa noite";
  }
}

document.addEventListener("DOMContentLoaded", initCustomerIndex);