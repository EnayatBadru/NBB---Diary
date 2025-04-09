// settingScripts.js
import { subscribeToAuthChanges } from "../../assets/js/models/userModel.js";
import { auth, firestore } from "../../assets/js/firebaseConfig.js";
import {
  updateDoc,
  doc,
  deleteDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  // updateEmail,
  updatePassword,
  deleteUser,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

/**
 * Função simplificada para exibir mensagens
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo da mensagem: success, error
 */
function showMessage(message, type = 'info') {
  try {
    // Verifica se já existe um elemento de mensagem
    let messageElement = document.getElementById('notification');
    if (!messageElement) {
      // Cria um elemento de notificação se não existir
      messageElement = document.createElement('div');
      messageElement.id = 'notification';
      messageElement.style.position = 'fixed';
      messageElement.style.top = '20px';
      messageElement.style.right = '20px';
      messageElement.style.padding = '15px 20px';
      messageElement.style.borderRadius = '5px';
      messageElement.style.fontSize = '14px';
      messageElement.style.fontWeight = '500';
      messageElement.style.zIndex = '9999';
      messageElement.style.transition = 'opacity 0.3s ease';
      document.body.appendChild(messageElement);
    }

    // Define as cores com base no tipo
    switch (type) {
      case 'success':
        messageElement.style.backgroundColor = '#4CAF50';
        messageElement.style.color = 'white';
        break;
      case 'error':
        messageElement.style.backgroundColor = '#F44336';
        messageElement.style.color = 'white';
        break;
      default:
        messageElement.style.backgroundColor = '#2196F3';
        messageElement.style.color = 'white';
    }

    // Define a mensagem e exibe
    messageElement.textContent = message;
    messageElement.style.opacity = '1';

    // Oculta a mensagem após 3 segundos
    setTimeout(() => {
      messageElement.style.opacity = '0';
      setTimeout(() => {
        messageElement.remove();
      }, 300);
    }, 3000);
  } catch (error) {
    console.error("Erro ao mostrar mensagem:", error);
    // Fallback para console se a UI falhar
    console.log(`${type.toUpperCase()}: ${message}`);
  }
}

/**
 * Função para mostrar um diálogo de confirmação simples
 * @param {string} message - Mensagem a ser exibida
 * @returns {Promise<{confirmed: boolean, password: string|null}>}
 */
function confirmDialog(message) {
  return new Promise((resolve) => {
    try {
      // Criar um backdrop overlay
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      overlay.style.zIndex = '1000';
      overlay.style.display = 'flex';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      
      // Criar o diálogo
      const dialog = document.createElement('div');
      dialog.style.backgroundColor = 'white';
      dialog.style.borderRadius = '8px';
      dialog.style.padding = '20px';
      dialog.style.width = '350px';
      dialog.style.maxWidth = '90%';
      dialog.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
      
      // Texto da mensagem
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.marginBottom = '20px';
      
      // Campo de senha
      const passwordInput = document.createElement('input');
      passwordInput.type = 'password';
      passwordInput.placeholder = 'Digite sua senha para confirmar';
      passwordInput.style.width = '100%';
      passwordInput.style.padding = '10px';
      passwordInput.style.marginBottom = '20px';
      passwordInput.style.borderRadius = '4px';
      passwordInput.style.border = '1px solid #ddd';
      
      // Container de botões
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'flex-end';
      buttonContainer.style.gap = '10px';
      
      // Botão cancelar
      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancelar';
      cancelButton.style.padding = '8px 15px';
      cancelButton.style.backgroundColor = '#f1f1f1';
      cancelButton.style.border = 'none';
      cancelButton.style.borderRadius = '4px';
      cancelButton.style.cursor = 'pointer';
      
      // Botão confirmar
      const confirmButton = document.createElement('button');
      confirmButton.textContent = 'Confirmar';
      confirmButton.style.padding = '8px 15px';
      confirmButton.style.backgroundColor = '#e74c3c';
      confirmButton.style.color = 'white';
      confirmButton.style.border = 'none';
      confirmButton.style.borderRadius = '4px';
      confirmButton.style.cursor = 'pointer';
      
      // Montar o diálogo
      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(confirmButton);
      dialog.appendChild(messageEl);
      dialog.appendChild(passwordInput);
      dialog.appendChild(buttonContainer);
      overlay.appendChild(dialog);
      
      // Adicionar à página
      document.body.appendChild(overlay);
      
      // Focar no campo de senha
      setTimeout(() => passwordInput.focus(), 100);
      
      // Event listeners
      cancelButton.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve({ confirmed: false, password: null });
      });
      
      confirmButton.addEventListener('click', () => {
        const password = passwordInput.value.trim();
        document.body.removeChild(overlay);
        
        if (!password) {
          showMessage('Por favor, digite sua senha para confirmar.', 'error');
          setTimeout(() => {
            confirmDialog(message).then(resolve);
          }, 1000);
          return;
        }
        
        resolve({ confirmed: true, password });
      });

      // Adicionar evento para fechar com Esc
      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
          document.body.removeChild(overlay);
          document.removeEventListener('keydown', escHandler);
          resolve({ confirmed: false, password: null });
        }
      });
    } catch (error) {
      console.error("Erro ao exibir diálogo de confirmação:", error);
      // Fallback para confirmação simples
      const confirmed = window.confirm(message);
      if (confirmed) {
        const password = prompt("Digite sua senha para confirmar:");
        resolve({ confirmed: true, password: password || null });
      } else {
        resolve({ confirmed: false, password: null });
      }
    }
  });
}

