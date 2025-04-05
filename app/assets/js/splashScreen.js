import { auth } from "./firebaseConfig.js";

const taglines = [
  "Seu bem-estar emocional ao alcance de um clique.",
  "Cuide da sua saúde mental com apenas um clique.",
  "Acesse ferramentas para seu equilíbrio emocional a qualquer hora.",
  "Seu caminho para a tranquilidade emocional começa aqui.",
  "Bem-estar emocional ao seu alcance, onde quer que esteja.",
  "Transforme sua vida emocional com a facilidade de um clique.",
  "Encontre paz interior e felicidade com nossa plataforma online.",
  "Suporte para sua saúde mental a um toque de distância.",
  "Alcance o bem-estar emocional sem sair de casa.",
  "Conecte-se ao seu equilíbrio emocional instantaneamente.",
  "Sua jornada para uma mente saudável começa com um simples clique.",
  "Descubra o poder do bem-estar emocional online.",
  "A solução para seu equilíbrio emocional está a apenas um clique.",
  "Cuide de si mesmo: bem-estar emocional facilitado pela tecnologia.",
  "Acesse recursos para sua saúde mental quando precisar.",
  "Sinta-se melhor agora, com o suporte emocional ao seu alcance.",
  "Desperte sua paz interior com um simples clique."
];

window.addEventListener("load", () => {
  const taglineElement = document.querySelector(".tagline");
  if (taglineElement) {
    const randomIndex = Math.floor(Math.random() * taglines.length);
    taglineElement.textContent = taglines[randomIndex];
  }

  const splashDuration = 5000;
  auth.onAuthStateChanged((user) => {
    setTimeout(() => {
      const container = document.querySelector(".container-splash");
      if (container) {
        container.classList.add("fade-out");
        setTimeout(() => {
          window.location.href = user ? "customer/index.html" : "dashboard.html";
        }, 1000);
      }
    }, splashDuration);
  });
});