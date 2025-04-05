import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

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

let app, auth, firestore;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app);
  console.log("Firebase inicializado com sucesso!");
} catch (error) {
  console.error("Erro ao inicializar o Firebase:", error);
  alert("Erro ao inicializar a aplicação. Por favor, recarregue a página.");
}

export { auth, firestore };