/**
 * Função para atualizar a foto de perfil do usuário usando uma URL externa
 * @param {File} file - Arquivo de imagem selecionado
 * @returns {Promise<string|null>} URL da foto atualizada ou null em caso de erro
 */
async function updateProfilePhoto(file) {
  try {
    // Validações iniciais
    if (!file) {
      throw new Error("Nenhum arquivo selecionado.");
    }

    if (!file.type.match('image.*')) {
      throw new Error("O arquivo selecionado não é uma imagem válida.");
    }

    // Limite de tamanho (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`A imagem deve ter no máximo 5MB. Tamanho atual: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }

    // Verificar usuário autenticado
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Usuário não autenticado. Faça login novamente.");
    }

    // Mostrar indicador de carregamento
    showMessage("Processando foto...", "info");

    // Converter a imagem para base64 e usar como URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const photoURL = event.target.result;
          
          // Limitar o tamanho da string base64 (pode ser grande)
          if (photoURL.length > 1024 * 1024) { // Se for maior que 1MB como string
            reject(new Error("Imagem muito grande. Por favor, escolha uma imagem menor."));
            return;
          }

          // Atualizar perfil no Authentication
          await updateProfile(user, { photoURL });

          // Atualizar dados no Firestore (armazenar apenas a URL)
          const userDoc = doc(firestore, "users", user.uid);
          await updateDoc(userDoc, {
            photoURL,
            updatedAt: new Date()
          });

          // Atualizar interface imediatamente
          const profileImg = document.querySelector(".imgProfile img");
          if (profileImg) {
            profileImg.src = photoURL;
          }

          // Atualizar dados no localStorage para persistência
          const userData = JSON.parse(localStorage.getItem("userData") || "{}");
          const updatedUser = { ...userData, photoURL };
          localStorage.setItem("userData", JSON.stringify(updatedUser));

          // Mostrar sucesso
          showMessage("Foto de perfil atualizada com sucesso!", "success");
          
          resolve(photoURL);
        } catch (error) {
          console.error("Erro ao processar imagem:", error);
          showMessage("Erro ao processar imagem: " + (error.message || "Tente novamente mais tarde."), "error");
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error("Erro ao ler o arquivo de imagem."));
      };
      
      reader.readAsDataURL(file);
    });
  } catch (error) {
    // Tratamento de erros gerais
    console.error("Erro ao atualizar foto de perfil:", error);
    showMessage(error.message || "Erro ao atualizar foto de perfil. Tente novamente.", "error");
    return null;
  }
}

