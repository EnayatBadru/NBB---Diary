// settingScripts.js
import { subscribeToAuthChanges } from "../../assets/js/models/userModel.js";
import { auth, firestore, storage } from "../../assets/js/firebaseConfig.js";
import {
  updateDoc,
  doc,
  deleteDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  updateEmail,
  updatePassword,
  deleteUser,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import { showPopup, closePopup } from "../../assets/js/popup.js";

// Usamos o Storage real com CORS configurado, sem emulador

// Função para exibir popup de confirmação com senha
function confirmPopup(message) {
  return new Promise((resolve) => {
    showPopup('alert', message);
    const alertContainer = document.getElementById("alert");
    const inputEl = alertContainer.querySelector("#alertPop");
    const buttons = alertContainer.querySelectorAll("button");
    const confirmBtn = buttons[0]; // "sim"
    const cancelBtn = buttons[1];  // "cancelar"

    const cleanup = () => {
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      closePopup('alert');
      inputEl.value = "";
    };
    const onConfirm = () => {
      const password = inputEl.value.trim();
      if (!password) {
        showPopup('error', "A senha é necessária para confirmar.");
        return;
      }
      cleanup();
      resolve(password);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  /* Elementos de Layout */
  const setting = document.querySelector(".containerSettingMenu");
  const main = document.querySelector("#containerMain");
  const cross = document.getElementById("closeMenu");
  const backButton = document.getElementById("backIndex");
  const menuButtons = document.querySelectorAll("#menu li button.list");

  /* Elementos do Header (perfil) */
  const profileImgEl = document.querySelector(".imgProfile img");
  const userNameEl = document.querySelector(".textProfile .userName");
  const userEmailEl = document.querySelector(".textProfile .userEmail");

  /* Input para alterar foto de perfil */
  const profilePhotoInput = document.getElementById("profilePhoto");

  /* Dispara o seletor de arquivo ao clicar na foto */
  const imgProfileBtn = document.querySelector(".imgProfile");
  imgProfileBtn.addEventListener("click", () => profilePhotoInput.click());

  /* Seções do conteúdo */
  const sections = {
    perfil: document.getElementById("mainPerfil"),
    conta: document.getElementById("mainConta")
  };

  /* Formulários e Botões */
  const perfilForm = document.querySelector("#mainPerfil form");
  const contaForm = document.querySelector("#mainConta form");
  const contaSaveBtn = contaForm?.querySelector("button:not(.deliteAccount)");
  const deleteAccountBtn = contaForm?.querySelector("button.deliteAccount");

  /* Funções de layout */
  const clearActive = () => {
    Object.values(sections).forEach(s => s.classList.remove("active"));
    menuButtons.forEach(btn => btn.classList.remove("active"));
  };

  const clearMobileActive = () => {
    setting.classList.remove("active");
    main.classList.remove("active");
  };

  const activateSection = (text) => {
    if (text === "perfil") sections.perfil.classList.add("active");
    else if (text === "conta") sections.conta.classList.add("active");
  };

  const setDefaultActive = () => {
    clearActive();
    const firstButton = menuButtons[0];
    firstButton.classList.add("active");
    activateSection(firstButton.textContent.trim().toLowerCase());
  };

//   const handleResize = () => {
//     if (window.innerWidth <= 600) {
//       clearActive();
//       clearMobileActive();
//     } else {
//       setDefaultActive();
//     }
//   };

  window.addEventListener("resize", handleResize);
  handleResize();

  menuButtons.forEach(button => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = button.textContent.trim().toLowerCase();
      clearActive();
      button.classList.add("active");
      activateSection(text);
      if (window.innerWidth <= 600) {
        setting.classList.add("active");
        main.classList.add("active");
      }
    });
  });

  cross.addEventListener("click", () => {
    clearActive();
    clearMobileActive();
  });

  backButton.addEventListener("click", () => {
    window.location.href = "./index.html";
  });

  /* Preenche os dados do usuário */
  const fillUserData = async (user) => {
    if (user) {
      const userDoc = await getDoc(doc(firestore, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        document.getElementById("userName").value = userData.name || "";
        document.getElementById("userBio").value = userData.bio || "";
        const generoSelect = document.getElementById("userGenero");
        generoSelect.value = userData.gender || "";
        generoSelect.disabled = false; // Sempre editável
        const userTypeSelect = document.getElementById("userType");
        userTypeSelect.value = userData.userType || "";
        userTypeSelect.disabled = !!userData.userType; // Desabilitado se já definido
      }
    }
  };

  /* Atualiza o header dinamicamente */
  const updateHeaderProfile = (user) => {
    if (user) {
      localStorage.setItem("userData", JSON.stringify(user));
      profileImgEl.src = user.photoURL || "../../assets/img/icons/user.png";
      userNameEl.textContent = user.name || user.displayName || "Usuário";
      userEmailEl.textContent = user.email;
      const emailInput = document.getElementById("emailUser");
      if (emailInput) emailInput.value = user.email;
      fillUserData(user);
    } else {
      profileImgEl.src = "../../assets/img/icons/user.png";
      userNameEl.textContent = "";
      userEmailEl.textContent = "";
    }
  };

  subscribeToAuthChanges((user) => {
    if (user) updateHeaderProfile(user);
  });

  /* Upload da foto de perfil */
  profilePhotoInput.addEventListener("change", async () => {
    const file = profilePhotoInput.files[0];
    if (!file || !file.type.startsWith("image/")) {
      showPopup('error', "Selecione uma imagem válida.");
      return;
    }
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuário não autenticado.");
      const storageRef = ref(storage, `profilePhotos/${currentUser.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);

      await updateProfile(currentUser, { photoURL });
      const userDoc = doc(firestore, "users", currentUser.uid);
      await updateDoc(userDoc, { photoURL, updatedAt: new Date() });

      // Atualiza a interface dinamicamente
      profileImgEl.src = photoURL;
      const updatedUser = { ...JSON.parse(localStorage.getItem("userData")), photoURL };
      localStorage.setItem("userData", JSON.stringify(updatedUser));

      showPopup('success', "Foto de perfil atualizada!");
    } catch (error) {
      console.error("Erro ao atualizar foto:", error.message);
      showPopup('error', "Erro ao atualizar foto de perfil.");
    }
  });

  /* Atualização do perfil */
  perfilForm?.querySelector("button[type='button']").addEventListener("click", async (e) => {
    e.preventDefault();
    const userName = perfilForm.querySelector("#userName").value.trim();
    const userBio = perfilForm.querySelector("#userBio").value.trim();
    const userGenero = perfilForm.querySelector("#userGenero").value;
    const userType = perfilForm.querySelector("#userType").value;

    if (!userName) {
      showPopup('error', "O nome é obrigatório.");
      return;
    }
    if (userBio.length > 250) {
      showPopup('error', "A bio não pode exceder 250 caracteres.");
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuário não autenticado.");
      await updateProfile(currentUser, { displayName: userName });
      const userDoc = doc(firestore, "users", currentUser.uid);
      const updateData = {
        name: userName,
        bio: userBio,
        gender: userGenero, // Sempre atualiza o gênero
        updatedAt: new Date()
      };
      if (userType && ["paciente", "psicologo"].includes(userType)) {
        updateData.userType = userType;
      }
      await updateDoc(userDoc, updateData);

      // Atualiza a interface dinamicamente
      userNameEl.textContent = userName;
      const updatedUser = { ...JSON.parse(localStorage.getItem("userData")), name: userName };
      localStorage.setItem("userData", JSON.stringify(updatedUser));

      showPopup('success', "Perfil atualizado!");
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error.message);
      showPopup('error', "Erro ao atualizar perfil.");
    }
  });

  /* Atualização da conta */
  contaSaveBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuário não autenticado.");
      const email = currentUser.email;
      const oldPassword = contaForm.querySelector("#passwordUser").value;
      const newPassword = contaForm.querySelector("#newPassword").value;

      if (newPassword) {
        if (!oldPassword) throw new Error("Informe a senha atual.");
        if (newPassword.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
        const credential = EmailAuthProvider.credential(email, oldPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
      }
      const userDoc = doc(firestore, "users", currentUser.uid);
      await updateDoc(userDoc, { updatedAt: new Date() });
      showPopup('success', "Conta atualizada!");
    } catch (error) {
      console.error("Erro ao atualizar conta:", error.message);
      showPopup('error', error.code === 'auth/wrong-password' ? "Senha incorreta." : error.message);
    }
  });

  /* Exclusão de conta */
  deleteAccountBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const password = await confirmPopup("Tem certeza que deseja excluir sua conta?");
    if (password) {
      try {
        const currentUser = auth.currentUser;
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        const userDoc = doc(firestore, "users", currentUser.uid);
        await deleteDoc(userDoc);
        await deleteUser(currentUser);
        showPopup('success', "Conta excluída!");
        window.location.href = "../splash.html";
      } catch (error) {
        console.error("Erro ao excluir conta:", error.message);
        showPopup('error', error.code === 'auth/wrong-password' ? "Senha incorreta." : "Erro ao excluir conta.");
      }
    }
  });

  /* Logout */
  const logoutBtn = document.querySelector("#menu button.logOut");
  logoutBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await auth.signOut();
      showPopup('success', "Logout realizado!");
      window.location.href = "../splash.html";
    } catch (error) {
      console.error("Erro ao fazer logout:", error.message);
      showPopup('error', "Erro ao fazer logout.");
    }
  });
});