// chatScript.js
import { auth, firestore, realtimeDb } from "./firebaseConfig.js";
import { showPopup, confirmDialog } from "./popup.js";
import {
  updateOnlineStatus,
  getUserContacts,
  getAllUsers,
  fetchUserData,
} from "./models/userModel.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import {
  ref,
  set,
  push,
  onValue,
  onChildAdded,
  onChildChanged,
  update,
  serverTimestamp as rtServerTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

/**
 * Estado da aplicação de chat
 */
const chatState = {
  currentUser: null,
  contacts: [],
  allUsers: [],
  conversations: [],
  activeConversation: null,
  messages: [],
  usersCache: {},
  unsubscribeListeners: {
    conversations: null,
    messages: null,
  },
  isLoading: {
    contacts: true,
    messages: false,
    search: false,
  },
  searchCache: {},
};

/**
 * Funções para cache utilizando localStorage
 */
function loadConversationsFromCache() {
  try {
    const cached = localStorage.getItem("chatConversations");
    if (cached) {
      chatState.conversations = JSON.parse(cached);
      renderContacts(); // Renderiza imediato com os dados do cache
    }
  } catch (e) {
    console.error("Erro ao carregar cache de conversas:", e);
  }
}

function updateConversationsCache() {
  try {
    localStorage.setItem(
      "chatConversations",
      JSON.stringify(chatState.conversations)
    );
  } catch (e) {
    console.error("Erro ao atualizar cache de conversas:", e);
  }
}

function loadMessagesFromCache(conversationId) {
  try {
    const key = `chatMessages_${conversationId}`;
    const cached = localStorage.getItem(key);
    if (cached) {
      chatState.messages = JSON.parse(cached);
      renderMessages();
      scrollToBottom();
    }
  } catch (e) {
    console.error("Erro ao carregar cache de mensagens:", e);
  }
}

function updateMessagesCache(conversationId) {
  try {
    const key = `chatMessages_${conversationId}`;
    localStorage.setItem(key, JSON.stringify(chatState.messages));
  } catch (e) {
    console.error("Erro ao atualizar cache de mensagens:", e);
  }
}

/**
 * Formata timestamp para exibição de horário (HH:MM)
 */
function formatTime(timestamp) {
  if (!timestamp) return "";
  let date;
  if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Inicialização do chat
 */
document.addEventListener("DOMContentLoaded", () => {
  try {
    initChatElements();
    setupAuth();
    loadConversationsFromCache(); // Tenta carregar conversas em cache para exibir de imediato
  } catch (error) {
    console.error("Erro na inicialização do chat:", error);
    showPopup("error", "Erro ao iniciar o chat. Tente atualizar a página.");
  }
});

/**
 * Inicializa os elementos da interface e adiciona os listeners
 */
function initChatElements() {
  const searchInput = document.getElementById("searchUser");
  if (searchInput) {
    searchInput.addEventListener("input", handleSearch);
  }

  const sendButton = document.querySelector(".sendButton");
  const messageInput = document.querySelector(".messageInput");
  if (sendButton && messageInput) {
    sendButton.addEventListener("click", () => {
      const text = messageInput.value.trim();
      if (text) sendMessage(text);
    });
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (text) sendMessage(text);
      }
    });
  }

  const backButton = document.querySelector(".backButtonMensages");
  if (backButton) backButton.addEventListener("click", handleBackToContacts);

  const createChatButton = document.querySelector(".createChat");
  if (createChatButton)
    createChatButton.addEventListener("click", showNewChatDialog);

  const createGroupButton = document.querySelector(".createGroup");
  if (createGroupButton)
    createGroupButton.addEventListener("click", showCreateGroupDialog);

  const attachButton = document.querySelector(".attachButton");
  const emojiButton = document.querySelector(".emojiButton");
  const voiceButton = document.querySelector(".voiceButton");

  if (attachButton)
    attachButton.addEventListener("click", () =>
      showPopup("info", "Envio de arquivos em breve")
    );
  if (emojiButton)
    emojiButton.addEventListener("click", () =>
      showPopup("info", "Emojis em breve")
    );
  if (voiceButton)
    voiceButton.addEventListener("click", () =>
      showPopup("info", "Mensagens de voz em breve")
    );

  window.addEventListener("resize", adjustLayout);
}

/**
 * Configura autenticação e carrega dados do usuário primeiro
 */
function setupAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const userDoc = await getDoc(doc(firestore, "users", user.uid));
        chatState.currentUser = userDoc.exists()
          ? { ...user, ...userDoc.data() }
          : user;

        await updateOnlineStatus(user.uid, true);
        window.addEventListener("beforeunload", () =>
          updateOnlineStatus(user.uid, false)
        );

        updateUserUI(chatState.currentUser);
        chatState.contacts = await getUserContacts(chatState.currentUser.uid);
        setupConversationsListener();
        setupUserStatusListener(user.uid);
      } catch (error) {
        console.error("Erro ao inicializar chat:", error);
        showPopup("error", "Erro ao carregar dados do chat");
      }
    } else {
      window.location.href = "../splash.html";
    }
  });
}

