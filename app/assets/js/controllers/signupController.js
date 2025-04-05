import { signupWithEmailAndPassword } from "../models/userModel.js";

export function initSignUp() {
  const signupForm = document.getElementById("signup-form");
  const emailInput = document.getElementById("user");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const userTypeSelect = document.getElementById("user-type");

  if (
    !signupForm ||
    !emailInput ||
    !passwordInput ||
    !confirmPasswordInput ||
    !userTypeSelect
  ) {
    console.error("Elementos do formulário de cadastro não encontrados.");
    return;
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const userType = userTypeSelect.value;

    if (password !== confirmPassword) {
      alert("As senhas não coincidem.");
      return;
    }

    if (!userType) {
      alert("Por favor, selecione o tipo de usuário.");
      return;
    }

    try {
      await signupWithEmailAndPassword(email, password, userType);
      alert(`Cadastro realizado como ${userType}!`);
      window.location.href = "../splash.html";
    } catch (error) {
      console.error("Erro no cadastro:", error);
      alert("Erro ao cadastrar: " + error.message);
    }
  });
}
