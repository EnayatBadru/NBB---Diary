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
  
  window.addEventListener("load", () => {
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
                window.location.href = "sign/in.html";
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
  