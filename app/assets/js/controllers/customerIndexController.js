import { subscribeToAuthChanges, signOutUser } from "../models/userModel.js";

export function initCustomerIndex() {
  const signOutBtn = document.querySelector(".sign-out");

  // Adiciona evento de logout
  signOutBtn?.addEventListener("click", async () => {
    try {
      await signOutUser();
      window.location.href = "../splash.html";
    } catch (error) {
      alert("Erro ao fazer logout: " + error.message);
    }
  });

  // Carrega os dados do usuário ao inicializar a página
  loadUserData();

  // Monitora mudanças na autenticação
  subscribeToAuthChanges((user) => {
    if (user) {
      updateWelcomeMessage(user); // Atualiza a mensagem de boas-vindas
    } else {
      window.location.href = "../splash.html"; // Redireciona se não houver usuário
    }
  });
}

// Função para carregar os dados do usuário
function loadUserData() {
  const userData = JSON.parse(localStorage.getItem("userData"));
  if (userData) {
    updateWelcomeMessage(userData); // Atualiza a interface com os dados
  }
}

// Atualiza a mensagem de boas-vindas com os dados do usuário
function updateWelcomeMessage(user) {
  const greeting = getGreeting();
  const welcomePronoun = getWelcomePronoun(user.gender);
  const userName = user.name || user.displayName || "Usuário"; // Usa o nome do Firestore ou do Google

  const welcomeElement = document.querySelector("#welcome .container_welcome");
  if (welcomeElement) {
    welcomeElement.innerHTML = `
      <span class="first">${greeting}</span>
      <span class="second">${userName}</span>
      <span class="third">Seja ${welcomePronoun} ao</span>
      <span class="logo">NBB - Diary</span>
    `;
  }
}

// Determina o pronome de boas-vindas com base no gênero
function getWelcomePronoun(gender) {
  return {
    masculino: "bem-vindo",
    feminino: "bem-vinda",
  }[gender] || "bem-vindo(a)"; // Padrão neutro
}

// Determina a saudação com base no horário
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

// Inicializa o controlador quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", initCustomerIndex);