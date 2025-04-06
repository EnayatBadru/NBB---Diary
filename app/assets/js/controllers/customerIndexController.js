import { subscribeToAuthChanges, signOutUser } from "../models/userModel.js";
import { showPopup } from "../popup.js";

export function initCustomerIndex() {
  const signOutBtn = document.querySelector(".sign-out");

  signOutBtn?.addEventListener("click", async () => {
    try {
      await signOutUser();
      // showPopup("success", "Logout realizado com sucesso!");
      setTimeout(() => {
        window.location.href = "../splash.html";
      }, 2000);
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      showPopup("error", "Erro ao fazer logout. Tente novamente.");
    }
  });

  loadUserData();

  subscribeToAuthChanges((user) => {
    if (user) {
      updateWelcomeMessage(user);
    } else {
      window.location.href = "../splash.html";
    }
  });
}

function loadUserData() {
  const userData = JSON.parse(localStorage.getItem("userData"));
  if (userData) {
    updateWelcomeMessage(userData);
  }
}

function updateWelcomeMessage(user) {
  const greeting = getGreeting();
  const welcomePronoun = getWelcomePronoun(user.gender);
  const userName = user.name || user.displayName || "Usuário";

  const welcomeElement = document.querySelector("#welcome .container_welcome");
  if (welcomeElement) {
    welcomeElement.innerHTML = `
      <span class="first">${greeting}</span>
      <span class="second">${userName}</span>
      <span class="third">Seja ${welcomePronoun} ao</span>
      <span class="logo">NBB - Diary</span>
    `;
  } else {
    showPopup("error", "Elemento de boas-vindas não encontrado.");
  }
}

function getWelcomePronoun(gender) {
  return {
    masculino: "bem-vindo",
    feminino: "bem-vinda",
  }[gender] || "bem-vindo(a)";
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

document.addEventListener("DOMContentLoaded", initCustomerIndex);