/**
 * Verifica se uma imagem é válida e tem dimensões adequadas
 * @param {File} file - Arquivo de imagem
 * @returns {Promise<boolean>}
 */
function isValidImage(file) {
  return new Promise((resolve) => {
    try {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      
      if (!validTypes.includes(file.type)) {
        return resolve(false);
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Verifica dimensões mínimas e máximas
          const isValidSize = img.width >= 100 && img.height >= 100 && 
                           img.width <= 2000 && img.height <= 2000;
          resolve(isValidSize);
        };
        img.onerror = () => resolve(false);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(false);
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao validar imagem:", error);
      resolve(false); // Em caso de erro, considerar inválida
    }
  });
}

/**
 * Verifica se os campos obrigatórios estão preenchidos no Firestore
 * @param {string} userId - ID do usuário
 * @returns {Promise<{hasGender: boolean, hasUserType: boolean}>}
 */
async function checkRequiredFields(userId) {
  try {
    const userDoc = doc(firestore, "users", userId);
    const userSnapshot = await getDoc(userDoc);
    
    if (userSnapshot.exists()) {
      const userData = userSnapshot.data();
      return {
        hasGender: Boolean(userData.gender),
        hasUserType: Boolean(userData.userType)
      };
    }
    
    return { hasGender: false, hasUserType: false };
  } catch (error) {
    console.error("Erro ao verificar campos no banco de dados:", error);
    return { hasGender: false, hasUserType: false };
  }
}