/**
 * Atualiza a UI com os dados do usuário logado, incluindo status online
 */
function updateUserUI(user) {
  if (!user) return;
  const nameEl = document.querySelector(".userName");
  const emailEl = document.querySelector(".userEmail");
  const onlineStatusEl = document.querySelector(".onlineStatus");
  if (nameEl) nameEl.textContent = user.name || user.displayName || "Usuário";
  if (emailEl) emailEl.textContent = user.email || "";
  if (onlineStatusEl) {
    onlineStatusEl.style.backgroundColor = user.isOnline ? "#4CAF50" : "#ccc";
  }
  const profileImg = document.querySelector(".imgProfile svg");
  if (profileImg && user.photoURL) {
    const imgContainer = document.querySelector(".imgProfile");
    if (imgContainer) {
      imgContainer.innerHTML = `<img src="${user.photoURL}" alt="Foto de perfil" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    }
  }
}

/**
 * Configura listener para o status online do usuário logado
 */
function setupUserStatusListener(userId) {
  const userStatusRef = ref(realtimeDb, `users/${userId}/isOnline`);
  onValue(userStatusRef, (snapshot) => {
    const isOnline = snapshot.val();
    chatState.currentUser.isOnline = isOnline;
    updateUserUI(chatState.currentUser);
  });
}

/**
 * Configura listener para conversas com cache e atualização em tempo-real
 */
function setupConversationsListener() {
  try {
    if (chatState.unsubscribeListeners.conversations)
      chatState.unsubscribeListeners.conversations();

    if (!chatState.currentUser?.uid) throw new Error("Usuário não autenticado");

    const conversationsRef = collection(firestore, "conversations");
    const q = query(
      conversationsRef,
      where("participants", "array-contains", chatState.currentUser.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      chatState.conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      renderContacts();
      updateConversationsCache(); // Atualiza o cache com as conversas atuais
      chatState.isLoading.contacts = false;
      updateContactsLoadingState(false);
      if (chatState.activeConversation) {
        const updatedConversation = chatState.conversations.find(
          (c) => c.id === chatState.activeConversation.id
        );
        if (updatedConversation)
          chatState.activeConversation = updatedConversation;
      }
    });
    chatState.unsubscribeListeners.conversations = unsubscribe;
  } catch (error) {
    console.error("Erro ao configurar listener de conversas:", error);
    showPopup("error", "Erro ao monitorar conversas");
    chatState.isLoading.contacts = false;
    updateContactsLoadingState(false);
  }
}

/**
 * Atualiza o indicador de carregamento dos contatos
 */
function updateContactsLoadingState(
  isLoading,
  message = "Carregando conversas..."
) {
  const contactsList = document.getElementById("menu");
  if (!contactsList) return;
  if (isLoading) {
    let loadingItem = contactsList.querySelector(".chat-loading");
    if (!loadingItem) {
      loadingItem = document.createElement("li");
      loadingItem.className = "chat-loading";
      loadingItem.innerHTML = `
        <div class="list loading-item">
          <div class="loading-animation" style="width: 100%; height: 60px; display: flex; align-items: center; justify-content: center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid">
              <circle cx="50" cy="50" r="32" stroke-width="8" stroke="#00dfc4" stroke-dasharray="50.26548245743669 50.26548245743669" fill="none" stroke-linecap="round">
                <animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" keyTimes="0;1" values="0 50 50;360 50 50"></animateTransform>
              </circle>
            </svg>
            <span style="margin-left: 10px; color: #00dfc4;">${message}</span>
          </div>
        </div>
      `;
      contactsList.innerHTML = "";
      contactsList.appendChild(loadingItem);
    }
  } else {
    const loadingItem = contactsList.querySelector(".chat-loading");
    if (loadingItem) loadingItem.remove();
  }
}

/**
 * Renderiza a lista de contatos ou resultados de busca
 */
function renderContacts() {
  const contactsList = document.getElementById("menu");
  if (!contactsList || chatState.isLoading.contacts) return;

  contactsList.innerHTML = "";
  const searchInput = document.getElementById("searchUser");
  const isSearching = searchInput && searchInput.value.trim() !== "";
  if (isSearching) {
    renderSearchResults(contactsList, searchInput.value.trim());
  } else {
    renderConversations(contactsList);
  }
}

/**
 * Pesquisa dinâmica entre usuários
 */
async function renderSearchResults(contactsList, searchTerm) {
  if (searchTerm.length < 1) {
    contactsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #00dfc4;">Digite para buscar usuários</div>`;
    return;
  }
  chatState.isLoading.search = true;
  updateContactsLoadingState(true, "Buscando usuários...");
  try {
    const usersRef = collection(firestore, "users");
    const nameQuery = query(
      usersRef,
      where("name", ">=", searchTerm),
      where("name", "<=", searchTerm + "\uf8ff"),
      limit(10)
    );
    const [nameSnapshot] = await Promise.all([getDocs(nameQuery)]);
    const usersMap = new Map();
    nameSnapshot.forEach((doc) => {
      if (doc.id !== chatState.currentUser.uid)
        usersMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
    const results = Array.from(usersMap.values());
    displaySearchResults(contactsList, results);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    showPopup("error", "Erro ao buscar usuários");
  } finally {
    chatState.isLoading.search = false;
    updateContactsLoadingState(false);
  }
}

/**
 * Exibe os resultados da pesquisa na UI
 */
function displaySearchResults(contactsList, results) {
  if (results.length === 0) {
    contactsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #00dfc4;">Nenhum usuário encontrado</div>`;
    return;
  }
  results.forEach((user) => {
    const listItem = document.createElement("li");
    listItem.innerHTML = `
      <div class="list search-result" data-user-id="${user.id}">
        <button type="button" class="button__pic">
          ${
            user.photoURL
              ? `<img src="${user.photoURL}" alt="${user.name}" style="width:45px;height:45px;border-radius:50%;">`
              : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="45" height="45">
                   <circle cx="12" cy="12" r="10" fill="#1d2b3a" stroke="#1d2b3a" stroke-width="1"/>
                   <path d="M12 7c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3z" fill="#00dfc4"/>
                 </svg>`
          }
        </button>
        <button type="button" class="button__user">
          <div class="container__left">
            <span class="nameUser__message">${user.name}</span>
            <span class="messageUser">Iniciar conversa</span>
          </div>
          <div class="container__right">
            <span class="online-indicator" style="width: 10px; height: 10px; border-radius: 50%; background-color: ${
              user.isOnline ? "#4CAF50" : "#ccc"
            }; margin-right: 5px;"></span>
            <span class="userType__badge" style="font-size: 0.7em; padding: 2px 6px; border-radius: 10px; background-color: ${
              user.userType === "paciente" ? "#2196F3" : "#FF9800"
            }; color: white;">${user.userType || "usuário"}</span>
          </div>
        </button>
      </div>
    `;
    contactsList.appendChild(listItem);
  });

  document.querySelectorAll("#menu li .list.search-result").forEach((item) => {
    item.addEventListener("click", async () => {
      const userId = item.getAttribute("data-user-id");
      await createConversation(userId);
      document.getElementById("searchUser").value = "";
      renderContacts(); // Atualiza a lista de conversas após criar uma nova
      showConversationView();
    });
  });
}

/**
 * Renderiza a lista de conversas já iniciadas
 */
function renderConversations(contactsList) {
  if (chatState.conversations.length === 0) {
    contactsList.innerHTML = `
      <li>
        <div class="no-conversations" style="text-align: center; padding: 20px; color: #00dfc4;">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <p>Nenhuma conversa ainda</p>
          <button class="start-chat-btn" style="background-color: #00dfc4; color: #1d2b3a; border: none; border-radius: 5px; padding: 8px 15px; margin-top: 10px; cursor: pointer;">Iniciar conversa</button>
        </div>
      </li>
    `;
    document
      .querySelector(".start-chat-btn")
      ?.addEventListener("click", showNewChatDialog);
    return;
  }

  chatState.conversations.forEach((conversation) => {
    let displayName = conversation.isGroup
      ? conversation.name || "Grupo"
      : "Conversa";
    let otherParticipantData = null;
    if (!conversation.isGroup) {
      const otherParticipantId = conversation.participants.find(
        (id) => id !== chatState.currentUser.uid
      );
      otherParticipantData =
        chatState.contacts.find(
          (contact) => contact.id === otherParticipantId
        ) || chatState.usersCache[otherParticipantId];
      if (!otherParticipantData) {
        fetchUserData(otherParticipantId).then((data) => {
          chatState.usersCache[otherParticipantId] = data;
          renderContacts();
        });
        otherParticipantData = {
          id: otherParticipantId,
          name: "Usuário",
          isOnline: false,
        };
      }
      displayName = otherParticipantData.name;
    }

    const unreadCount =
      conversation.unreadCount?.[chatState.currentUser.uid] || 0;
    const lastMessage = conversation.lastMessage || "Iniciar conversa...";
    const lastMessageTime = conversation.lastMessageAt
      ? formatTime(conversation.lastMessageAt)
      : "";
    const isActive = chatState.activeConversation?.id === conversation.id;

    const listItem = document.createElement("li");
    listItem.innerHTML = `
      <div class="list ${isActive ? "active" : ""}" data-conversation-id="${
      conversation.id
    }">
        <button type="button" class="button__pic">
          ${
            conversation.isGroup
              ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="45" height="45">
                   <circle cx="12" cy="12" r="10" fill="#1d2b3a" stroke="#1d2b3a" stroke-width="1"/>
                   <path d="M9 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm8 0c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" fill="#00dfc4"/>
                 </svg>`
              : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="45" height="45">
                   <circle cx="12" cy="12" r="10" fill="#1d2b3a" stroke="#1d2b3a" stroke-width="1"/>
                   <path d="M12 7c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3z" fill="#00dfc4"/>
                 </svg>`
          }
        </button>
        <button type="button" class="button__user">
          <div class="container__left">
            <span class="nameUser__message">${displayName}</span>
            <span class="messageUser">${lastMessage}</span>
          </div>
          <div class="container__right">
            <span class="Time__message">${lastMessageTime}</span>
            ${
              unreadCount > 0
                ? `<span class="length__message">${unreadCount}</span>`
                : ""
            }
            ${
              !conversation.isGroup && otherParticipantData?.isOnline
                ? `<span class="online-indicator" style="width: 8px; height: 8px; border-radius: 50%; background-color: #4CAF50; margin-top: 5px;"></span>`
                : ""
            }
          </div>
        </button>
      </div>
    `;
    contactsList.appendChild(listItem);
  });

  document
    .querySelectorAll("#menu li .list[data-conversation-id]")
    .forEach((item) => {
      item.addEventListener("click", async () => {
        document
          .querySelectorAll("#menu li .list")
          .forEach((el) => el.classList.remove("active"));
        item.classList.add("active");
        const conversationId = item.getAttribute("data-conversation-id");
        await openConversation(conversationId);
        showConversationView();
      });
    });
}

/**
 * Manipula o evento de pesquisa
 */
function handleSearch(e) {
  renderContacts();
}

/**
 * Cria ou recupera uma conversa com o usuário especificado
 */
async function createConversation(targetUserId) {
  try {
    const convQuery = query(
      collection(firestore, "conversations"),
      where("participants", "array-contains", chatState.currentUser.uid)
    );
    const snapshot = await getDocs(convQuery);
    let conversation = null;
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.isGroup && data.participants.includes(targetUserId)) {
        conversation = { id: docSnap.id, ...data };
      }
    });
    if (!conversation) {
      const conversationData = {
        participants: [chatState.currentUser.uid, targetUserId],
        isGroup: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCount: {},
      };
      const docRef = await addDoc(
        collection(firestore, "conversations"),
        conversationData
      );
      conversation = { id: docRef.id, ...conversationData };
      chatState.conversations.unshift(conversation); // Adiciona a nova conversa no topo da lista
      updateConversationsCache();
    }
    chatState.activeConversation = conversation;
    await openConversation(conversation.id);
  } catch (error) {
    console.error("Erro ao criar ou recuperar conversa:", error);
    showPopup("error", "Erro ao iniciar conversa");
  }
}

/**
 * Abre uma conversa existente e carrega as mensagens (utiliza cache para mensagens)
 */
async function openConversation(conversationId) {
  try {
    chatState.isLoading.messages = true;
    showMessagesLoading(true);
    const conversationDoc = await getDoc(
      doc(firestore, "conversations", conversationId)
    );
    if (!conversationDoc.exists()) {
      showPopup("error", "Conversa não encontrada");
      chatState.isLoading.messages = false;
      showMessagesLoading(false);
      return;
    }
    const conversationData = conversationDoc.data();
    let participants = [];
    if (conversationData.isGroup) {
      for (const participantId of conversationData.participants) {
        participants.push(
          participantId === chatState.currentUser.uid
            ? chatState.currentUser
            : await fetchUserData(participantId)
        );
      }
    } else {
      const otherParticipantId = conversationData.participants.find(
        (id) => id !== chatState.currentUser.uid
      );
      if (otherParticipantId)
        participants.push(await fetchUserData(otherParticipantId));
    }
    chatState.activeConversation = {
      ...conversationData,
      id: conversationId,
      participants,
    };
    if (conversationData.unreadCount?.[chatState.currentUser.uid] > 0) {
      await updateDoc(doc(firestore, "conversations", conversationId), {
        [`unreadCount.${chatState.currentUser.uid}`]: 0,
      });
    }
    updateConversationUI();

    // Tenta carregar mensagens do cache primeiro
    loadMessagesFromCache(conversationId);

    // Carrega as mensagens atualizadas do Firestore
    await loadMessages(conversationId);
    setupMessagesListener(conversationId);
    chatState.isLoading.messages = false;
    showMessagesLoading(false);
  } catch (error) {
    console.error("Erro ao abrir conversa:", error);
    showPopup("error", "Erro ao abrir conversa");
    chatState.isLoading.messages = false;
    showMessagesLoading(false);
  }
}

/**
 * Exibe indicador de carregamento de mensagens
 */
function showMessagesLoading(isLoading) {
  const conversationArea = document.querySelector(".mainSelectedMensages");
  if (!conversationArea) return;
  if (isLoading) {
    conversationArea.innerHTML = `
      <div class="loading-messages" style="display: flex; justify-content: center; align-items: center; height: 100%; flex-direction: column;">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid">
          <circle cx="50" cy="50" r="32" stroke-width="8" stroke="#00dfc4" stroke-dasharray="50.26548245743669 50.26548245743669" fill="none" stroke-linecap="round">
            <animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" keyTimes="0;1" values="0 50 50;360 50 50"></animateTransform>
          </circle>
        </svg>
        <p style="color: #00dfc4; margin-top: 10px;">Carregando mensagens...</p>
      </div>
    `;
  } else {
    conversationArea.innerHTML = "";
  }
}

/**
 * Atualiza a UI do cabeçalho da conversa
 */
function updateConversationUI() {
  if (!chatState.activeConversation) return;
  const { isGroup, participants, name } = chatState.activeConversation;
  const headerName = document.querySelector(".nameUserMensages");
  if (headerName) {
    headerName.textContent = isGroup
      ? name || "Grupo"
      : participants[0]?.name || "Conversa";
  }
  const headerPhoto = document.querySelector(".ProfileMensagesPic");
  if (headerPhoto) {
    if (isGroup) {
      headerPhoto.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="35" height="35" class="userProfile"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="#00dfc4"/></svg>`;
    } else {
      const otherParticipant = participants[0];
      headerPhoto.innerHTML = otherParticipant?.photoURL
        ? `<img src="${otherParticipant.photoURL}" alt="Foto de perfil" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="35" height="35" class="userProfile"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#00dfc4"/></svg>`;
    }
  }
  const messageInput = document.querySelector(".messageInput");
  if (messageInput) {
    messageInput.disabled = false;
    messageInput.placeholder = "Digite uma mensagem...";
    messageInput.focus();
  }
}

