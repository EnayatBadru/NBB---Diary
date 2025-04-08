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
import { showPopup, closePopup } from "../../assets/js/popup.js";

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

  setDefaultActive();

  /* Eventos de Navegação */
  menuButtons.forEach(button => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = button.textContent.trim().toLowerCase();
      clearActive();
      button.classList.add("active");
      activateSection(text);
    });
  });

  cross.addEventListener("click", (e) => {
    e.stopPropagation();
    clearActive();
  });

  backButton.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.href = "./index.html";
  });

  /* FUNÇÃO QUE ATUALIZA O HEADER E PREENCHE OS INPUTS DO FORMULÁRIO
     Se os campos já estiverem definidos no banco, os inputs são preenchidos e desabilitados;
     caso contrário, permanecem vazios e habilitados para edição. */
  const updateHeaderProfile = (user) => {
    if (user) {
      localStorage.setItem("userData", JSON.stringify(user));
      profileImgEl.src = user.photoURL || "../../assets/img/icons/user.png";
      userNameEl.textContent = user.name || user.displayName || "Usuário";
      userEmailEl.textContent = user.email;
      
      // Preenche os inputs do formulário de perfil
      const nameInput = document.getElementById("userName");
      const bioInput = document.getElementById("userBio");
      const genderInput = document.getElementById("userGenero");
      const userTypeInput = document.getElementById("userType");
      const emailInput = document.getElementById("emailUser");

      if (nameInput) nameInput.value = user.name || "";
      if (bioInput) bioInput.value = user.bio || "";
      
      // Gênero: se existir no DB, preenche e desabilita; se não, deixa habilitado para edição.
      if (genderInput) {
        if (user.gender && user.gender.trim() !== "") {
          genderInput.value = user.gender;
          genderInput.disabled = true;
        } else {
          genderInput.value = "";
          genderInput.disabled = false;
        }
      }
      
      // Tipo de usuário: mesma lógica para exibir ou habilitar a edição.
      if (userTypeInput) {
        if (user.userType && user.userType.trim() !== "") {
          userTypeInput.value = user.userType;
          userTypeInput.disabled = true;
        } else {
          userTypeInput.value = "";
          userTypeInput.disabled = false;
        }
      }

      // Preenche o input de email (sempre desabilitado)
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
      if (emailInput) emailInput.value = "";
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
            await updateProfile(auth.currentUser, { photoURL });
            const userDoc = doc(firestore, "users", auth.currentUser.uid);
            await updateDoc(userDoc, { photoURL, updatedAt: new Date() });
            profileImgEl.src = photoURL;
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
    const nameInput = perfilForm.querySelector("#userName");
    const bioInput = perfilForm.querySelector("#userBio");
    const genderInput = perfilForm.querySelector("#userGenero");
    const userTypeInput = perfilForm.querySelector("#userType");
    const userName = nameInput.value.trim();
    const userBio = bioInput.value.trim();

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
        const updateData = {
          name: userName,
          bio: userBio,
          updatedAt: new Date()
        };
        // Se os inputs de gênero e tipo de usuário estiverem habilitados, inclui-os na atualização.
        if (genderInput && !genderInput.disabled) {
          updateData.gender = genderInput.value;
        }
        if (userTypeInput && !userTypeInput.disabled) {
          updateData.userType = userTypeInput.value;
        }
        await updateDoc(userDoc, updateData);
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