// Inicialização quando o DOM estiver carregado
document.addEventListener("DOMContentLoaded", async () => {
  try {
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
    const contaSaveBtn = contaForm?.querySelector("button:not(.deleteAccount)");
    const deleteAccountBtn = contaForm?.querySelector("button.deleteAccount");

    /* FUNÇÕES AUXILIARES DE LAYOUT */
    const clearActive = () => {
      Object.values(sections).forEach(s => s?.classList.remove("active"));
      menuButtons.forEach(btn => btn.classList.remove("active"));
    };

    const clearMobileActive = () => {
      setting?.classList.remove("active");
      main?.classList.remove("active");
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

    // Chamar setDefaultActive para garantir que uma seção esteja selecionada ao carregar
    setDefaultActive();

    /* Event Listeners para elementos de layout */
    menuButtons.forEach(button => {
      button.addEventListener("click", (e) => {
        try {
          e.stopPropagation();
          const text = button.textContent.trim().toLowerCase();
          clearActive();
          button.classList.add("active");
          activateSection(text);
          if (window.innerWidth <= 600) {
            setting?.classList.add("active");
            main?.classList.add("active");
          }
        } catch (error) {
          console.error("Erro ao trocar seção:", error);
          showMessage("Erro ao navegar. Tente novamente.", "error");
        }
      });
    });

    cross?.addEventListener("click", (e) => {
      try {
        e.stopPropagation();
        clearActive();
        clearMobileActive();
        setDefaultActive(); // Reseleciona a seção padrão ao fechar
      } catch (error) {
        console.error("Erro ao fechar menu:", error);
      }
    });

    backButton?.addEventListener("click", (e) => {
      try {
        e.stopPropagation();
        window.location.href = "./index.html";
      } catch (error) {
        console.error("Erro ao navegar para página inicial:", error);
        showMessage("Erro ao retornar à página inicial. Tente novamente.", "error");
      }
    });

    /* ATUALIZAÇÃO DINÂMICA DO HEADER E PREENCHE CAMPOS DE CONTA */
    const updateHeaderProfile = async (user) => {
      try {
        if (user) {
          // Verificar campos obrigatórios no banco de dados
          const { hasGender, hasUserType } = await checkRequiredFields(user.uid);
          
          // Salvar no localStorage
          const userData = {
            ...user,
            _hasGender: hasGender,
            _hasUserType: hasUserType
          };
          localStorage.setItem("userData", JSON.stringify(userData));
          
          // Atualizar UI
          if (profileImgEl) {
            profileImgEl.src = user.photoURL || "../../assets/img/icons/user.png";
            // Pré-carregar a imagem para evitar falhas
            const preloadImg = new Image();
            preloadImg.src = user.photoURL || "../../assets/img/icons/user.png";
            preloadImg.onerror = () => {
              // Fallback se a imagem falhar
              profileImgEl.src = "../../assets/img/icons/user.png";
            };
          }
          
          if (userNameEl) {
            userNameEl.textContent = user.name || user.displayName || "Usuário";
          }
          
          if (userEmailEl) {
            userEmailEl.textContent = user.email || "";
          }
          
          const emailInput = document.getElementById("emailUser");
          if (emailInput) {
            emailInput.value = user.email || "";
            emailInput.disabled = true;
          }
          
          // Preencher campos do perfil
          const nameInput = document.getElementById("userName");
          const bioInput = document.getElementById("userBio");
          const generoSelect = document.getElementById("userGenero");
          const typeSelect = document.getElementById("userType");
          
          if (nameInput) nameInput.value = user.name || user.displayName || "";
          if (bioInput) bioInput.value = user.bio || "";
          
          if (generoSelect) {
            if (user.gender) {
              generoSelect.value = user.gender;
              generoSelect.disabled = true; // Desabilita o campo se já tiver um valor
              // Adicionar estilo visual para indicar que está desabilitado
              generoSelect.style.opacity = "0.7";
              generoSelect.style.cursor = "not-allowed";
              // Remover marcação de campo requerido
              generoSelect.classList.remove("required-field");
              generoSelect.style.borderColor = "";
            } else {
              // Destacar campo se estiver vazio
              generoSelect.classList.add("required-field");
              generoSelect.style.borderColor = hasGender ? "" : "red";
              generoSelect.disabled = false; // Certifica-se que o campo está habilitado se não tiver valor
              generoSelect.style.opacity = "1";
              generoSelect.style.cursor = "pointer";
            }
          }
          
          if (typeSelect) {
            if (user.userType) {
              typeSelect.value = user.userType;
              typeSelect.disabled = true; // Desabilita o campo se já tiver um valor
              // Adicionar estilo visual para indicar que está desabilitado
              typeSelect.style.opacity = "0.7";
              typeSelect.style.cursor = "not-allowed";
              // Remover marcação de campo requerido
              typeSelect.classList.remove("required-field");
              typeSelect.style.borderColor = "";
            } else {
              // Destacar campo se estiver vazio
              typeSelect.classList.add("required-field");
              typeSelect.style.borderColor = hasUserType ? "" : "red";
              typeSelect.disabled = false; // Certifica-se que o campo está habilitado se não tiver valor
              typeSelect.style.opacity = "1";
              typeSelect.style.cursor = "pointer";
            }
          }
          
          // Disparar evento de input para atualizar contadores
          if (bioInput) bioInput.dispatchEvent(new Event('input'));
          
          // Mostrar aviso se campos obrigatórios estiverem vazios
          if (!hasGender || !hasUserType) {
            showMessage("Por favor, preencha os campos obrigatórios de gênero e tipo de usuário.", "error");
          }

          // Adicionar texto explicativo sobre campos desabilitados
          if ((user.gender || user.userType) && (generoSelect || typeSelect)) {
            const messageContainer = document.createElement("div");
            messageContainer.id = "fieldsDisabledInfo";
            messageContainer.style.margin = "10px 0";
            messageContainer.style.padding = "10px";
            messageContainer.style.backgroundColor = "#f8f9fa";
            messageContainer.style.borderRadius = "5px";
            messageContainer.style.fontSize = "13px";
            messageContainer.style.color = "#555";
            
            // Remover mensagem existente se houver
            const existingInfo = document.getElementById("fieldsDisabledInfo");
            if (existingInfo) existingInfo.remove();
            
            // Criar texto baseado no que está desabilitado
            let infoText = "Nota: ";
            if (user.gender && user.userType) {
              infoText += "Os campos de gênero e tipo de usuário não podem ser alterados após definidos inicialmente.";
            } else if (user.gender) {
              infoText += "O campo de gênero não pode ser alterado após definido inicialmente.";
            } else if (user.userType) {
              infoText += "O campo de tipo de usuário não pode ser alterado após definido inicialmente.";
            }
            
            messageContainer.textContent = infoText;
            
            // Adicionar ao formulário
            if (perfilForm) {
              const submitButton = perfilForm.querySelector("button[type='button']");
              if (submitButton) {
                perfilForm.insertBefore(messageContainer, submitButton);
              } else {
                perfilForm.appendChild(messageContainer);
              }
            }
          }
        }
      } catch (error) {
        // console.error("Erro ao atualizar perfil na interface:", error);
        // showMessage("Erro ao carregar dados do perfil. Atualize a página.", "error");
      }
    };

    // Inscrever-se para alterações de autenticação
    subscribeToAuthChanges(async (user) => {
      try {
        if (user) {
          await updateHeaderProfile(user);
        } else {
          if (profileImgEl) profileImgEl.src = "../../assets/img/icons/user.png";
          if (userNameEl) userNameEl.textContent = "";
          if (userEmailEl) userEmailEl.textContent = "";
          
          const emailInput = document.getElementById("emailUser");
          if (emailInput) {
            emailInput.value = "";
          }
          
          // Redirecionar para login se não estiver autenticado
          setTimeout(() => {
            window.location.href = "../splash.html";
          }, 1000);
        }
      } catch (error) {
        console.error("Erro ao processar alterações de autenticação:", error);
      }
    });

    /* Melhorar a interação do usuário com foto de perfil */
    const imgProfileBtn = document.querySelector(".imgProfile");
    if (imgProfileBtn && profilePhotoInput) {
      // Adicionar estilo para indicar que é clicável
      imgProfileBtn.style.cursor = "pointer";
      
      // Adicionar tooltip
      imgProfileBtn.title = "Clique para alterar sua foto de perfil";
      
      // Adicionar ícone de câmera ou edição para tornar óbvio
      const editIcon = document.createElement("div");
      editIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 12l2 2 4-4"></path>
        </svg>
      `;
      editIcon.style.position = "absolute";
      editIcon.style.bottom = "0";
      editIcon.style.right = "0";
      editIcon.style.backgroundColor = "#4CAF50";
      editIcon.style.borderRadius = "50%";
      editIcon.style.width = "24px";
      editIcon.style.height = "24px";
      editIcon.style.display = "flex";
      editIcon.style.alignItems = "center";
      editIcon.style.justifyContent = "center";
      editIcon.style.color = "white";
      editIcon.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
      
      // Verificar se .imgProfile tem position relative
      if (window.getComputedStyle(imgProfileBtn).position !== "relative") {
        imgProfileBtn.style.position = "relative";
      }
      
      // Remover ícone se já existir
      const existingIcon = imgProfileBtn.querySelector("div");
      if (existingIcon) existingIcon.remove();
      
      imgProfileBtn.appendChild(editIcon);
      
      imgProfileBtn.addEventListener("click", () => {
        profilePhotoInput.click();
      });
    }

    /* ALTERAÇÃO DA IMAGEM DE PERFIL */
    if (profilePhotoInput) {
      profilePhotoInput.addEventListener("change", async () => {
        try {
          const file = profilePhotoInput.files[0];
          if (file) {
            // Validação do tipo de arquivo
            if (!file.type.startsWith("image/")) {
              showMessage("Por favor, selecione uma imagem válida.", "error");
              profilePhotoInput.value = ""; // Limpa o input
              return;
            }
            
            // Validação avançada da imagem
            const isValid = await isValidImage(file);
            if (!isValid) {
              showMessage("A imagem selecionada tem dimensões inválidas. Use uma imagem entre 100x100 e 2000x2000 pixels.", "error");
              profilePhotoInput.value = "";
              return;
            }
            
            // Realizar upload
            await updateProfilePhoto(file);
            
            // Limpar input para permitir selecionar a mesma imagem novamente
            profilePhotoInput.value = "";
          }
        } catch (error) {
          console.error("Erro ao processar alteração de foto:", error);
          showMessage("Erro ao processar a imagem. Tente novamente.", "error");
          profilePhotoInput.value = "";
        }
      });
    }

    /* Adicionar contador de caracteres para o campo bio */
    const userBioInput = perfilForm?.querySelector("#userBio");
    if (userBioInput) {
      const bioCharCount = document.createElement("small");
      bioCharCount.classList.add("char-count");
      bioCharCount.style.display = "block";
      bioCharCount.style.marginTop = "5px";
      bioCharCount.style.fontSize = "12px";
      bioCharCount.style.textAlign = "right";
      
      // Inserir após o campo de texto
      userBioInput.parentNode.insertBefore(bioCharCount, userBioInput.nextSibling);
      
      userBioInput.addEventListener("input", () => {
        const remaining = 250 - userBioInput.value.length;
        bioCharCount.textContent = `${remaining} caracteres restantes`;
        bioCharCount.style.color = remaining < 0 ? "red" : "#666";
        // Destacar campo se exceder limite
        userBioInput.style.borderColor = remaining < 0 ? "red" : "";
      });
      
      // Disparar o evento para mostrar contagem inicial
      userBioInput.dispatchEvent(new Event("input"));
    }

    /* ATUALIZAÇÃO DO PERFIL - Formulário de Perfil */
    perfilForm?.querySelector("button[type='button']").addEventListener("click", async (e) => {
      try {
        e.preventDefault();
        
        const userName = perfilForm.querySelector("#userName").value.trim();
        const userBio = perfilForm.querySelector("#userBio").value.trim();
        
        // Obter valores atuais dos campos, independentemente de estarem desabilitados
        const generoSelect = perfilForm.querySelector("#userGenero");
        const typeSelect = perfilForm.querySelector("#userType");
        const userGenero = generoSelect ? generoSelect.value : "";
        const userType = typeSelect ? typeSelect.value : "";

        // Validações
        if (!userName) {
          showMessage("O nome é obrigatório.", "error");
          return;
        }
        if (userName.length < 3) {
          showMessage("O nome deve ter pelo menos 3 caracteres.", "error");
          return;
        }
        if (userBio.length > 250) {
          showMessage("A bio não pode exceder 250 caracteres.", "error");
          return;
        }
        
        // Validar apenas se os campos não estiverem desabilitados
        if (generoSelect && !generoSelect.disabled && !userGenero) {
          showMessage("Selecione um gênero.", "error");
          generoSelect.style.borderColor = "red";
          return;
        }
        if (typeSelect && !typeSelect.disabled && !userType) {
          showMessage("Selecione um tipo de usuário.", "error");
          typeSelect.style.borderColor = "red";
          return;
        }

        try {
          showMessage("Atualizando perfil...", "info");
          
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error("Usuário não autenticado.");
          }

          // Atualizar perfil no Authentication
          await updateProfile(currentUser, { displayName: userName });
          
          // Preparar os dados para atualização
          const updateData = {
            name: userName,
            bio: userBio,
            updatedAt: new Date()
          };
          
          // Adicionar gênero e tipo de usuário apenas se não estiverem desabilitados e tiverem valor
          if (generoSelect && !generoSelect.disabled && userGenero) {
            updateData.gender = userGenero;
          }
          
          if (typeSelect && !typeSelect.disabled && userType) {
            updateData.userType = userType;
          }
          
          // Atualizar dados no Firestore
          const userDoc = doc(firestore, "users", currentUser.uid);
          await updateDoc(userDoc, updateData);
          
          // Preparar dados atualizados para o cache
          const userData = JSON.parse(localStorage.getItem("userData") || "{}");
          const updatedUser = { 
            ...userData, 
            name: userName,
            bio: userBio,
            _hasGender: Boolean(userGenero || userData.gender),
            _hasUserType: Boolean(userType || userData.userType)
          };
          
          // Adicionar dados apenas se não estão desabilitados e têm valor
          if (generoSelect && !generoSelect.disabled && userGenero) {
            updatedUser.gender = userGenero;
          } else if (userData.gender) {
            // Manter o valor existente se o campo estiver desabilitado
            updatedUser.gender = userData.gender;
          }
          
          if (typeSelect && !typeSelect.disabled && userType) {
            updatedUser.userType = userType;
          } else if (userData.userType) {
            // Manter o valor existente se o campo estiver desabilitado
            updatedUser.userType = userData.userType;
          }
          
          localStorage.setItem("userData", JSON.stringify(updatedUser));
          
          // Atualizar interface com os dados corretos
          const userToUpdate = {
            ...currentUser,
            name: userName,
            bio: userBio
          };
          
          // Adicionar gênero e tipo apenas se já tiverem valor (do banco ou novos)
          if (generoSelect && !generoSelect.disabled && userGenero) {
            userToUpdate.gender = userGenero;
          } else if (userData.gender) {
            userToUpdate.gender = userData.gender;
          }
          
          if (typeSelect && !typeSelect.disabled && userType) {
            userToUpdate.userType = userType;
          } else if (userData.userType) {
            userToUpdate.userType = userData.userType;
          }
          
          await updateHeaderProfile(userToUpdate);
          
          // Resetar estilos de validação
          if (generoSelect) {
            generoSelect.style.borderColor = "";
          }
          if (typeSelect) {
            typeSelect.style.borderColor = "";
          }
          
          showMessage("Perfil atualizado com sucesso!", "success");
        } catch (error) {
          console.error("Erro ao atualizar perfil:", error);
          showMessage(error.message || "Erro ao atualizar perfil. Tente novamente.", "error");
        }
      } catch (error) {
        console.error("Erro ao processar formulário de perfil:", error);
        showMessage("Ocorreu um erro ao processar o formulário. Tente novamente.", "error");
      }
    });

    /* ATUALIZAÇÃO DA CONTA - Formulário de Conta */
    contaSaveBtn?.addEventListener("click", async (e) => {
      try {
        e.preventDefault();
        
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
          
          showMessage("Atualizando senha...", "info");
          
          try {
            // Reautenticar usuário antes de alterar senha
            const credential = EmailAuthProvider.credential(email, oldPassword);
            await reauthenticateWithCredential(currentUser, credential);
            
            // Atualizar senha
            await updatePassword(currentUser, newPassword);
            
            // Limpar campos
            contaForm.querySelector("#passwordUser").value = "";
            contaForm.querySelector("#newPassword").value = "";
            
            // Atualizar timestamp no Firestore
            const userDoc = doc(firestore, "users", currentUser.uid);
            await updateDoc(userDoc, { updatedAt: new Date() });

            showMessage("Senha atualizada com sucesso!", "success");
          } catch (authError) {
            console.error("Erro na autenticação:", authError);
            
            // Tratar erros específicos de autenticação
            if (authError.code === 'auth/wrong-password') {
              throw new Error("Senha atual incorreta.");
            } else if (authError.code === 'auth/requires-recent-login') {
              throw new Error("Por segurança, faça login novamente antes de alterar sua senha.");
            } else if (authError.code === 'auth/too-many-requests') {
              throw new Error("Muitas tentativas. Tente novamente mais tarde.");
            } else {
              throw authError;
            }
          }
        } else {
          // Se não há nova senha, apenas atualiza o timestamp
          const userDoc = doc(firestore, "users", currentUser.uid);
          await updateDoc(userDoc, { updatedAt: new Date() });
          showMessage("Dados da conta atualizados com sucesso!", "success");
        }
      } catch (error) {
        console.error("Erro ao atualizar dados da conta:", error);
        
        // Mensagens de erro mais amigáveis
        let errorMessage = "Erro ao atualizar dados da conta.";
        
        if (error.code === 'auth/wrong-password') {
          errorMessage = "Senha atual incorreta.";
        } else if (error.code === 'auth/requires-recent-login') {
          errorMessage = "Por segurança, faça login novamente antes de alterar sua senha.";
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        showMessage(errorMessage, "error");
      }
    });

    /* EXCLUSÃO DE CONTA */
    deleteAccountBtn?.addEventListener("click", async (e) => {
      try {
        e.preventDefault();
        
        const { confirmed, password } = await confirmDialog("Tem certeza que deseja excluir sua conta? Essa ação não pode ser desfeita.");
        
        if (!confirmed) return;
        
        if (!password || password.trim() === "") {
          showMessage("Senha obrigatória para confirmar exclusão da conta.", "error");
          return;
        }
        
        showMessage("Excluindo conta...", "info");
        
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Usuário não autenticado.");
        }
        
        try {
          // Reautenticar usuário antes de excluir conta
          const credential = EmailAuthProvider.credential(currentUser.email, password);
          await reauthenticateWithCredential(currentUser, credential);
          
          // Excluir documento do Firestore
          const userDoc = doc(firestore, "users", currentUser.uid);
          await deleteDoc(userDoc);
          
          // Excluir usuário do Authentication
          await deleteUser(currentUser);
          
          // Limpar dados locais
          localStorage.removeItem("userData");
          
          showMessage("Conta excluída com sucesso!", "success");
          
          // Redirecionar após breve delay
          setTimeout(() => {
            window.location.href = "../viewsplash.html";
          }, 1500);
        } catch (authError) {
          console.error("Erro na autenticação para exclusão:", authError);
          
          if (authError.code === 'auth/wrong-password') {
            throw new Error("Senha incorreta.");
          } else if (authError.code === 'auth/too-many-requests') {
            throw new Error("Muitas tentativas. Tente novamente mais tarde.");
          } else {
            throw authError;
          }
        }
      } catch (error) {
        console.error("Erro ao excluir conta:", error);
        
        let errorMessage = "Erro ao excluir conta.";
        
        if (error.code === 'auth/wrong-password') {
          errorMessage = "Senha incorreta.";
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        showMessage(errorMessage, "error");
      }
    });

    /* BOTÃO SAIR (LOGOUT) */
    const logoutBtn = document.querySelector("#menu button.logOut");
    logoutBtn?.addEventListener("click", async (e) => {
      try {
        e.preventDefault();
        
        showMessage("Saindo...", "info");
        await auth.signOut();
        
        // Limpar dados do usuário do localStorage
        localStorage.removeItem("userData");
        
        showMessage("Logout realizado com sucesso!", "success");
        
        // Redirecionar após breve delay
        setTimeout(() => {
          window.location.href = "../splash.html";
        }, 1000);
      } catch (error) {
        console.error("Erro ao fazer logout:", error);
        showMessage("Erro ao fazer logout: " + (error.message || "Tente novamente"), "error");
      }
    });
  } catch (error) {
    console.error("Erro na inicialização:", error);
    showMessage("Ocorreu um erro ao carregar a página. Tente atualizar.", "error");
  }
});