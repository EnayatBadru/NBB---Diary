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

export function subscribeToAuthChanges(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userData = await fetchUserData(user.uid);
      callback({ ...user, ...userData });
    } else {
      callback(null);
    }
  });
}

export async function loginWithEmailAndPassword(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  const userData = await fetchUserData(user.uid);
  return { ...user, ...userData };
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  const userCredential = await signInWithPopup(auth, provider);
  const user = userCredential.user;
  const userData = await fetchUserData(user.uid);
  return { ...user, ...userData };
}

export async function signupWithEmailAndPassword(email, password, userType, userGender, userName) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email,
    userType: userType,
    gender: userGender,
    name: userName,
    createdAt: new Date(),
  });
  return { ...user, userType, gender: userGender, name: userName };
}

export async function signOutUser() {
  await signOut(auth);
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