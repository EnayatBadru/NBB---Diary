// Configurações do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAbKVhAbVOuzlPXpfYlCl8lRyXbxOeJqZE",
  authDomain: "ndd-diary-2f5d6.firebaseapp.com",
  projectId: "ndd-diary-2f5d6",
  storageBucket: "ndd-diary-2f5d6.firebasestorage.app",
  messagingSenderId: "582152839503",
  appId: "1:582152839503:web:67f06b4aaee3041cdd253a",
  measurementId: "G-H783JCC73Q",
};

try {
  // Inicializa o Firebase
  firebase.initializeApp(firebaseConfig);
  console.log("Firebase inicializado com sucesso!");
} catch (error) {
  console.error("Erro ao inicializar o Firebase:", error);
  alert("Erro ao inicializar a aplicação. Por favor, tente novamente mais tarde.");
}

// Array de taglines
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
  // Seleciona uma tagline aleatória
  const randomIndex = Math.floor(Math.random() * taglines.length);
  const randomTagline = taglines[randomIndex];

  // Atualiza o texto do parágrafo com a classe "tagline"
  const taglineElement = document.querySelector(".tagline");
  if (taglineElement) {
      taglineElement.textContent = randomTagline;
  } else {
      console.error("Elemento com classe 'tagline' não encontrado.");
  }

  // Define a duração total da splash (em milissegundos)
  const splashDuration = 5000; // 5 segundos

  // Aguarda a verificação do estado de autenticação
  try {
      firebase.auth().onAuthStateChanged((user) => {
          setTimeout(() => {
              const container = document.querySelector(".container-splash");
              if (!container) {
                  console.error("Container de splash não encontrado.");
                  return;
              }
              container.classList.add("fade-out");

              // Após o fade-out, redireciona conforme o estado de autenticação
              setTimeout(() => {
                  try {
                      if (user) {
                          window.location.href = "customer/index.html";
                      } else {
                          window.location.href = "dashboard.html";
                      }
                  } catch (redirectionError) {
                      console.error("Erro ao redirecionar:", redirectionError);
                      alert("Erro ao redirecionar. Por favor, tente novamente.");
                  }
              }, 1000); // Duração do fade-out (1 segundo)
          }, splashDuration);
      });
  } catch (authError) {
      console.error("Erro durante a verificação de autenticação:", authError);
      alert("Erro na autenticação. Por favor, tente novamente mais tarde.");
  }
});