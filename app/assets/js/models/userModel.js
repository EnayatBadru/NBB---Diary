// userModel.js
import { auth, firestore as db, realtimeDb } from "../firebaseConfig.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { 
  doc,
  getDoc, 
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { 
  ref, 
  set, 
  onDisconnect 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
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
      updatedAt: new Date(),
      isOnline: true,
      lastActive: serverTimestamp()
    };

    localStorage.setItem("userData", JSON.stringify(userData));
    await syncWithFirestore(userData);
    await updateOnlineStatus(user.uid, true);
  } else {
    await updateOnlineStatus(user.uid, true);
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

/**
 * Atualiza o status online do usuário no Firestore e Realtime Database
 */
export async function updateOnlineStatus(userId, isOnline) {
  try {
    if (!userId) return;
    const userDoc = doc(db, "users", userId);
    await updateDoc(userDoc, {
      isOnline: isOnline,
      lastActive: serverTimestamp()
    });
    const presenceRef = ref(realtimeDb, `presence/${userId}`);
    const statusData = {
      status: isOnline ? 'online' : 'offline',
      lastActive: Date.now()
    };
    await set(presenceRef, statusData);
    if (isOnline) {
      onDisconnect(presenceRef).set({
        status: 'offline',
        lastActive: Date.now()
      });
    }
  } catch (error) {
    console.error("Erro ao atualizar status online:", error);
  }
}

export function subscribeToAuthChanges(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await handleFirstLogin(user);
      const userData = await fetchUserData(user.uid);
      window.addEventListener('beforeunload', () => {
        updateOnlineStatus(user.uid, false);
      });
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
    await updateOnlineStatus(user.uid, true);
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
    await updateOnlineStatus(user.uid, true);
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
      updatedAt: new Date(),
      isOnline: true,
      lastActive: serverTimestamp()
    };

    localStorage.setItem("userData", JSON.stringify(userData));
    await syncWithFirestore(userData);
    await updateOnlineStatus(user.uid, true);
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
    const user = auth.currentUser;
    if (user) {
      await updateOnlineStatus(user.uid, false);
    }
    await signOut(auth);
    localStorage.removeItem("userData");
  } catch (error) {
    console.error("Erro ao fazer logout:", error.message);
    showPopup("error", "Erro ao fazer logout. Tente novamente.");
    throw error;
  }
}

export async function fetchUserData(uid) {
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

/**
 * Busca todos os usuários disponíveis para chat
 */
export async function getAllUsers(currentUserId, searchTerm = '') {
  try {
    const usersRef = collection(db, "users");
    let userQuery;
    
    if (searchTerm) {
      userQuery = query(usersRef, 
        where("name", ">=", searchTerm), 
        where("name", "<=", searchTerm + '\uf8ff'),
        limit(20));
    } else {
      userQuery = query(usersRef, limit(50));
    }
    
    const querySnapshot = await getDocs(userQuery);
    const users = [];
    querySnapshot.forEach((doc) => {
      if (doc.id !== currentUserId) {
        const userData = doc.data();
        users.push({
          id: doc.id,
          name: userData.name || userData.displayName || "Usuário",
          email: userData.email || "",
          photoURL: userData.photoURL || "",
          userType: userData.userType || "",
          gender: userData.gender || "",
          isOnline: userData.isOnline || false,
          lastActive: userData.lastActive || null
        });
      }
    });
    return users;
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    showPopup("error", "Erro ao buscar usuários.");
    return [];
  }
}

/**
 * Busca apenas contatos com quem já conversou
 */
export async function getUserContacts(currentUserId) {
  try {
    const conversationsQuery = query(
      collection(db, "conversations"),
      where("participants", "array-contains", currentUserId)
    );
    const convSnapshot = await getDocs(conversationsQuery);
    const contactIds = new Set();
    convSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.participants) {
        data.participants.forEach(participantId => {
          if (participantId !== currentUserId) {
            contactIds.add(participantId);
          }
        });
      }
    });
    const contacts = [];
    for (const contactId of contactIds) {
      const userDoc = await getDoc(doc(db, "users", contactId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        contacts.push({
          id: contactId,
          name: userData.name || userData.displayName || "Usuário",
          email: userData.email || "",
          photoURL: userData.photoURL || "",
          userType: userData.userType || "",
          isOnline: userData.isOnline || false,
          lastActive: userData.lastActive || null
        });
      }
    }
    return contacts;
  } catch (error) {
    console.error("Erro ao buscar contatos:", error);
    return [];
  }
}