/**
 * Carrega as mensagens da conversa
 */
async function loadMessages(conversationId) {
  try {
    const messagesRef = collection(
      firestore,
      `conversations/${conversationId}/messages`
    );
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(50));
    const messagesSnapshot = await getDocs(q);
    chatState.messages = messagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    renderMessages();
    scrollToBottom();
    updateMessagesCache(conversationId); // Atualiza o cache das mensagens
  } catch (error) {
    console.error("Erro ao carregar mensagens:", error);
    showPopup("error", "Erro ao carregar mensagens");
  }
}

/**
 * Configura os listeners para atualizações das mensagens
 */
function setupMessagesListener(conversationId) {
  try {
    if (chatState.unsubscribeListeners.messages)
      chatState.unsubscribeListeners.messages();

    const messagesRef = ref(realtimeDb, `messages/${conversationId}`);
    const onNewMessage = onChildAdded(messagesRef, (snapshot) => {
      const messageData = snapshot.val();
      const messageId = snapshot.key;
      if (!chatState.messages.some((m) => m.id === messageId)) {
        chatState.messages.push({ id: messageId, ...messageData });
        renderMessages();
        scrollToBottom();
        updateMessagesCache(conversationId);
        if (
          messageData.senderId !== chatState.currentUser.uid &&
          messageData.status === "sent"
        ) {
          update(ref(realtimeDb, `messages/${conversationId}/${messageId}`), {
            status: "delivered",
          });
        }
      }
    });
    const onStatusChanged = onChildChanged(messagesRef, (snapshot) => {
      const messageData = snapshot.val();
      const messageId = snapshot.key;
      const messageIndex = chatState.messages.findIndex(
        (m) => m.id === messageId
      );
      if (messageIndex !== -1) {
        chatState.messages[messageIndex] = {
          ...chatState.messages[messageIndex],
          ...messageData,
        };
        renderMessages();
        updateMessagesCache(conversationId);
      }
    });
    chatState.unsubscribeListeners.messages = () => {
      onNewMessage();
      onStatusChanged();
    };
  } catch (error) {
    console.error("Erro ao configurar listener de mensagens:", error);
    showPopup("error", "Erro ao monitorar novas mensagens");
  }
}

