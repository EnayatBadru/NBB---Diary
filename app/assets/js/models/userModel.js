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
import { showPopup } from "../popup.js";

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password) {
  return password.length >= 8;
}

async function handleFirstLogin(user) {
  const docRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    const userData = {
      uid: user.uid,
      email: user.email,
      name: user.displayName || "Usuário",
      gender: "não especificado",
      userType: "paciente",
      createdAt: new Date(),
    };

    localStorage.setItem("userData", JSON.stringify(userData));
    await syncWithFirestore(userData);
  }
}

async function syncWithFirestore(userData) {
  try {
    await setDoc(doc(db, "users", userData.uid), userData);
  } catch (error) {
    console.error("Erro ao sincronizar com o Firestore:", error.message);
    showPopup("error", "Erro ao salvar dados no servidor.");
  }
}

export function subscribeToAuthChanges(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await handleFirstLogin(user);
      const userData = await fetchUserData(user.uid);
      callback({ ...user, ...userData });
    } else {
      callback(null);
    }
  });
}

export async function loginWithEmailAndPassword(email, password) {
  try {
    if (!isValidEmail(email)) {
      showPopup("error", "Email inválido.");
      return;
    }
    if (!isValidPassword(password)) {
      showPopup("error", "A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const userData = await fetchUserData(user.uid);
    localStorage.setItem("userData", JSON.stringify(userData));

    return { ...user, ...userData };
  } catch (error) {
    console.error("Erro no login:", error.message);
    if (error.code === "auth/user-not-found") {
      showPopup("error", "Usuário não encontrado.");
    } else if (error.code === "auth/wrong-password") {
      showPopup("error", "Senha incorreta.");
    } else {
      showPopup("error", "Erro ao fazer login. Tente novamente.");
    }
    throw error;
  }
}

export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;
    const userData = await fetchUserData(user.uid);
    localStorage.setItem("userData", JSON.stringify(userData));
    return { ...user, ...userData };
  } catch (error) {
    console.error("Erro no login com Google:", error.message);
    showPopup("error", "Erro ao fazer login com Google.");
    throw error;
  }
}

export async function signupWithEmailAndPassword(email, password, userType, userGender, userName) {
  try {
    if (!isValidEmail(email)) {
      showPopup("error", "Email inválido.");
      return;
    }
    if (!isValidPassword(password)) {
      showPopup("error", "A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userData = {
      uid: user.uid,
      email: user.email,
      userType,
      gender: userGender,
      name: userName,
      createdAt: new Date(),
    };

    localStorage.setItem("userData", JSON.stringify(userData));
    await syncWithFirestore(userData);

    return userData;
  } catch (error) {
    console.error("Erro no cadastro:", error.message);
    if (error.code === "auth/email-already-in-use") {
      showPopup("error", "Este email já está em uso.");
    } else if (error.code === "auth/weak-password") {
      showPopup("error", "A senha é muito fraca.");
    } else {
      showPopup("error", "Erro ao cadastrar. Tente novamente.");
    }
    throw error;
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
    localStorage.removeItem("userData");
  } catch (error) {
    console.error("Erro ao fazer logout:", error.message);
    showPopup("error", "Erro ao fazer logout. Tente novamente.");
    throw error;
  }
}

async function fetchUserData(uid) {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : {};
  } catch (error) {
    console.error("Erro ao buscar dados do usuário:", error.message);
    showPopup("error", "Erro ao carregar dados do usuário.");
    return {};
  }
}
