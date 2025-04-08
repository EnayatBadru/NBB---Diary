// settingScripts.js
import { subscribeToAuthChanges } from "../../assets/js/models/userModel.js";
import { auth, firestore } from "../../assets/js/firebaseConfig.js";
import {
  updateDoc,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  updateEmail,
  updatePassword,
  deleteUser,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
// Importa as funções de popup
import { showPopup, closePopup } from "../../assets/js/popup.js";

/**
 * Exibe um popup de confirmação (do tipo "alert") com dois botões: "sim" e "cancelar".
 * Retorna uma Promise que resolve com true se confirmado ou false se cancelado.
 * Certifique-se de que o HTML contenha o popup com id "alert" com dois botões (na ordem: primeiro "sim", segundo "cancelar").
 * @param {string} message 
 * @returns {Promise<boolean>}
 */
function confirmPopup(message) {
  return new Promise((resolve) => {
    try {
      // Exibe o popup de alerta com a mensagem
      showPopup('alert', message);
      const alertContainer = document.getElementById("alert");
      if (!alertContainer) {
        console.error('Popup de alerta (id "alert") não encontrado.');
        resolve(false);
        return;
      }
      // Seleciona os botões pelo seu posicionamento (primeiro para confirmar, segundo para cancelar)
      const buttons = alertContainer.querySelectorAll("button");
      if (buttons.length < 2) {
        console.error('Botões de confirmação ou cancelamento não encontrados no popup de alerta.');
        resolve(false);
        return;
      }
      const confirmBtn = buttons[0]; // "sim"
      const cancelBtn = buttons[1];  // "cancelar"

      // Função para limpar os listeners e fechar o popup
      const cleanup = () => {
        confirmBtn.removeEventListener("click", onConfirm);
        cancelBtn.removeEventListener("click", onCancel);
        // Limpa a mensagem e fecha o popup
        closePopup('alert');
      };
      const onConfirm = () => {
        cleanup();
        resolve(true);
      };
      const onCancel = () => {
        cleanup();
        resolve(false);
      };
      confirmBtn.addEventListener("click", onConfirm);
      cancelBtn.addEventListener("click", onCancel);
    } catch (err) {
      console.error("Erro no confirmPopup:", err);
      resolve(false);
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

  /* ATUALIZAÇÃO DINÂMICA DO HEADER E PREENCHE CAMPOS DE CONTA */
  const updateHeaderProfile = (user) => {
    if (user) {
      // Salva os dados do usuário no localStorage para otimização
      localStorage.setItem("userData", JSON.stringify(user));
      profileImgEl.src = user.photoURL || "../../assets/img/icons/user.png";
      userNameEl.textContent = user.name || user.displayName || "Usuário";
      userEmailEl.textContent = user.email;
      // Preenche o input de email e o desabilita
      const emailInput = document.getElementById("emailUser");
      if (emailInput) {
        emailInput.value = user.email || "";
        emailInput.disabled = true;
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
    profilePhotoInput.addEventListener("change", () => {
      const file = profilePhotoInput.files[0];
      if (file) {
        if (!file.type.startsWith("image/")) {
          showPopup('error', "Por favor, selecione uma imagem válida.");
          return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
          const photoURL = e.target.result; // imagem em base64
          try {
            // Atualiza o perfil do usuário
            await updateProfile(auth.currentUser, { photoURL });
            const userDoc = doc(firestore, "users", auth.currentUser.uid);
            await updateDoc(userDoc, { photoURL, updatedAt: new Date() });
            profileImgEl.src = photoURL;
            // Atualiza localStorage
            const updatedUser = { ...JSON.parse(localStorage.getItem("userData")), photoURL };
            localStorage.setItem("userData", JSON.stringify(updatedUser));
            showPopup('success', "Foto de perfil atualizada com sucesso!");
          } catch (error) {
            console.error("Erro ao atualizar foto de perfil:", error.message);
            showPopup('error', "Erro ao atualizar foto de perfil. Tente novamente.");
          }
        };
        reader.readAsDataURL(file);
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
        // Atualiza displayName no Auth
        await updateProfile(currentUser, { displayName: userName });
        const userDoc = doc(firestore, "users", currentUser.uid);
        await updateDoc(userDoc, {
          name: userName,
          bio: userBio,
          gender: userGenero,
          userType: userType,
          updatedAt: new Date()
        });
        // Atualiza localStorage
        const updatedUser = { ...JSON.parse(localStorage.getItem("userData")), name: userName };
        localStorage.setItem("userData", JSON.stringify(updatedUser));
        showPopup('success', "Perfil atualizado com sucesso!");
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

      // O input de email é desabilitado e não pode ser alterado
      const email = currentUser.email;

      // Para atualização da senha: o usuário deve informar a senha antiga e a nova senha
      const oldPassword = contaForm.querySelector("#passwordUser").value;
      const newPassword = contaForm.querySelector("#newPassword").value;

      if (newPassword) {
        if (!oldPassword) {
          throw new Error("Informe sua senha atual para atualizar a senha.");
        }
        if (newPassword.length < 6) {
          throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
        }
        // Reautentica o usuário utilizando a senha antiga
        const credential = EmailAuthProvider.credential(email, oldPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
      }

      // Atualiza apenas o campo updatedAt no Firestore
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
      const confirmed = await confirmPopup("Tem certeza que deseja excluir sua conta? Essa ação não pode ser desfeita.");
      if (confirmed) {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDoc = doc(firestore, "users", currentUser.uid);
          await deleteDoc(userDoc);
          await deleteUser(currentUser);
          showPopup('success', "Conta excluída com sucesso!");
          window.location.href = "../viewsplash.html";
        }
      }
    } catch (error) {
      console.error("Erro ao excluir conta:", error.message);
      showPopup('error', error.code === 'auth/requires-recent-login' ? "Por favor, faça login novamente para excluir a conta." : error.message);
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