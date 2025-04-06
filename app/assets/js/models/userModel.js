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
    console.error("Erro ao sincronizar com o Firestore:", error);
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
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const userData = await fetchUserData(user.uid);

    localStorage.setItem("userData", JSON.stringify(userData));
    return { ...user, ...userData };
  } catch (error) {
    throw new Error("Erro ao fazer login: " + error.message);
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
    throw new Error("Erro ao fazer login com Google: " + error.message);
  }
}

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

    localStorage.setItem("userData", JSON.stringify(userData));
    await syncWithFirestore(userData);

    return userData;
  } catch (error) {
    throw new Error("Erro ao cadastrar: " + error.message);
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
    localStorage.removeItem("userData");
  } catch (error) {
    throw new Error("Erro ao fazer logout: " + error.message);
  }
}

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