// settingScripts.js
import { subscribeToAuthChanges } from "../../assets/js/models/userModel.js";
import { auth, firestore } from "../../assets/js/firebaseConfig.js";
import { updateDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { updateEmail, updatePassword, deleteUser, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

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

  /* ATUALIZAÇÃO DINÂMICA DO HEADER */
  const updateHeaderProfile = (user) => {
    if (user) {
      // Salva os dados do usuário no localStorage para otimização
      localStorage.setItem("userData", JSON.stringify(user));
      profileImgEl.src = user.photoURL || "../../assets/img/icons/user.png";
      userNameEl.textContent = user.name || user.displayName || "Usuário";
      userEmailEl.textContent = user.email;
    }
  };

  subscribeToAuthChanges((user) => {
    if (user) {
      updateHeaderProfile(user);
    } else {
      profileImgEl.src = "../../assets/img/icons/user.png";
      userNameEl.textContent = "";
      userEmailEl.textContent = "";
    }
  });

  /* ALTERAÇÃO DA FOTO DE PERFIL */
  if (profilePhotoInput) {
    profilePhotoInput.addEventListener("change", () => {
      const file = profilePhotoInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const photoURL = e.target.result; // imagem em base64
          try {
            await updateProfile(auth.currentUser, { photoURL });
            const userDoc = doc(firestore, "users", auth.currentUser.uid);
            await updateDoc(userDoc, { photoURL, updatedAt: new Date() });
            profileImgEl.src = photoURL;
            alert("Foto de perfil atualizada com sucesso!");
          } catch (error) {
            console.error("Erro ao atualizar foto de perfil:", error.message);
            alert("Erro ao atualizar foto de perfil. Tente novamente.");
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
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDoc = doc(firestore, "users", currentUser.uid);
        await updateDoc(userDoc, {
          name: userName,
          bio: userBio,
          gender: userGenero,
          userType: userType,
          updatedAt: new Date()
        });
        alert("Perfil atualizado com sucesso!");
      }
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error.message);
      alert("Erro ao atualizar perfil. Tente novamente.");
    }
  });

  /* ATUALIZAÇÃO DA CONTA - Formulário de Conta */
  contaSaveBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = contaForm.querySelector("#emailUser").value.trim();
    const newPassword = contaForm.querySelector("#newPassword").value;
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        if (email && email !== currentUser.email) {
          await updateEmail(currentUser, email);
        }
        if (newPassword) {
          await updatePassword(currentUser, newPassword);
        }
        const userDoc = doc(firestore, "users", currentUser.uid);
        await updateDoc(userDoc, {
          email: email,
          updatedAt: new Date()
        });
        alert("Dados da conta atualizados com sucesso!");
      }
    } catch (error) {
      console.error("Erro ao atualizar dados da conta:", error.message);
      alert("Erro ao atualizar dados da conta. Tente novamente.");
    }
  });

  /* EXCLUSÃO DE CONTA */
  deleteAccountBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (confirm("Tem certeza que deseja excluir sua conta? Essa ação não pode ser desfeita.")) {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          await deleteUser(currentUser);
          alert("Conta excluída com sucesso!");
          window.location.href = "../splash.html";
        }
      } catch (error) {
        console.error("Erro ao excluir conta:", error.message);
        alert("Erro ao excluir conta. Tente novamente.");
      }
    }
  });

  /* BOTÃO SAIR (LOGOUT) */
  const logoutBtn = document.querySelector("#menu button.logOut");
  logoutBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await auth.signOut();
      alert("Logout realizado com sucesso!");
      window.location.href = "../splash.html";
    } catch (error) {
      console.error("Erro ao fazer logout:", error.message);
      alert("Erro ao fazer logout. Tente novamente.");
    }
  });
});