/**
 * Renderiza as mensagens na interface
 */
function renderMessages() {
  const conversationArea = document.querySelector(".mainSelectedMensages");
  if (!conversationArea || !chatState.messages) return;
  conversationArea.innerHTML = "";

  if (chatState.messages.length === 0) {
    conversationArea.innerHTML = `<div class="empty-chat" style="display: flex; justify-content: center; align-items: center; height: 100%; flex-direction: column; color: #00dfc4; opacity: 0.7;">
      <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <p style="margin-top: 15px; text-align: center; padding: 0 20px;">Nenhuma mensagem ainda.<br>Seja o primeiro a dizer olá!</p>
    </div>`;
    return;
  }

  chatState.messages.forEach((message) => {
    const isMyMessage = message.senderId === chatState.currentUser.uid;
    const messageTime = formatTime(message.timestamp);
    const li = document.createElement("li");
    li.className = isMyMessage ? "myMensageSelected" : "userMensageSelected";
    let statusIcon = "";
    if (isMyMessage) {
      switch (message.status) {
        case "read":
          statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm-7.75 7.75L5.83 10.33 4.41 11.75l5.84 5.84 1.41-1.41-1.41-1.43zm3.84-3.84L7.67 4.41 6.25 5.83l6.42 6.42 1.42-1.42z" fill="#00dfc4"/></svg>`;
          break;
        case "delivered":
          statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm-7.75 7.75L5.83 10.33 4.41 11.75l5.84 5.84 1.41-1.41-1.41-1.43z" fill="#00dfc4"/></svg>`;
          break;
        case "sent":
          statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#00dfc4"/></svg>`;
          break;
        default:
          statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10" stroke="#00dfc4" stroke-width="1" fill="none"/><path d="M12 7v5l3 3" stroke="#00dfc4" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
      }
    } else {
      statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#1d2b3a"/></svg>`;
    }

    let messageContent =
      message.type === "text" ? message.text : "Mensagem não suportada";
    li.innerHTML = `<div class="messageWrapper"><span class="mensages">${messageContent}</span><div class="containerSettingMensages_icons"><span class="timeSend">${messageTime}</span><span class="checkedMensages">${statusIcon}</span></div></div>`;
    conversationArea.appendChild(li);
  });
}

