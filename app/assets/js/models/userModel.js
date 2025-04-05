import { auth, firestore as db } from "../firebaseConfig.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Função para lidar com o primeiro login
async function handleFirstLogin(user) {
  const docRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    const userData = {
      uid: user.uid,
      email: user.email,
      name: user.displayName || "Usuário",
      gender: "não especificado", // Gênero padrão
      userType: "paciente", // Tipo de usuário padrão = paciente
      createdAt: new Date(),
    };

    // Armazena os dados localmente
    localStorage.setItem("userData", JSON.stringify(userData));

    // Sincroniza com o Firestore em segundo plano
    await syncWithFirestore(userData);
  }
}

// Função para sincronizar com o Firestore
async function syncWithFirestore(userData) {
  try {
    await setDoc(doc(db, "users", userData.uid), userData);
    console.log("Dados sincronizados com o Firestore.");
  } catch (error) {
    console.error("Erro ao sincronizar com o Firestore:", error);
  }
}

// Monitora mudanças na autenticação
export function subscribeToAuthChanges(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await handleFirstLogin(user); // Verifica se é o primeiro login
      const userData = await fetchUserData(user.uid);
      callback({ ...user, ...userData });
    } else {
      callback(null);
    }
  });
}

// Login com e-mail e senha
export async function loginWithEmailAndPassword(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const userData = await fetchUserData(user.uid);

    // Armazena os dados localmente
    localStorage.setItem("userData", JSON.stringify(userData));

    return { ...user, ...userData };
  } catch (error) {
    throw new Error("Erro ao fazer login: " + error.message);
  }
}

// Login com Google
export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;
    const userData = await fetchUserData(user.uid);

    // Armazena os dados localmente
    localStorage.setItem("userData", JSON.stringify(userData));

    return { ...user, ...userData };
  } catch (error) {
    throw new Error("Erro ao fazer login com Google: " + error.message);
  }
}

// Cadastro com e-mail e senha
export async function signupWithEmailAndPassword(email, password, userType, userGender, userName) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userData = {
      uid: user.uid,
      email: user.email,
      userType: userType,
      gender: userGender,
      name: userName,
      createdAt: new Date(),
    };

    // Armazena os dados localmente
    localStorage.setItem("userData", JSON.stringify(userData));

    // Sincroniza com o Firestore em segundo plano
    await syncWithFirestore(userData);

    return userData;
  } catch (error) {
    throw new Error("Erro ao cadastrar: " + error.message);
  }
}

// Logout
export async function signOutUser() {
  try {
    await signOut(auth);
    // Remove os dados locais ao fazer logout
    localStorage.removeItem("userData");
  } catch (error) {
    throw new Error("Erro ao fazer logout: " + error.message);
  }
}

// Busca dados do usuário no Firestore
async function fetchUserData(uid) {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : {};
  } catch (error) {
    console.error("Erro ao buscar dados do usuário:", error);
    return {};
  }
}