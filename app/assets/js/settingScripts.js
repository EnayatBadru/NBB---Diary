// settingScripts.js
import { subscribeToAuthChanges } from "../../assets/js/models/userModel.js";
import { auth, firestore, storage } from "../../assets/js/firebaseConfig.js"; // 'storage' já estava incluído
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
  getDownloadURL, 
  connectStorageEmulator 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js"; // Adicionado 'connectStorageEmulator'
// Importa as funções de popup
import { showPopup, closePopup } from "../../assets/js/popup.js";

// Conectar ao emulador do Storage se estiver rodando localmente
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  connectStorageEmulator(storage, "127.0.0.1", 9199); // Porta padrão do emulador de Storage
}

/**
 * Exibe um popup de confirmação (do tipo "alert") com dois botões: "sim" e "cancelar".
 * Retorna uma Promise que resolve com a senha inserida no input #alertPop se confirmado, ou null se cancelado.
 * @param {string} message 
 * @returns {Promise<string|null>}
 */
function confirmPopup(message) {
  return new Promise((resolve) => {
    try {
      showPopup('alert', message);
      const alertContainer = document.getElementById("alert");
      if (!alertContainer) {
        console.error('Popup de alerta (id "alert") não encontrado.');
        resolve(null);
        return;
      }
      const inputEl = alertContainer.querySelector("#alertPop");
      if (!inputEl) {
        console.error('Input de confirmação não encontrado no popup de alerta.');
        resolve(null);
        return;
      }
      const buttons = alertContainer.querySelectorAll("button");
      if (buttons.length < 2) {
        console.error('Botões de confirmação ou cancelamento não encontrados no popup de alerta.');
        resolve(null);
        return;
      }
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
    } catch (err) {
      console.error("Erro no confirmPopup:", err);
      resolve(null);
    }
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

  /* Elemento para alteração da foto de perfil (input file) */
  const profilePhotoInput = document.getElementById("profilePhoto");

  /* Dispara o seletor de arquivo ao clicar na foto de perfil */
  const imgProfileBtn = document.querySelector(".imgProfile");
  if (imgProfileBtn && profilePhotoInput) {
    imgProfileBtn.addEventListener("click", () => {
      profilePhotoInput.click();
    });
  }

  /* Seções do conteúdo */
  const sections = {
    perfil: document.getElementById("mainPerfil"),
    conta: document.getElementById("mainConta")
  };

  /* Formulários e Botões de Ação */
  const perfilForm = document.querySelector("#mainPerfil form");
  const contaForm = document.querySelector("#mainConta form");
  const contaSaveBtn = contaForm?.querySelector("button:not(.deliteAccount)");
  const deleteAccountBtn = contaForm?.querySelector("button.deliteAccount");

  /* FUNÇÕES AUXILIARES DE LAYOUT */
  const clearActive = () => {
    Object.values(sections).forEach(s => s.classList.remove("active"));
    menuButtons.forEach(btn => btn.classList.remove("active"));
  };

  const clearMobileActive = () => {
    setting.classList.remove("active");
    main.classList.remove("active");
  };

  const activateSection = (text) => {
    if (text === "perfil" && sections.perfil) {
      sections.perfil.classList.add("active");
    } else if (text === "conta" && sections.conta) {
      sections.conta.classList.add("active");
    }
  };

  const setDefaultActive = () => {
    clearActive();
    const firstButton = menuButtons[0];
    if (firstButton) {
      firstButton.classList.add("active");
      activateSection(firstButton.textContent.trim().toLowerCase());
    }
  };

  const handleResize = () => {
    if (window.innerWidth <= 600) {
      clearActive();
      clearMobileActive();
    } else {
      setDefaultActive();
    }
  };

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

  cross.addEventListener("click", (e) => {
    e.stopPropagation();
    clearActive();
    clearMobileActive();
  });

  backButton.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.href = "./index.html";
  });

  /* FUNÇÃO PARA BUSCAR E PREENCHER DADOS DO USUÁRIO */
  const fillUserData = async (user) => {
    if (user) {
      const userDoc = await getDoc(doc(firestore, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        document.getElementById("userName").value = userData.name || "";
        document.getElementById("userBio").value = userData.bio || "";
        const generoSelect = document.getElementById("userGenero");
        if (userData.gender && ["masculino", "feminino"].includes(userData.gender)) {
          generoSelect.value = userData.gender;
          generoSelect.disabled = true;
        } else {
          generoSelect.value = "";
          generoSelect.disabled = false;
        }
        const userTypeSelect = document.getElementById("userType");
        if (userData.userType && ["paciente", "psicologo"].includes(userData.userType)) {
          userTypeSelect.value = userData.userType;
          userTypeSelect.disabled = true;
        } else {
          userTypeSelect.value = "";
          userTypeSelect.disabled = false;
        }
      }
    }
  };

  /* ATUALIZAÇÃO DINÂMICA DO HEADER E PREENCHE CAMPOS DE CONTA */
  const updateHeaderProfile = (user) => {
    if (user) {
      localStorage.setItem("userData", JSON.stringify(user));
      profileImgEl.src = user.photoURL || "../../assets/img/icons/user.png";
      userNameEl.textContent = user.name || user.displayName || "Usuário";
      userEmailEl.textContent = user.email;
      const emailInput = document.getElementById("emailUser");
      if (emailInput) {
        emailInput.value = user.email || "";
        emailInput.disabled = true;
      }
      fillUserData(user);
    } else {
      profileImgEl.src = "../../assets/img/icons/user.png";
      userNameEl.textContent = "";
      userEmailEl.textContent = "";
      const emailInput = document.getElementById("emailUser");
      if (emailInput) {
        emailInput.value = "";
      }
    }
  };

  subscribeToAuthChanges((user) => {
    if (user) {
      updateHeaderProfile(user);
    } else {
      profileImgEl.src = "../../assets/img/icons/user.png";
      userNameEl.textContent = "";
      userEmailEl.textContent = "";
      const emailInput = document.getElementById("emailUser");
      if (emailInput) {
        emailInput.value = "";
      }
    }
  });

  /* ALTERAÇÃO DA IMAGEM DE PERFIL */
  if (profilePhotoInput) {
    profilePhotoInput.addEventListener("change", async () => {
      const file = profilePhotoInput.files[0];
      if (file) {
        if (!file.type.startsWith("image/")) {
          showPopup('error', "Por favor, selecione uma imagem válida.");
          return;
        }
        try {
          const currentUser = auth.currentUser;
          if (!currentUser) throw new Error("Usuário não autenticado.");

          // Cria uma referência para o local onde a imagem será armazenada no Storage
          const storageRef = ref(storage, `profilePhotos/${currentUser.uid}/${file.name}`);

          // Faz upload da imagem
          await uploadBytes(storageRef, file);

          // Obtém a URL de download da imagem
          const photoURL = await getDownloadURL(storageRef);

          // Atualiza o perfil do usuário no Firebase Auth
          await updateProfile(currentUser, { photoURL });

          // Atualiza o Firestore com a URL da imagem
          const userDoc = doc(firestore, "users", currentUser.uid);
          await updateDoc(userDoc, { photoURL, updatedAt: new Date() });

          // Atualiza a imagem no header
          profileImgEl.src = photoURL;

          // Atualiza localStorage
          const updatedUser = { ...JSON.parse(localStorage.getItem("userData")), photoURL };
          localStorage.setItem("userData", JSON.stringify(updatedUser));

          showPopup('success', "Foto de perfil atualizada com sucesso!");
        } catch (error) {
          console.error("Erro ao atualizar foto de perfil:", error.message);
          showPopup('error', "Erro ao atualizar foto de perfil. Tente novamente.");
        }
      }
    });
  }

  /* ATUALIZAÇÃO DO PERFIL - Formulário de Perfil */
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
      if (currentUser) {
        await updateProfile(currentUser, { displayName: userName });
        const userDoc = doc(firestore, "users", currentUser.uid);
        const userDocData = await getDoc(userDoc);
        const existingData = userDocData.data() || {};
        const updateData = {
          name: userName,
          bio: userBio,
          updatedAt: new Date()
        };
        if (!existingData.gender && userGenero && ["masculino", "feminino"].includes(userGenero)) {
          updateData.gender = userGenero;
        }
        if (!existingData.userType && userType && ["paciente", "psicologo"].includes(userType)) {
          updateData.userType = userType;
        }
        await updateDoc(userDoc, updateData);
        const updatedUser = { ...JSON.parse(localStorage.getItem("userData")), name: userName };
        localStorage.setItem("userData", JSON.stringify(updatedUser));
        showPopup('success', "Perfil atualizado com sucesso!");
        fillUserData(currentUser);
      }
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error.message);
      showPopup('error', "Erro ao atualizar perfil. Tente novamente.");
    }
  });

  /* ATUALIZAÇÃO DA CONTA - Formulário de Conta */
  contaSaveBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuário não autenticado.");
      const email = currentUser.email;
      const oldPassword = contaForm.querySelector("#passwordUser").value;
      const newPassword = contaForm.querySelector("#newPassword").value;

      if (newPassword) {
        if (!oldPassword) {
          throw new Error("Informe sua senha atual para atualizar a senha.");
        }
        if (newPassword.length < 6) {
          throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
        }
        const credential = EmailAuthProvider.credential(email, oldPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
      }
      const userDoc = doc(firestore, "users", currentUser.uid);
      await updateDoc(userDoc, { updatedAt: new Date() });
      showPopup('success', "Dados da conta atualizados com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar dados da conta:", error.message);
      showPopup('error', error.code === 'auth/wrong-password' ? "Senha incorreta." : error.message);
    }
  });

  /* EXCLUSÃO DE CONTA */
  deleteAccountBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const password = await confirmPopup("Tem certeza que deseja excluir sua conta? Essa ação não pode ser desfeita.");
      if (password) {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const credential = EmailAuthProvider.credential(currentUser.email, password);
          await reauthenticateWithCredential(currentUser, credential);
          const userDoc = doc(firestore, "users", currentUser.uid);
          await deleteDoc(userDoc);
          await deleteUser(currentUser);
          showPopup('success', "Conta excluída com sucesso!");
          window.location.href = "../splash.html";
        }
      }
    } catch (error) {
      console.error("Erro ao excluir conta:", error.message);
      if (error.code === 'auth/requires-recent-login') {
        showPopup('error', "Por favor, faça login novamente para excluir a conta.");
      } else if (error.code === 'auth/wrong-password') {
        showPopup('error', "Senha incorreta. Tente novamente.");
      } else {
        showPopup('error', "Erro ao excluir a conta: " + error.message);
      }
    }
  });

  /* BOTÃO SAIR (LOGOUT) */
  const logoutBtn = document.querySelector("#menu button.logOut");
  logoutBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await auth.signOut();
      showPopup('success', "Logout realizado com sucesso!");
      window.location.href = "../splash.html";
    } catch (error) {
      console.error("Erro ao fazer logout:", error.message);
      showPopup('error', "Erro ao fazer logout: " + error.message);
    }
  });
});