/**
 * Envia uma mensagem na conversa ativa
 */
async function sendMessage(text) {
  try {
    if (!text.trim() || !chatState.activeConversation) return;
    const conversationId = chatState.activeConversation.id;
    const currentUserId = chatState.currentUser.uid;
    const messageInput = document.querySelector(".messageInput");
    if (messageInput) {
      messageInput.value = "";
      messageInput.focus();
    }
    const newMessage = {
      text: text.trim(),
      senderId: currentUserId,
      timestamp: Date.now(),
      status: "pending",
      type: "text",
    };
    const messagesRef = ref(realtimeDb, `messages/${conversationId}`);
    const newMessageRef = push(messagesRef);
    await set(newMessageRef, newMessage);
    const unreadCount = {};
    chatState.activeConversation.participants.forEach((participant) => {
      unreadCount[participant] =
        (chatState.activeConversation.unreadCount?.[participant] || 0) +
        (participant === currentUserId ? 0 : 1);
    });
    const conversationRef = doc(firestore, "conversations", conversationId);
    await updateDoc(conversationRef, {
      lastMessage: text.trim(),
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unreadCount,
    });
    setTimeout(async () => {
      await update(
        ref(realtimeDb, `messages/${conversationId}/${newMessageRef.key}`),
        { status: "sent" }
      );
      await addDoc(
        collection(firestore, `conversations/${conversationId}/messages`),
        {
          text: text.trim(),
          senderId: currentUserId,
          timestamp: Timestamp.fromDate(new Date(newMessage.timestamp)),
          status: "sent",
          type: "text",
        }
      );
    }, 500);
    // Atualiza a lista de conversas para refletir a nova mensagem
    const updatedConversation = await getDoc(conversationRef);
    const conversationIndex = chatState.conversations.findIndex(
      (conv) => conv.id === conversationId
    );
    if (conversationIndex !== -1) {
      chatState.conversations[conversationIndex] = {
        id: conversationId,
        ...updatedConversation.data(),
      };
      updateConversationsCache();
    }
    renderContacts();
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    showPopup("error", "Erro ao enviar mensagem");
  }
}

/**
 * Rola a conversa para o final
 */
function scrollToBottom() {
  const conversationArea = document.querySelector(".mainSelectedMensages");
  if (conversationArea)
    conversationArea.scrollTop = conversationArea.scrollHeight;
}

/**
 * Exibe a visualização da conversa ativa
 */
function showConversationView() {
  const selectedChat = document.querySelector(".SelectedMensages");
  const notSelectedChat = document.querySelector(".notSelectedMensages");
  if (selectedChat) selectedChat.style.display = "flex";
  if (notSelectedChat) notSelectedChat.style.display = "none";
  adjustLayout();
}

/**
 * Volta para a lista de contatos (em telas pequenas)
 */
function handleBackToContacts() {
  if (window.innerWidth <= 700) {
    const containerUserChat = document.querySelector(".containerUserChat");
    const containerMain = document.querySelector("#containerMain");
    if (containerUserChat) containerUserChat.style.display = "flex";
    if (containerMain) containerMain.style.display = "none";
  }
}

/**
 * Ajusta o layout conforme o tamanho da tela
 */
function adjustLayout() {
  if (window.innerWidth <= 700 && chatState.activeConversation) {
    const containerUserChat = document.querySelector(".containerUserChat");
    const containerMain = document.querySelector("#containerMain");
    if (containerUserChat) containerUserChat.style.display = "none";
    if (containerMain) containerMain.style.display = "block";
  }
}

/**
 * Diálogo para iniciar nova conversa
 */
async function showNewChatDialog() {
  try {
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.7); z-index: 10000; display: flex; justify-content: center; align-items: center;";

    const dialog = document.createElement("div");
    dialog.style.cssText =
      "background-color: #1d2b3a; border-radius: 10px; padding: 20px; width: 90%; max-width: 400px; max-height: 80vh; overflow: auto; color: #fff;";

    const header = document.createElement("div");
    header.style.cssText =
      "display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #00dfc4; padding-bottom: 10px;";
    header.innerHTML =
      '<h3 style="margin: 0;">Nova conversa</h3><button style="background: none; border: none; color: #00dfc4; font-size: 24px; cursor: pointer;">×</button>';

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Procurar usuário...";
    searchInput.style.cssText =
      "width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box; margin-bottom: 15px;";

    const usersList = document.createElement("div");
    usersList.style.cssText =
      "display: flex; flex-direction: column; gap: 10px;";

    async function renderUsersList(searchTerm = "") {
      const users = await getAllUsers(chatState.currentUser.uid, searchTerm);
      usersList.innerHTML = "";
      if (users.length === 0) {
        usersList.innerHTML = `<div style="text-align: center; padding: 20px; color: #00dfc4;">Nenhum usuário encontrado</div>`;
        return;
      }
      users.forEach((user) => {
        const userItem = document.createElement("div");
        userItem.style.cssText =
          "display: flex; align-items: center; padding: 10px; border-radius: 5px; cursor: pointer; background-color: rgba(0, 223, 196, 0.1); transition: background-color: 0.2s;";
        userItem.innerHTML = `
          <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-right: 10px; border: 1px solid #00dfc4; background-color: rgba(0, 0, 0, 0.2);">
            ${
              user.photoURL
                ? `<img src="${user.photoURL}" alt="${user.name}" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
            }
          </div>
          <div style="flex-grow: 1;">
            <div style="font-weight: bold;">${user.name}</div>
            <div style="font-size: 0.8em; opacity: 0.7;">${
              user.email || user.userType || ""
            }</div>
          </div>
          <div style="display: flex; align-items: center;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${
              user.isOnline ? "#4CAF50" : "#ccc"
            }; margin-right: 5px;"></span>
          </div>
        `;
        userItem.addEventListener("click", async () => {
          document.body.removeChild(backdrop);
          await createConversation(user.id);
          renderContacts(); // Atualiza a lista de conversas após criar uma nova
          showConversationView();
        });
        usersList.appendChild(userItem);
      });
    }

    searchInput.addEventListener("input", () =>
      renderUsersList(searchInput.value.trim())
    );
    renderUsersList();

    dialog.appendChild(header);
    dialog.appendChild(searchInput);
    dialog.appendChild(usersList);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    header
      .querySelector("button")
      .addEventListener("click", () => document.body.removeChild(backdrop));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) document.body.removeChild(backdrop);
    });
  } catch (error) {
    console.error("Erro ao mostrar diálogo de nova conversa:", error);
    showPopup("error", "Erro ao mostrar diálogo");
  }
}

/**
 * Exibe o diálogo de criação de grupo e implementa toda a funcionalidade:
 * - Permite definir nome do grupo
 * - Permite pesquisar e selecionar múltiplos usuários da app
 * - Cria o grupo com os participantes selecionados, incluindo o usuário atual
 */
async function showCreateGroupDialog() {
  try {
    // Cria backdrop do modal
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10000; display: flex; justify-content: center; align-items: center;";

    // Cria o container do diálogo
    const dialog = document.createElement("div");
    dialog.style.cssText =
      "background-color: #1d2b3a; border-radius: 10px; padding: 20px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; color: #fff;";

    // Cabeçalho do diálogo com título e botão fechar
    const header = document.createElement("div");
    header.style.cssText =
      "display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #00dfc4; padding-bottom: 10px;";
    header.innerHTML =
      '<h3 style="margin: 0;">Criar Grupo</h3><button style="background: none; border: none; color: #00dfc4; font-size: 24px; cursor: pointer;">×</button>';

    // Input para o nome do grupo
    const groupNameInput = document.createElement("input");
    groupNameInput.type = "text";
    groupNameInput.placeholder = "Nome do grupo";
    groupNameInput.style.cssText =
      "width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box; margin-bottom: 15px;";

    // Input para pesquisar usuários
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Buscar usuários...";
    searchInput.style.cssText =
      "width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box; margin-bottom: 15px;";

    // Área para exibir resultados da pesquisa
    const resultsContainer = document.createElement("div");
    resultsContainer.style.cssText =
      "display: flex; flex-direction: column; gap: 10px; max-height: 200px; overflow-y: auto; margin-bottom: 15px;";

    // Área para exibir os usuários selecionados
    const selectedContainer = document.createElement("div");
    selectedContainer.style.cssText =
      "display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 15px;";

    // Array para armazenar os usuários selecionados
    let selectedUsers = [];

    // Função para renderizar os usuários selecionados
    function renderSelectedUsers() {
      selectedContainer.innerHTML = "";
      selectedUsers.forEach((user) => {
        const userTag = document.createElement("div");
        userTag.style.cssText =
          "background-color: #00dfc4; color: #1d2b3a; padding: 5px 10px; border-radius: 15px; font-size: 0.9em; display: flex; align-items: center;";
        userTag.textContent = user.name;

        // Botão para remover o usuário da seleção
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×";
        removeBtn.style.cssText =
          "background: none; border: none; margin-left: 5px; cursor: pointer; color: #1d2b3a;";
        removeBtn.addEventListener("click", () => {
          selectedUsers = selectedUsers.filter((u) => u.id !== user.id);
          renderSelectedUsers();
        });
        userTag.appendChild(removeBtn);
        selectedContainer.appendChild(userTag);
      });
    }

    // Função que busca usuários da app e renderiza resultados
    async function renderUserResults(searchTerm = "") {
      try {
        // Utiliza a função getAllUsers para buscar todos os usuários, exceto o atual
        const users = await getAllUsers(chatState.currentUser.uid, searchTerm);
        resultsContainer.innerHTML = "";
        if (users.length === 0) {
          resultsContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #00dfc4;">Nenhum usuário encontrado</div>`;
          return;
        }
        users.forEach((user) => {
          // Cria o item para cada usuário
          const userItem = document.createElement("div");
          userItem.style.cssText =
            "display: flex; align-items: center; padding: 10px; border-radius: 5px; cursor: pointer; background-color: rgba(0,223,196,0.1); transition: background-color 0.2s;";
          userItem.innerHTML = `
              <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-right: 10px; border: 1px solid #00dfc4; background-color: rgba(0,0,0,0.2);">
                ${
                  user.photoURL
                    ? `<img src="${user.photoURL}" alt="${user.name}" style="width:100%; height:100%; object-fit: cover;">`
                    : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
                }
              </div>
              <div style="flex-grow: 1;">
                <div style="font-weight: bold;">${user.name}</div>
                <div style="font-size: 0.8em; opacity: 0.7;">${
                  user.email || user.userType || ""
                }</div>
              </div>
              <div style="display: flex; align-items: center;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${
                  user.isOnline ? "#4CAF50" : "#ccc"
                }; margin-right: 5px;"></span>
              </div>
            `;

          // Ao clicar, adiciona o usuário se ainda não estiver selecionado
          userItem.addEventListener("click", () => {
            if (!selectedUsers.find((u) => u.id === user.id)) {
              selectedUsers.push(user);
              renderSelectedUsers();
            }
          });
          resultsContainer.appendChild(userItem);
        });
      } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        showPopup("error", "Erro ao buscar usuários");
      }
    }

    // Atualiza os resultados sempre que o usuário digitar
    searchInput.addEventListener("input", () =>
      renderUserResults(searchInput.value.trim())
    );

    // Renderiza resultados sem filtro inicial
    renderUserResults();

    // Cria botão para finalizar a criação do grupo
    const createGroupBtn = document.createElement("button");
    createGroupBtn.textContent = "Criar Grupo";
    createGroupBtn.style.cssText =
      "width: 100%; padding: 10px; border: none; border-radius: 5px; background-color: #00dfc4; color: #1d2b3a; cursor: pointer; font-size: 1em;";
    createGroupBtn.addEventListener("click", async () => {
      const groupName = groupNameInput.value.trim();
      if (!groupName) {
        showPopup("error", "Informe o nome do grupo.");
        return;
      }
      if (selectedUsers.length === 0) {
        showPopup(
          "error",
          "Selecione pelo menos um usuário para adicionar ao grupo."
        );
        return;
      }
      // Inclui o usuário atual automaticamente aos participantes
      const participants = [
        chatState.currentUser.uid,
        ...selectedUsers.map((u) => u.id),
      ];
      const groupData = {
        name: groupName,
        participants,
        isGroup: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        // Cria o documento da conversa de grupo no Firestore
        const docRef = await addDoc(
          collection(firestore, "conversations"),
          groupData
        );
        const newGroup = { id: docRef.id, ...groupData };
        // Atualiza a lista de conversas e o cache
        chatState.conversations.unshift(newGroup);
        updateConversationsCache();
        renderContacts();
        showPopup("success", "Grupo criado com sucesso!");
        // Abre a conversa recém-criada para o usuário
        chatState.activeConversation = newGroup;
        await openConversation(newGroup.id);
        showConversationView();
      } catch (error) {
        console.error("Erro ao criar grupo:", error);
        showPopup("error", "Erro ao criar grupo");
      }

      // Remove o diálogo da tela
      document.body.removeChild(backdrop);
    });

    // Adiciona os elementos ao container do diálogo
    dialog.appendChild(header);
    dialog.appendChild(groupNameInput);
    dialog.appendChild(searchInput);
    dialog.appendChild(resultsContainer);
    dialog.appendChild(selectedContainer);
    dialog.appendChild(createGroupBtn);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    // Eventos para fechar o diálogo
    header
      .querySelector("button")
      .addEventListener("click", () => document.body.removeChild(backdrop));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) document.body.removeChild(backdrop);
    });
  } catch (error) {
    console.error("Erro ao mostrar diálogo de criação de grupo:", error);
    showPopup("error", "Erro ao mostrar diálogo de criação de grupo");
  }
}
