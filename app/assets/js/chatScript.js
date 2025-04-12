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
 * Application state for chat functionality
 * Enhanced with better caching and state management
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
    userStatus: {},
  },
  isLoading: {
    contacts: true,
    messages: false,
    search: false,
  },
  searchCache: {},
  lastSeenTimestamps: {},
};

/**
 * Enhanced cache functions using localStorage with versioning and TTL
 */
const cacheManager = {
  version: "v1.1",
  ttl: 24 * 60 * 60 * 1000, // 24 hours cache TTL

  getKey(key) {
    return `chat_${this.version}_${key}`;
  },

  // Set cache with TTL
  set(key, data) {
    try {
      const cacheItem = {
        timestamp: Date.now(),
        data,
      };
      localStorage.setItem(this.getKey(key), JSON.stringify(cacheItem));
      return true;
    } catch (e) {
      console.error(`Cache error (${key}):`, e);
      return false;
    }
  },

  // Get cache with TTL validation
  get(key) {
    try {
      const cached = localStorage.getItem(this.getKey(key));
      if (!cached) return null;

      const cacheItem = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is expired
      if (now - cacheItem.timestamp > this.ttl) {
        localStorage.removeItem(this.getKey(key));
        return null;
      }

      return cacheItem.data;
    } catch (e) {
      console.error(`Cache retrieval error (${key}):`, e);
      return null;
    }
  },

  // Remove specific cache
  remove(key) {
    try {
      localStorage.removeItem(this.getKey(key));
      return true;
    } catch (e) {
      console.error(`Cache removal error (${key}):`, e);
      return false;
    }
  },

  // Load conversations from cache
  loadConversations() {
    const cached = this.get("conversations");
    if (cached) {
      chatState.conversations = cached;
      renderContacts();
      return true;
    }
    return false;
  },

  // Save conversations to cache
  saveConversations() {
    return this.set("conversations", chatState.conversations);
  },

  // Load messages for a specific conversation
  loadMessages(conversationId) {
    const cached = this.get(`messages_${conversationId}`);
    if (cached) {
      chatState.messages = cached;
      renderMessages();
      scrollToBottom();
      return true;
    }
    return false;
  },

  // Save messages for a specific conversation
  saveMessages(conversationId) {
    return this.set(`messages_${conversationId}`, chatState.messages);
  },

  // Save user data to cache
  saveUserData(userId, userData) {
    return this.set(`user_${userId}`, userData);
  },

  // Load user data from cache
  loadUserData(userId) {
    return this.get(`user_${userId}`);
  },

  // Save last seen timestamps to sync across sessions
  saveLastSeen() {
    return this.set("lastSeen", chatState.lastSeenTimestamps);
  },

  // Load last seen timestamps
  loadLastSeen() {
    const cached = this.get("lastSeen");
    if (cached) {
      chatState.lastSeenTimestamps = cached;
      return true;
    }
    return false;
  },
};

/**
 * Utility function to process timestamps
 */
const timeUtils = {
  // Format time as HH:MM
  formatTime(timestamp) {
    if (!timestamp) return "";

    let date;
    try {
      if (timestamp instanceof Timestamp) {
        date = timestamp.toDate();
      } else if (typeof timestamp === "number") {
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === "object" && timestamp.seconds) {
        // Tenta converter um objeto estilo Firestore timestamp
        date = new Date(timestamp.seconds * 1000);
      } else {
        console.warn("Timestamp inválido:", timestamp);
        return "";
      }

      // Verifica se date é uma data válida antes de chamar toLocaleTimeString
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        console.warn("Data inválida após conversão:", date);
        return "";
      }

      return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      console.error("Erro ao formatar timestamp:", error, timestamp);
      return "";
    }
  },

  // Format date for messages, showing relative time or date as needed
  formatMessageDate(timestamp) {
    if (!timestamp) return "";

    let date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === "number") {
      date = new Date(timestamp);
    } else {
      date = timestamp;
    }

    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const yesterday = today - 86400000;
    const messageDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ).getTime();

    if (messageDate >= today) {
      return "Hoje";
    } else if (messageDate >= yesterday) {
      return "Ontem";
    } else {
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
    }
  },

  // Get time passed since a given timestamp in human-readable format
  getTimeSince(timestamp) {
    if (!timestamp) return "";

    let date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === "number") {
      date = new Date(timestamp);
    } else {
      date = timestamp;
    }

    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));

    if (diffMinutes < 1) return "agora";
    if (diffMinutes < 60) return `${diffMinutes}m`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
  },
};

/**
 * Initialize chat application
 */
document.addEventListener("DOMContentLoaded", () => {
  try {
    initChatElements();
    setupAuth();

    // Try to show cached data first for instant loading
    cacheManager.loadConversations();
    cacheManager.loadLastSeen();

    // Set up back button to index page
    const backIndexButton = document.getElementById("backIndex");
    if (backIndexButton) {
      backIndexButton.addEventListener("click", () => {
        window.location.href = "./index.html"; // Adjust path if needed
      });
    }

    // Set up profile photo change
    const profilePhotoButton = document.querySelector(".imgProfile");
    const profilePhotoInput = document.getElementById("profilePhoto");

    if (profilePhotoButton && profilePhotoInput) {
      profilePhotoButton.addEventListener("click", () => {
        profilePhotoInput.click();
      });

      profilePhotoInput.addEventListener("change", handleProfilePhotoChange);
    }
  } catch (error) {
    console.error("Chat initialization error:", error);
    showPopup("error", "Erro ao iniciar o chat. Tente atualizar a página.");
  }
});

/**
 * Handle profile photo change
 */
async function handleProfilePhotoChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    showPopup("info", "Atualizando foto de perfil...");

    // Here you would implement the logic to upload the photo to Firebase Storage
    // and update the user's profile

    showPopup(
      "success",
      "Funcionalidade de troca de foto será implementada em breve!"
    );
  } catch (error) {
    console.error("Error changing profile photo:", error);
    showPopup("error", "Erro ao atualizar foto de perfil.");
  }
}

/**
 * Initialize UI elements and add event listeners
 */
function initChatElements() {
  // Search functionality
  const searchInput = document.getElementById("searchUser");
  const clearSearchButton = document.querySelector(".clearSearchButton");

  if (searchInput) {
    // Use debounce for search to avoid excessive queries
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);

      // Show/hide clear button
      if (e.target.value.trim() !== "") {
        if (clearSearchButton) clearSearchButton.style.display = "block";
      } else {
        if (clearSearchButton) clearSearchButton.style.display = "none";
      }

      searchTimeout = setTimeout(() => handleSearch(e.target.value), 300);
    });
  }

  // Clear search button
  if (clearSearchButton) {
    clearSearchButton.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
        clearSearchButton.style.display = "none";
        renderContacts(); // Show original contacts list
      }
    });
  }

  // Message sending
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

    // Add typing indicator
    messageInput.addEventListener("input", handleTypingEvent);
  }

  // Navigation and UI buttons
  const backButton = document.querySelector(".backButtonMensages");
  if (backButton) {
    // Inicialmente esconde o botão de voltar, a visibilidade será controlada pela função updateBackButtonVisibility
    updateBackButtonVisibility();
    backButton.addEventListener("click", handleBackToContacts);
  }

  // Create chat and group buttons
  const createChatButton = document.querySelector(".createChat");
  if (createChatButton)
    createChatButton.addEventListener("click", showNewChatDialog);

  const createGroupButton = document.querySelector(".createGroup");
  if (createGroupButton)
    createGroupButton.addEventListener("click", showCreateGroupDialog);

  // Additional chat features buttons
  const attachButton = document.querySelector(".attachButton");
  const emojiButton = document.querySelector(".emojiButton");
  const voiceButton = document.querySelector(".voiceButton");

  if (attachButton)
    attachButton.addEventListener("click", showAttachmentOptions);
  if (emojiButton) emojiButton.addEventListener("click", showEmojiSelector);
  if (voiceButton) voiceButton.addEventListener("click", toggleVoiceRecording);

  // Setup responsive layout behavior
  window.addEventListener("resize", () => {
    adjustLayout();
    updateBackButtonVisibility();
  });

  // Add scroll event listener for messages container for lazy loading
  const messagesContainer = document.querySelector(".mainSelectedMensages");
  if (messagesContainer) {
    messagesContainer.addEventListener("scroll", handleMessagesScroll);
  }

  // Setup notification permission request
  requestNotificationPermission();

  // Setup online/offline status detection
  setupConnectionStatusListener();
}

/**
 * Handle search functionality
 */
function handleSearch(searchTerm) {
  const contactsList = document.getElementById("menu");
  if (!contactsList) return;

  if (!searchTerm || searchTerm.trim() === "") {
    renderContacts(); // Show original contacts
    return;
  }

  renderSearchResults(contactsList, searchTerm.trim());
}

/**
 * Update back button visibility based on screen size
 */
function updateBackButtonVisibility() {
  const backButton = document.querySelector(".backButtonMensages");
  if (backButton) {
    if (window.innerWidth <= 700) {
      backButton.style.display = "flex"; // ou "block" dependendo do estilo original
    } else {
      backButton.style.display = "none";
    }
  }
}

/**
 * Request notification permission
 */
async function requestNotificationPermission() {
  try {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      console.log("Notification permission:", permission);
    }
  } catch (error) {
    console.error("Error requesting notification permission:", error);
  }
}

/**
 * Setup connection status listener
 */
function setupConnectionStatusListener() {
  window.addEventListener("online", handleConnectionChange);
  window.addEventListener("offline", handleConnectionChange);
}

/**
 * Handle connection status change
 */
async function handleConnectionChange(e) {
  const isOnline = navigator.onLine;
  console.log(`Connection status: ${isOnline ? "online" : "offline"}`);

  if (isOnline && chatState.currentUser) {
    // Reconnect and update online status
    await updateOnlineStatus(chatState.currentUser.uid, true);
    showPopup("success", "Conexão restabelecida!", 2000);

    // Re-initialize listeners if they were broken
    setupConversationsListener();
    if (chatState.activeConversation) {
      setupMessagesListener(chatState.activeConversation.id);
    }
  } else if (!isOnline) {
    showPopup(
      "warning",
      "Sem conexão. Algumas funções podem não estar disponíveis.",
      3000
    );
  }
}

/**
 * Handle typing events to show typing indicator to other users
 */
let typingTimeout;
async function handleTypingEvent() {
  if (!chatState.activeConversation || !chatState.currentUser) return;

  const typingRef = ref(
    realtimeDb,
    `typing/${chatState.activeConversation.id}/${chatState.currentUser.uid}`
  );

  // Set typing status
  await set(typingRef, {
    isTyping: true,
    timestamp: Date.now(),
  });

  // Clear previous timeout
  clearTimeout(typingTimeout);

  // Set timeout to clear typing status after 3 seconds of inactivity
  typingTimeout = setTimeout(async () => {
    await set(typingRef, {
      isTyping: false,
      timestamp: Date.now(),
    });
  }, 3000);
}

/**
 * Setup typing indicators listeners
 */
function setupTypingIndicatorsListener(conversationId) {
  if (!conversationId) return;

  const typingRef = ref(realtimeDb, `typing/${conversationId}`);

  return onValue(typingRef, (snapshot) => {
    const typingData = snapshot.val() || {};

    // Filter out current user and find users who are typing
    const typingUsers = Object.entries(typingData)
      .filter(
        ([userId, data]) =>
          userId !== chatState.currentUser.uid &&
          data.isTyping === true &&
          Date.now() - data.timestamp < 10000 // Only consider typing if within last 10 seconds
      )
      .map(([userId]) => userId);

    if (typingUsers.length > 0) {
      showTypingIndicator(typingUsers);
    } else {
      hideTypingIndicator();
    }
  });
}

/**
 * Show typing indicator in the UI
 */
function showTypingIndicator(userIds) {
  const typingIndicator = document.querySelector(".typingIndicator");
  if (!typingIndicator) return;

  // Set display to flex to show it
  typingIndicator.style.display = "flex";

  // Get user names for users who are typing
  Promise.all(
    userIds.map(async (userId) => {
      // Try to get from cache first
      let userData = chatState.usersCache[userId];

      if (!userData) {
        userData = await fetchUserData(userId);
        chatState.usersCache[userId] = userData;
      }

      return userData?.name || "Alguém";
    })
  ).then((names) => {
    let text = "";
    if (names.length === 1) {
      text = `${names[0]} está digitando...`;
    } else if (names.length === 2) {
      text = `${names[0]} e ${names[1]} estão digitando...`;
    } else {
      text = "Várias pessoas estão digitando...";
    }

    const typingText = typingIndicator.querySelector(".typingText");
    if (typingText) {
      typingText.textContent = text;
    }
  });
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator() {
  const typingIndicator = document.querySelector(".typingIndicator");
  if (typingIndicator) {
    typingIndicator.style.display = "none";
  }
}

/**
 * Handle messages container scroll for lazy loading older messages
 */
let isLoadingMoreMessages = false;
async function handleMessagesScroll(e) {
  const container = e.target;

  // If user scrolls near the top and we're not already loading, load more messages
  if (
    container.scrollTop < 50 &&
    !isLoadingMoreMessages &&
    chatState.activeConversation
  ) {
    const conversationId = chatState.activeConversation.id;
    isLoadingMoreMessages = true;

    // Show loading indicator at the top
    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "messages-loading-more";
    loadingIndicator.innerHTML = `
      <div style="text-align: center; padding: 10px; color: #00dfc4;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid">
          <circle cx="50" cy="50" r="32" stroke-width="8" stroke="#00dfc4" stroke-dasharray="50.26548245743669 50.26548245743669" fill="none" stroke-linecap="round">
            <animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" keyTimes="0;1" values="0 50 50;360 50 50"></animateTransform>
          </circle>
        </svg>
        <span style="margin-left: 5px;">Carregando mensagens anteriores...</span>
      </div>
    `;

    const messagesList = document.querySelector(".mainSelectedMensages");
    if (messagesList) {
      const scrollHeight = messagesList.scrollHeight;
      messagesList.prepend(loadingIndicator);

      try {
        // Get the oldest message timestamp to use as a cursor
        const oldestMessage = chatState.messages[0];

        if (oldestMessage && oldestMessage.timestamp) {
          // Load older messages before the oldest one currently displayed
          const oldestTimestamp = oldestMessage.timestamp;

          // Load 20 more messages before this one
          const olderMessages = await loadOlderMessages(
            conversationId,
            oldestTimestamp,
            20 // Passa o número diretamente, agora recebido como 'messageLimit'
          );

          // If we have older messages, add them to the state and rerender
          if (olderMessages && olderMessages.length > 0) {
            // Keep the original scroll position
            const newMessages = [...olderMessages, ...chatState.messages];
            chatState.messages = newMessages;

            // Remove the loading indicator
            loadingIndicator.remove();

            // Rerender messages
            renderMessages();

            // Adjust the scroll position to maintain the same view
            const newScrollHeight = messagesList.scrollHeight;
            messagesList.scrollTop = newScrollHeight - scrollHeight;

            // Update the cache with the new messages
            cacheManager.saveMessages(conversationId);
          } else {
            // No more messages to load
            loadingIndicator.innerHTML = `
              <div style="text-align: center; padding: 10px; color: #00dfc4;">
                Não há mais mensagens anteriores
              </div>
            `;

            // Remove the loading indicator after 2 seconds
            setTimeout(() => {
              loadingIndicator.remove();
            }, 2000);
          }
        }
      } catch (error) {
        console.error("Error loading more messages:", error);
        loadingIndicator.innerHTML = `
          <div style="text-align: center; padding: 10px; color: #f44336;">
            Erro ao carregar mensagens anteriores
          </div>
        `;

        // Remove the loading indicator after 2 seconds
        setTimeout(() => {
          loadingIndicator.remove();
        }, 2000);
      } finally {
        isLoadingMoreMessages = false;
      }
    }
  }
}

/**
 * Load older messages from Firestore for infinite scrolling
 */
async function loadOlderMessages(
  conversationId,
  beforeTimestamp,
  messageLimit = 20
) {
  try {
    // Convert timestamp if needed
    let timestampToQuery;
    if (beforeTimestamp instanceof Timestamp) {
      timestampToQuery = beforeTimestamp;
    } else if (typeof beforeTimestamp === "number") {
      timestampToQuery = Timestamp.fromMillis(beforeTimestamp);
    } else {
      timestampToQuery = Timestamp.fromDate(beforeTimestamp);
    }

    // Query for older messages
    const messagesRef = collection(
      firestore,
      `conversations/${conversationId}/messages`
    );
    const q = query(
      messagesRef,
      where("timestamp", "<", timestampToQuery),
      orderBy("timestamp", "desc"),
      limit(messageLimit) // 'limit' agora é a função importada, 'messageLimit' é o parâmetro
    );

    const messagesSnapshot = await getDocs(q);

    // Convert and return messages in chronological order
    const olderMessages = messagesSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .reverse(); // Reverse to get chronological order

    return olderMessages;
  } catch (error) {
    console.error("Error loading older messages:", error);
    throw error;
  }
}

/**
 * Enhanced setup for authentication and user state
 */
function setupAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        // Load user data from Firestore or cache
        let userData = cacheManager.loadUserData(user.uid);

        if (userData) {
          // We have cached data, use it first for instant display
          chatState.currentUser = { ...user, ...userData };
          updateUserUI(chatState.currentUser);
        }

        // Get fresh data from Firestore
        const userDoc = await getDoc(doc(firestore, "users", user.uid));

        if (userDoc.exists()) {
          userData = userDoc.data();
          chatState.currentUser = { ...user, ...userData };

          // Update the cache with fresh data
          cacheManager.saveUserData(user.uid, userData);
        } else {
          // If user document doesn't exist yet, initialize it
          const newUserData = {
            name: user.displayName || "User",
            email: user.email,
            photoURL: user.photoURL,
            createdAt: serverTimestamp(),
            isOnline: true,
            lastSeen: serverTimestamp(),
          };

          await setDoc(doc(firestore, "users", user.uid), newUserData);
          chatState.currentUser = { ...user, ...newUserData };
        }

        // Update UI with latest data
        updateUserUI(chatState.currentUser);

        // Set online status and setup offline cleanup
        await updateOnlineStatus(user.uid, true);

        window.addEventListener("beforeunload", async (e) => {
          // We need to use synchronous localStorage to ensure data is saved before unload
          if (chatState.lastSeenTimestamps) {
            try {
              localStorage.setItem(
                "chat_v1.1_lastSeen",
                JSON.stringify({
                  timestamp: Date.now(),
                  data: chatState.lastSeenTimestamps,
                })
              );
            } catch (error) {
              console.error("Error saving last seen data:", error);
            }
          }

          // Update online status
          await updateOnlineStatus(user.uid, false);
        });

        // Load contacts and conversations
        chatState.contacts = await getUserContacts(chatState.currentUser.uid);
        setupConversationsListener();
        setupUserStatusListener(user.uid);

        // Mark app as initialized
        document.body.classList.add("app-initialized");
      } catch (error) {
        console.error("Error initializing chat:", error);
        showPopup("error", "Erro ao carregar dados do chat");
      }
    } else {
      // User is not authenticated, redirect to login
      window.location.href = "../splash.html";
    }
  });
}

/**
 * Attach file to message (image, document, etc.)
 */
function showAttachmentOptions() {
  const attachOptions = document.createElement("div");
  attachOptions.className = "attach-options";
  attachOptions.style.cssText =
    "position: absolute; bottom: 70px; left: 20px; background-color: #1d2b3a; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.3); padding: 10px; display: flex; flex-direction: column; z-index: 100;";

  const options = [
    {
      icon: "image",
      label: "Imagem",
      action: () => document.getElementById("attachImage").click(),
    },
    {
      icon: "file",
      label: "Documento",
      action: () => document.getElementById("attachDocument").click(),
    },
    { icon: "camera", label: "Câmera", action: handleCameraCapture },
    { icon: "map-pin", label: "Localização", action: handleLocationShare },
  ];

  options.forEach((option) => {
    const button = document.createElement("button");
    button.style.cssText =
      "display: flex; align-items: center; background: none; border: none; color: white; padding: 10px; cursor: pointer; transition: background-color 0.2s;";
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-${
        option.icon
      }">
        ${getIconPath(option.icon)}
      </svg>
      <span style="margin-left: 10px;">${option.label}</span>
    `;

    button.addEventListener("mouseenter", () => {
      button.style.backgroundColor = "rgba(0, 223, 196, 0.1)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.backgroundColor = "transparent";
    });

    button.addEventListener("click", () => {
      document.body.removeChild(attachOptions);
      option.action();
    });

    attachOptions.appendChild(button);
  });

  // Create hidden file inputs
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.id = "attachImage";
  imageInput.accept = "image/*";
  imageInput.style.display = "none";
  imageInput.addEventListener("change", handleImageAttachment);

  const documentInput = document.createElement("input");
  documentInput.type = "file";
  documentInput.id = "attachDocument";
  documentInput.style.display = "none";
  documentInput.addEventListener("change", handleDocumentAttachment);

  attachOptions.appendChild(imageInput);
  attachOptions.appendChild(documentInput);

  // Close when clicking outside
  document.addEventListener("click", function closeAttachOptions(e) {
    if (
      !attachOptions.contains(e.target) &&
      e.target !== document.querySelector(".attachButton")
    ) {
      if (document.body.contains(attachOptions)) {
        document.body.removeChild(attachOptions);
      }
      document.removeEventListener("click", closeAttachOptions);
    }
  });

  document.body.appendChild(attachOptions);

  // Helper function to get SVG path for icons
  function getIconPath(icon) {
    switch (icon) {
      case "image":
        return '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>';
      case "file":
        return '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>';
      case "camera":
        return '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>';
      case "map-pin":
        return '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>';
      default:
        return "";
    }
  }
}

/**
 * Handle image attachment selection
 */
async function handleImageAttachment(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showPopup("error", "Por favor, selecione uma imagem válida.");
    return;
  }

  // Reset the input for future selections
  e.target.value = "";

  try {
    showPopup("info", "Preparando imagem para envio...");

    // Use a better approach - preview the image first
    previewImageBeforeSend(file);
  } catch (error) {
    console.error("Error handling image attachment:", error);
    showPopup("error", "Erro ao processar imagem.");
  }
}

/**
 * Preview image before sending
 */
function previewImageBeforeSend(file) {
  const reader = new FileReader();

  reader.onload = (e) => {
    const preview = document.createElement("div");
    preview.className = "image-preview-container";
    preview.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.8); z-index: 10000; display: flex; flex-direction: column; justify-content: center; align-items: center;";

    // Main content container
    const content = document.createElement("div");
    content.style.cssText =
      "background-color: #1d2b3a; border-radius: 10px; padding: 20px; width: 90%; max-width: 500px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;";

    // Header
    const header = document.createElement("div");
    header.style.cssText =
      "display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;";
    header.innerHTML = `
      <h3 style="margin: 0; color: #fff;">Enviar imagem</h3>
      <button class="close-preview" style="background: none; border: none; color: #00dfc4; font-size: 24px; cursor: pointer;">×</button>
    `;

    // Image preview
    const imageContainer = document.createElement("div");
    imageContainer.style.cssText =
      "display: flex; justify-content: center; margin-bottom: 15px; max-height: 300px; overflow: hidden;";
    imageContainer.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 300px; object-fit: contain;">`;

    // Caption input
    const captionContainer = document.createElement("div");
    captionContainer.style.cssText = "margin-bottom: 20px;";
    captionContainer.innerHTML = `
      <label style="display: block; margin-bottom: 5px; color: #fff;">Adicionar legenda (opcional)</label>
      <input type="text" class="image-caption" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box;">
    `;

    // Buttons
    const buttons = document.createElement("div");
    buttons.style.cssText =
      "display: flex; justify-content: flex-end; gap: 10px;";
    buttons.innerHTML = `
      <button class="cancel-send" style="padding: 10px 15px; border-radius: 5px; border: 1px solid #00dfc4; background-color: transparent; color: #00dfc4; cursor: pointer;">Cancelar</button>
      <button class="confirm-send" style="padding: 10px 15px; border-radius: 5px; border: none; background-color: #00dfc4; color: #1d2b3a; cursor: pointer;">Enviar</button>
    `;

    // Assemble the preview
    content.appendChild(header);
    content.appendChild(imageContainer);
    content.appendChild(captionContainer);
    content.appendChild(buttons);
    preview.appendChild(content);

    // Add event listeners
    preview.querySelector(".close-preview").addEventListener("click", () => {
      document.body.removeChild(preview);
    });

    preview.querySelector(".cancel-send").addEventListener("click", () => {
      document.body.removeChild(preview);
    });

    preview
      .querySelector(".confirm-send")
      .addEventListener("click", async () => {
        const caption = preview.querySelector(".image-caption").value.trim();
        document.body.removeChild(preview);

        // Here you would upload the image and send the message
        showPopup(
          "info",
          "Funcionalidade de envio de imagens será implementada em breve!"
        );

        // This is a placeholder - in a real implementation, you would upload the image to Firebase Storage
        // and then send a message with the image URL and optional caption
      });

    document.body.appendChild(preview);
  };

  reader.readAsDataURL(file);
}

/**
 * Handle document attachment selection
 */
function handleDocumentAttachment(e) {
  // Placeholder for document attachment functionality
  showPopup(
    "info",
    "Funcionalidade de envio de documentos será implementada em breve!"
  );
}

/**
 * Handle camera capture
 */
function handleCameraCapture() {
  // Placeholder for camera functionality
  showPopup("info", "Funcionalidade de câmera será implementada em breve!");
}

/**
 * Handle location sharing
 */
function handleLocationShare() {
  // Placeholder for location sharing functionality
  showPopup(
    "info",
    "Funcionalidade de compartilhamento de localização será implementada em breve!"
  );
}

/**
 * Show emoji selector
 */
function showEmojiSelector() {
  const emojiSelector = document.createElement("div");
  emojiSelector.className = "emoji-selector";
  emojiSelector.style.cssText =
    "position: absolute; bottom: 70px; left: 60px; background-color: #1d2b3a; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.3); padding: 10px; z-index: 100; width: 280px; height: 200px; overflow-y: auto;";

  // Common emoji categories
  const emojiCategories = [
    {
      name: "Smileys",
      emojis: ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊"],
    },
    {
      name: "Gestures",
      emojis: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉"],
    },
    {
      name: "Hearts",
      emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💖", "💗", "💓"],
    },
  ];

  // Create tabs for categories
  const tabs = document.createElement("div");
  tabs.style.cssText =
    "display: flex; border-bottom: 1px solid #2d3b4a; margin-bottom: 10px;";

  const emojiGrid = document.createElement("div");
  emojiGrid.style.cssText =
    "display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px;";

  // Create emoji category tabs
  emojiCategories.forEach((category, index) => {
    const tab = document.createElement("button");
    tab.textContent = category.name;
    tab.style.cssText =
      "background: none; border: none; color: white; padding: 5px 10px; cursor: pointer; border-bottom: 2px solid transparent;";

    if (index === 0) {
      tab.style.borderBottomColor = "#00dfc4";
      populateEmojiGrid(emojiGrid, category.emojis);
    }

    tab.addEventListener("click", () => {
      // Deactivate all tabs
      tabs.querySelectorAll("button").forEach((btn) => {
        btn.style.borderBottomColor = "transparent";
      });

      // Activate this tab
      tab.style.borderBottomColor = "#00dfc4";

      // Populate grid with emojis from this category
      populateEmojiGrid(emojiGrid, category.emojis);
    });

    tabs.appendChild(tab);
  });

  emojiSelector.appendChild(tabs);
  emojiSelector.appendChild(emojiGrid);

  // Close when clicking outside
  document.addEventListener("click", function closeEmojiSelector(e) {
    if (
      !emojiSelector.contains(e.target) &&
      e.target !== document.querySelector(".emojiButton")
    ) {
      if (document.body.contains(emojiSelector)) {
        document.body.removeChild(emojiSelector);
      }
      document.removeEventListener("click", closeEmojiSelector);
    }
  });

  document.body.appendChild(emojiSelector);

  function populateEmojiGrid(grid, emojis) {
    grid.innerHTML = "";

    emojis.forEach((emoji) => {
      const button = document.createElement("button");
      button.textContent = emoji;
      button.style.cssText =
        "background: none; border: none; font-size: 24px; cursor: pointer; height: 40px; display: flex; align-items: center; justify-content: center; transition: transform 0.1s;";

      button.addEventListener("mouseenter", () => {
        button.style.transform = "scale(1.2)";
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "scale(1)";
      });

      button.addEventListener("click", () => {
        insertEmojiIntoInput(emoji);
      });

      grid.appendChild(button);
    });
  }

  function insertEmojiIntoInput(emoji) {
    const messageInput = document.querySelector(".messageInput");
    if (messageInput) {
      const startPos = messageInput.selectionStart;
      const endPos = messageInput.selectionEnd;
      const text = messageInput.value;

      // Insert emoji at cursor position
      messageInput.value =
        text.substring(0, startPos) + emoji + text.substring(endPos);

      // Move cursor after the inserted emoji
      messageInput.selectionStart = messageInput.selectionEnd =
        startPos + emoji.length;

      // Focus the input
      messageInput.focus();
    }
  }
}

/**
 * Toggle voice recording
 */
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

function toggleVoiceRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

/**
 * Start voice recording
 */
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Show recording indicator
    showRecordingIndicator();

    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.addEventListener("dataavailable", (event) => {
      audioChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/mp3" });
      audioChunks = [];

      // Here you would upload the audio and send the message
      // For now, we'll just show a placeholder message
      hideRecordingIndicator();
      showPopup(
        "info",
        "Funcionalidade de mensagens de voz será implementada em breve!"
      );

      // Release the microphone
      stream.getTracks().forEach((track) => track.stop());
    });

    // Start recording
    mediaRecorder.start();
    isRecording = true;
  } catch (error) {
    console.error("Error starting recording:", error);
    showPopup("error", "Não foi possível acessar o microfone.");
  }
}

/**
 * Stop voice recording
 */
function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
  }
}

/**
 * Show recording indicator
 */
function showRecordingIndicator() {
  const voiceButton = document.querySelector(".voiceButton");
  if (voiceButton) {
    voiceButton.classList.add("recording");

    // Add a pulsating red dot to indicate recording
    voiceButton.innerHTML = `
      <div class="recording-indicator" style="position: absolute; top: 0; right: 0; width: 8px; height: 8px; background-color: red; border-radius: 50%; animation: pulse 1s infinite;"></div>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="#f44336"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    `;

    // Add animation style
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.5); opacity: 0.7; }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    // Change message input placeholder
    const messageInput = document.querySelector(".messageInput");
    if (messageInput) {
      messageInput.placeholder = "Gravando mensagem de voz...";
      messageInput.disabled = true;
    }
  }
}

/**
 * Hide recording indicator
 */
function hideRecordingIndicator() {
  const voiceButton = document.querySelector(".voiceButton");
  if (voiceButton) {
    voiceButton.classList.remove("recording");

    // Reset to original icon
    voiceButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="#1d2b3a"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="#1d2b3a"/>
      </svg>
    `;

    // Reset message input
    const messageInput = document.querySelector(".messageInput");
    if (messageInput) {
      messageInput.placeholder = "Digite uma mensagem...";
      messageInput.disabled = false;
      messageInput.focus();
    }
  }
}

/**
 * Update user interface with user data
 */
function updateUserUI(user) {
  if (!user) return;

  const nameEl = document.querySelector(".userName");
  const emailEl = document.querySelector(".userEmail");
  const onlineStatusEl = document.querySelector(".onlineStatus");
  const statusTextEl = document.querySelector(".statusText");

  if (nameEl) nameEl.textContent = user.name || user.displayName || "Usuário";
  if (emailEl) emailEl.textContent = user.email || "";
  if (onlineStatusEl) {
    onlineStatusEl.style.backgroundColor = user.isOnline ? "#4CAF50" : "#ccc";
    onlineStatusEl.title = user.isOnline ? "Online" : "Offline";
  }
  if (statusTextEl) {
    statusTextEl.textContent = user.isOnline ? "Online" : "Offline";
  }

  // Update profile image if available
  const profileContainer = document.querySelector(".imgProfile");
  if (profileContainer && user.photoURL) {
    profileContainer.innerHTML = `<img src="${user.photoURL}" alt="Foto de perfil" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
  } else if (profileContainer) {
    // Default avatar with user initials
    const initials = (user.name || user.displayName || "U")
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    profileContainer.innerHTML = `
      <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; border-radius: 50%; color: #00dfc4; font-weight: bold; font-size: 18px;">
        ${initials}
      </div>
    `;
  }
}

/**
 * Setup listener for user online status
 */
function setupUserStatusListener(userId) {
  const userStatusRef = ref(realtimeDb, `users/${userId}/isOnline`);

  const unsubscribe = onValue(userStatusRef, (snapshot) => {
    const isOnline = snapshot.val();
    if (chatState.currentUser) {
      chatState.currentUser.isOnline = isOnline;
      updateUserUI(chatState.currentUser);
    }
  });

  // Store the unsubscribe function
  chatState.unsubscribeListeners.userStatus[userId] = unsubscribe;

  return unsubscribe;
}

/**
 * Setup conversation listeners with improved caching and real-time updates
 */
function setupConversationsListener() {
  try {
    // Unsubscribe from previous listener if exists
    if (chatState.unsubscribeListeners.conversations) {
      chatState.unsubscribeListeners.conversations();
    }

    if (!chatState.currentUser?.uid) {
      throw new Error("User not authenticated");
    }

    // Query conversations where the current user is a participant
    // Removing the orderBy to avoid requiring the composite index
    const conversationsRef = collection(firestore, "conversations");
    const q = query(
      conversationsRef,
      where("participants", "array-contains", chatState.currentUser.uid)
    );

    // Setup snapshot listener for real-time updates
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Process changes and update state
        let conversations = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Sort conversations by updatedAt in descending order in the client
        conversations.sort((a, b) => {
          const timeA = a.updatedAt
            ? a.updatedAt instanceof Timestamp
              ? a.updatedAt.toMillis()
              : a.updatedAt
            : 0;
          const timeB = b.updatedAt
            ? b.updatedAt instanceof Timestamp
              ? b.updatedAt.toMillis()
              : b.updatedAt
            : 0;
          return timeB - timeA; // Descending order
        });

        // Update conversations in state
        chatState.conversations = conversations;

        // Update cache
        cacheManager.saveConversations();

        // Update UI
        renderContacts();

        // Mark as loaded
        chatState.isLoading.contacts = false;
        updateContactsLoadingState(false);

        // If there's an active conversation, update it with fresh data
        if (chatState.activeConversation) {
          const updatedConversation = conversations.find(
            (c) => c.id === chatState.activeConversation.id
          );

          if (updatedConversation) {
            chatState.activeConversation = updatedConversation;
            updateConversationUI();
          }
        }

        // Prefetch user data for each conversation
        prefetchConversationUsers(conversations);
      },
      (error) => {
        console.error("Error in conversations listener:", error);
        showPopup(
          "error",
          "Erro ao monitorar conversas. Tente recarregar a página."
        );
        chatState.isLoading.contacts = false;
        updateContactsLoadingState(false);
      }
    );

    // Store unsubscribe function
    chatState.unsubscribeListeners.conversations = unsubscribe;
  } catch (error) {
    console.error("Error setting up conversations listener:", error);
    showPopup("error", "Erro ao monitorar conversas");
    chatState.isLoading.contacts = false;
    updateContactsLoadingState(false);
  }
}

/**
 * Prefetch user data for conversations to improve loading experience
 */
async function prefetchConversationUsers(conversations) {
  try {
    const userIdsToFetch = new Set();

    // Collect unique user IDs from all conversations
    conversations.forEach((conversation) => {
      if (!conversation.isGroup) {
        const otherUserId = conversation.participants.find(
          (id) => id !== chatState.currentUser.uid
        );

        if (otherUserId && !chatState.usersCache[otherUserId]) {
          userIdsToFetch.add(otherUserId);
        }
      } else {
        // For groups, prefetch all participants
        conversation.participants.forEach((participantId) => {
          if (
            participantId !== chatState.currentUser.uid &&
            !chatState.usersCache[participantId]
          ) {
            userIdsToFetch.add(participantId);
          }
        });
      }
    });

    // Fetch user data in batches
    const userIdBatches = Array.from(userIdsToFetch).reduce(
      (batches, userId, index) => {
        const batchIndex = Math.floor(index / 10); // 10 users per batch

        if (!batches[batchIndex]) {
          batches[batchIndex] = [];
        }

        batches[batchIndex].push(userId);
        return batches;
      },
      []
    );

    // Process batches sequentially to avoid overloading Firestore
    for (const batch of userIdBatches) {
      await Promise.all(
        batch.map(async (userId) => {
          try {
            // Try to load from cache first
            let userData = cacheManager.loadUserData(userId);

            if (!userData) {
              // Fetch from Firestore if not in cache
              userData = await fetchUserData(userId);
              if (userData) {
                cacheManager.saveUserData(userId, userData);
              }
            }

            if (userData) {
              chatState.usersCache[userId] = userData;
            }
          } catch (error) {
            console.error(`Error fetching user data for ${userId}:`, error);
          }
        })
      );
    }

    // Update UI now that we have more user data
    renderContacts();
  } catch (error) {
    console.error("Error prefetching users:", error);
  }
}

/**
 * Update loading state indicator for contacts list
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
            <div class="loading-spinner" style="width: 30px; height: 30px; border: 3px solid rgba(0, 223, 196, 0.3); border-radius: 50%; border-top-color: #00dfc4; animation: spin 1s linear infinite;"></div>
            <span style="margin-left: 10px; color: #00dfc4;">${message}</span>
          </div>
        </div>
      `;

      // Add spinning animation
      if (!document.getElementById("loading-spinner-style")) {
        const style = document.createElement("style");
        style.id = "loading-spinner-style";
        style.textContent = `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }

      contactsList.innerHTML = "";
      contactsList.appendChild(loadingItem);
    }
  } else {
    const loadingItem = contactsList.querySelector(".chat-loading");
    if (loadingItem) {
      loadingItem.remove();
    }
  }
}

/**
 * Render contacts list with conversations or search results
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

  // Add ripple effect to all list items
  addRippleEffect();
}

/**
 * Add ripple effect to list items
 */
function addRippleEffect() {
  const items = document.querySelectorAll("#menu li .list");

  items.forEach((item) => {
    item.addEventListener("click", function (e) {
      const ripple = document.createElement("span");
      ripple.classList.add("ripple-effect");

      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);

      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

      this.appendChild(ripple);

      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });

  // Add ripple style if not already added
  if (!document.getElementById("ripple-style")) {
    const style = document.createElement("style");
    style.id = "ripple-style";
    style.textContent = `
      .list {
        position: relative;
        overflow: hidden;
      }
      .ripple-effect {
        position: absolute;
        border-radius: 50%;
        transform: scale(0);
        background: rgba(255, 255, 255, 0.1);
        animation: ripple 0.6s linear;
        pointer-events: none;
      }
      @keyframes ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Dynamic user search with improved caching and error handling
 */
async function renderSearchResults(contactsList, searchTerm) {
  if (searchTerm.length < 1) {
    contactsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #00dfc4;">Digite para buscar usuários</div>`;
    return;
  }

  // Show loading state
  chatState.isLoading.search = true;
  updateContactsLoadingState(true, "Buscando usuários...");

  try {
    // Check if we have cached results for this search term
    const cacheKey = `search_${searchTerm.toLowerCase()}`;
    let results = chatState.searchCache[cacheKey];

    if (!results) {
      // Perform search if no cache exists
      const usersRef = collection(firestore, "users");

      // Search by name (case insensitive using lowercase field)
      const nameQuery = query(
        usersRef,
        where("nameLower", ">=", searchTerm.toLowerCase()),
        where("nameLower", "<=", searchTerm.toLowerCase() + "\uf8ff"),
        limit(20)
      );

      // Since Firestore doesn't support OR queries directly,
      // we'll do two separate queries and merge results
      const [nameSnapshot] = await Promise.all([getDocs(nameQuery)]);

      const usersMap = new Map();

      // Process name query results
      nameSnapshot.forEach((doc) => {
        if (doc.id !== chatState.currentUser.uid) {
          usersMap.set(doc.id, { id: doc.id, ...doc.data() });
        }
      });

      // Convert to array and cache
      results = Array.from(usersMap.values());
      chatState.searchCache[cacheKey] = results;
    }

    // Display results
    displaySearchResults(contactsList, results);
  } catch (error) {
    console.error("Error searching users:", error);
    contactsList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #f44336;">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>Erro ao buscar usuários. Tente novamente.</p>
      </div>
    `;
  } finally {
    // Hide loading state
    chatState.isLoading.search = false;
    updateContactsLoadingState(false);
  }
}

/**
 * Display search results with improved UI
 */
function displaySearchResults(contactsList, results) {
  if (results.length === 0) {
    contactsList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #00dfc4;">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="11" y1="8" x2="11" y2="14"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
        <p>Nenhum usuário encontrado</p>
      </div>
    `;
    return;
  }

  const titleElement = document.createElement("div");
  titleElement.className = "search-results-title";
  titleElement.style.cssText =
    "padding: 10px 15px; color: #00dfc4; font-size: 0.9em; border-bottom: 1px solid rgba(0, 223, 196, 0.2);";
  titleElement.textContent = `Resultados da busca (${results.length})`;
  contactsList.appendChild(titleElement);

  results.forEach((user) => {
    const listItem = document.createElement("li");

    const existingConversation = chatState.conversations.find(
      (conv) =>
        !conv.isGroup &&
        conv.participants.includes(user.id) &&
        conv.participants.includes(chatState.currentUser.uid)
    );

    const lastConversationTime = existingConversation
      ? existingConversation.lastMessageAt
        ? timeUtils.getTimeSince(existingConversation.lastMessageAt)
        : ""
      : "";

    listItem.innerHTML = `
      <div class="list search-result" data-user-id="${
        user.id
      }" data-existing-conversation="${
      existingConversation ? existingConversation.id : ""
    }">
        <button type="button" class="button__pic">
          ${
            user.photoURL
              ? `<img src="${user.photoURL}" alt="${user.name}" style="width:45px;height:45px;border-radius:50%;">`
              : `<div style="width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; color: #00dfc4; font-weight: bold; font-size: 16px;">${
                  user.name ? user.name.charAt(0).toUpperCase() : "U"
                }</div>`
          }
        </button>
        <button type="button" class="button__user">
          <div class="container__left">
            <span class="nameUser__message">${user.name}</span>
            <span class="messageUser">${
              existingConversation ? "Continuar conversa" : "Iniciar conversa"
            }</span>
          </div>
          <div class="container__right">
            ${
              lastConversationTime
                ? `<span class="Time__message">${lastConversationTime}</span>`
                : ""
            }
            <span class="online-indicator" style="width: 10px; height: 10px; border-radius: 50%; background-color: ${
              user.isOnline ? "#4CAF50" : "#ccc"
            }; margin-right: 5px;"></span>
            <span class="userType__badge" style="font-size: 0.7em; padding: 2px 6px; border-radius: 10px; background-color: ${
              user.userType === "paciente"
                ? "#2196F3"
                : user.userType === "medico"
                ? "#FF9800"
                : "#00dfc4"
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
      const existingConversationId = item.getAttribute(
        "data-existing-conversation"
      );

      if (existingConversationId) {
        await openConversation(existingConversationId);
      } else {
        await createConversation(userId);
      }

      document.getElementById("searchUser").value = "";
      document.querySelector(".clearSearchButton").style.display = "none";

      renderContacts();
      showConversationView();
    });
  });
}

/**
 * Load messages from Firestore with improved performance
 */
async function loadMessages(conversationId) {
  try {
    const messagesRef = collection(
      firestore,
      `conversations/${conversationId}/messages`
    );

    // Query for most recent messages first, then reverse for display
    const q = query(messagesRef, orderBy("timestamp", "desc"), limit(50));
    const messagesSnapshot = await getDocs(q);

    // Process messages and reverse to get chronological order
    chatState.messages = messagesSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .reverse();

    // Render messages and update cache
    renderMessages();
    scrollToBottom();
    cacheManager.saveMessages(conversationId);

    return chatState.messages;
  } catch (error) {
    console.error("Error loading messages:", error);
    showPopup("error", "Erro ao carregar mensagens");
    throw error;
  }
}

/**
 * Render messages with improved UI and grouped by date
 */
function renderMessages() {
  const conversationArea = document.querySelector(".mainSelectedMensages");
  if (!conversationArea || !chatState.messages) return;

  // Clear previous messages
  conversationArea.innerHTML = "";

  if (chatState.messages.length === 0) {
    // Show empty state
    conversationArea.innerHTML = `<div class="empty-chat" style="display: flex; justify-content: center; align-items: center; height: 100%; flex-direction: column; color: #00dfc4; opacity: 0.7;">
      <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <p style="margin-top: 15px; text-align: center; padding: 0 20px;">Nenhuma mensagem ainda.<br>Seja o primeiro a dizer olá!</p>
    </div>`;
    return;
  }

  // Group messages by date
  let currentDate = null;

  chatState.messages.forEach((message, index) => {
    const messageDate =
      message.timestamp instanceof Timestamp
        ? message.timestamp.toDate()
        : new Date(message.timestamp);

    const dateString = messageDate.toLocaleDateString();

    // Add date separator if this is a new date
    if (dateString !== currentDate) {
      currentDate = dateString;

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      let displayDate = "";
      if (dateString === today.toLocaleDateString()) {
        displayDate = "Hoje";
      } else if (dateString === yesterday.toLocaleDateString()) {
        displayDate = "Ontem";
      } else {
        displayDate = messageDate.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      }

      const dateSeparator = document.createElement("div");
      dateSeparator.className = "date-separator";
      dateSeparator.style.cssText =
        "text-align: center; margin: 15px 0; color: #00dfc4; font-size: 0.8em;";
      dateSeparator.innerHTML = `<span style="background-color: #1d2b3a; padding: 3px 10px; border-radius: 10px; border: 1px solid rgba(0, 223, 196, 0.3);">${displayDate}</span>`;
      conversationArea.appendChild(dateSeparator);
    }

    // Create message element
    renderMessageItem(conversationArea, message, index);
  });
}

/**
 * Render a single message item
 */
function renderMessageItem(container, message, index) {
  const isMyMessage = message.senderId === chatState.currentUser.uid;
  const isSystemMessage =
    message.senderId === "system" || message.type === "system";

  // Adicionando verificação de segurança para o timestamp
  let messageTime = "";
  try {
    messageTime = message.timestamp
      ? timeUtils.formatTime(message.timestamp)
      : "";
  } catch (error) {
    console.error("Erro ao obter o timestamp da mensagem:", error, message);
    messageTime = "";
  }

  if (isSystemMessage) {
    // Render system message
    const systemMessage = document.createElement("div");
    systemMessage.className = "system-message";
    systemMessage.style.cssText =
      "text-align: center; margin: 10px 0; color: #ccc; font-size: 0.8em;";
    systemMessage.innerHTML = `<span style="background-color: rgba(0,0,0,0.1); padding: 3px 8px; border-radius: 10px;">${message.text}</span>`;
    container.appendChild(systemMessage);
    return;
  }

  // Create message container
  const li = document.createElement("li");
  li.className = isMyMessage ? "myMensageSelected" : "userMensageSelected";

  // Get message status icon
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

  // Check if current message is from the same sender as the previous one
  const prevMessage = index > 0 ? chatState.messages[index - 1] : null;
  const showSenderInfo =
    !prevMessage || prevMessage.senderId !== message.senderId;

  // Process different message types
  let messageContent = "";

  switch (message.type) {
    case "image":
      messageContent = `<img src="${message.imageUrl}" alt="Image" style="max-width: 200px; max-height: 200px; border-radius: 5px; cursor: pointer;" onclick="showImagePreview('${message.imageUrl}')">`;
      if (message.caption) {
        messageContent += `<div style="margin-top: 5px;">${message.caption}</div>`;
      }
      break;
    case "audio":
      messageContent = `
        <div style="display: flex; align-items: center;">
          <button class="play-audio" data-url="${
            message.audioUrl
          }" style="background: none; border: none; color: ${
        isMyMessage ? "#1d2b3a" : "#00dfc4"
      }; cursor: pointer;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
          <div style="flex-grow: 1; margin-left: 10px;">
            <div class="audio-duration">${message.duration || "0:00"}</div>
            <div class="audio-waveform" style="height: 20px; background-color: ${
              isMyMessage ? "rgba(29, 43, 58, 0.3)" : "rgba(0, 223, 196, 0.3)"
            }; border-radius: 10px;"></div>
          </div>
        </div>
      `;
      break;
    case "file":
      messageContent = `
        <div style="display: flex; align-items: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="min-width: 24px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <div style="margin-left: 10px; overflow: hidden;">
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${
              message.fileName
            }</div>
            <div style="font-size: 0.8em; opacity: 0.7;">${
              message.fileSize || ""
            }</div>
          </div>
          <a href="${message.fileUrl}" download="${
        message.fileName
      }" style="margin-left: 10px; color: ${
        isMyMessage ? "#1d2b3a" : "#00dfc4"
      };">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </a>
        </div>
      `;
      break;
    case "location":
      messageContent = `
        <div style="text-align: center;">
          <div style="background-color: ${
            isMyMessage ? "rgba(29, 43, 58, 0.3)" : "rgba(0, 223, 196, 0.3)"
          }; border-radius: 5px; padding: 10px; display: inline-block;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <div style="margin-top: 5px;">Localização compartilhada</div>
          </div>
        </div>
      `;
      break;
    default:
      // Regular text message
      messageContent = message.text || "Mensagem não suportada";
  }

  // Create message wrapper with sender info if needed
  let messageHtml = `<div class="messageWrapper">`;

  // Add sender info for group chats if this is first message from this sender in sequence
  if (!isMyMessage && chatState.activeConversation?.isGroup && showSenderInfo) {
    const sender = chatState.usersCache[message.senderId] || {
      name: "Usuário",
    };
    messageHtml += `<div class="sender-name" style="font-size: 0.8em; color: #00dfc4; margin-bottom: 2px;">${sender.name}</div>`;
  }

  // Add message content and metadata
  messageHtml += `
    <span class="mensages">${messageContent}</span>
    <div class="containerSettingMensages_icons">
      <span class="timeSend">${messageTime}</span>
      <span class="checkedMensages">${statusIcon}</span>
    </div>
  </div>`;

  li.innerHTML = messageHtml;

  // Add event listeners for media messages
  if (message.type === "audio") {
    const playButton = li.querySelector(".play-audio");
    if (playButton) {
      playButton.addEventListener("click", function () {
        // Placeholder for audio playback
        showPopup("info", "Reprodução de áudio será implementada em breve!");
      });
    }
  }

  container.appendChild(li);
}

/**
 * Scroll to the bottom of the messages container
 */
function scrollToBottom() {
  const conversationArea = document.querySelector(".mainSelectedMensages");
  if (conversationArea) {
    // Check if user is already at bottom before scrolling
    const isAtBottom =
      conversationArea.scrollHeight -
        conversationArea.scrollTop -
        conversationArea.clientHeight <
      50;

    if (isAtBottom) {
      conversationArea.scrollTop = conversationArea.scrollHeight;
    } else {
      // Show "scroll to bottom" button if not already at bottom
      showScrollToBottomButton();
    }
  }
}

/**
 * Show a button to scroll to the bottom of the conversation
 */
function showScrollToBottomButton() {
  let scrollButton = document.querySelector(".scroll-to-bottom");

  if (!scrollButton) {
    scrollButton = document.createElement("button");
    scrollButton.className = "scroll-to-bottom";
    scrollButton.style.cssText = `
      position: absolute;
      bottom: 80px;
      right: 20px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #00dfc4;
      color: #1d2b3a;
      border: none;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 100;
      animation: fadeIn 0.3s ease-in-out;
    `;

    scrollButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    // Add animation style
    if (!document.getElementById("scroll-button-style")) {
      const style = document.createElement("style");
      style.id = "scroll-button-style";
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    scrollButton.addEventListener("click", () => {
      const conversationArea = document.querySelector(".mainSelectedMensages");
      if (conversationArea) {
        conversationArea.scrollTop = conversationArea.scrollHeight;
        scrollButton.remove();
      }
    });

    document.querySelector(".SelectedMensages").appendChild(scrollButton);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (scrollButton && scrollButton.parentNode) {
        scrollButton.remove();
      }
    }, 5000);
  }
}

/**
 * Send a message in the active conversation
 */
// Função sendMessage atualizada
async function sendMessage(text) {
  try {
    if (!text.trim() || !chatState.activeConversation) return;

    const conversationId = chatState.activeConversation.id;
    const currentUserId = chatState.currentUser.uid;

    // Limpa o campo de input imediatamente para melhor UX
    const messageInput = document.querySelector(".messageInput");
    if (messageInput) {
      messageInput.value = "";
      messageInput.focus();
    }

    // Cria a referência para a nova mensagem e obtém o ID real
    const messagesRef = ref(realtimeDb, `messages/${conversationId}`);
    const newMessageRef = push(messagesRef);
    const messageId = newMessageRef.key;

    // Cria o objeto da mensagem com o ID real
    const newMessage = {
      id: messageId,
      text: text.trim(),
      senderId: currentUserId,
      timestamp: Date.now(),
      status: "pending",
      type: "text",
    };

    // Adiciona ao estado local para exibição imediata
    chatState.messages.push(newMessage);

    // Atualiza a UI
    renderMessages();
    scrollToBottom();

    // Envia para o Realtime Database
    await set(newMessageRef, newMessage);

    // Atualiza os metadados da conversa
    const unreadCount = {};

    chatState.activeConversation.participants.forEach((participant) => {
      const participantId =
        typeof participant === "string" ? participant : participant.id;

      unreadCount[participantId] =
        (chatState.activeConversation.unreadCount?.[participantId] || 0) +
        (participantId === currentUserId ? 0 : 1);
    });

    const conversationRef = doc(firestore, "conversations", conversationId);
    await updateDoc(conversationRef, {
      lastMessage: text.trim(),
      lastMessageType: "text",
      lastMessageSenderId: currentUserId,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unreadCount,
    });

    // Após um pequeno atraso, atualiza o status da mensagem para "sent"
    setTimeout(async () => {
      await update(ref(realtimeDb, `messages/${conversationId}/${messageId}`), {
        status: "sent",
      });

      // Também salva no Firestore para persistência
      await addDoc(
        collection(firestore, `conversations/${conversationId}/messages`),
        {
          id: messageId,
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
      cacheManager.saveConversations();
    }

    renderContacts();

    return true;
  } catch (error) {
    console.error("Error sending message:", error);
    showPopup("error", "Erro ao enviar mensagem");

    // Remove a mensagem falha da UI
    const failedIndex = chatState.messages.findIndex((m) => m.id === messageId);
    if (failedIndex !== -1) {
      chatState.messages.splice(failedIndex, 1);
      renderMessages();
    }

    return false;
  }
}

// Função setupMessagesListener atualizada
function setupMessagesListener(conversationId) {
  try {
    // Unsubscribe do listener anterior, se existir
    if (chatState.unsubscribeListeners.messages) {
      chatState.unsubscribeListeners.messages();
    }

    const messagesRef = ref(realtimeDb, `messages/${conversationId}`);

    // Listener para novas mensagens
    const unsubscribeAdded = onChildAdded(messagesRef, async (snapshot) => {
      const newMessage = snapshot.val();
      newMessage.id = snapshot.key;

      // Verifica se a mensagem já está no estado
      const existingIndex = chatState.messages.findIndex(
        (msg) => msg.id === newMessage.id
      );

      if (existingIndex === -1) {
        // Se não existe, adiciona
        chatState.messages.push(newMessage);
      } else {
        // Se existe, atualiza com os dados mais recentes
        chatState.messages[existingIndex] = newMessage;
      }

      renderMessages();
      scrollToBottom();
      cacheManager.saveMessages(conversationId);

      // Reproduz som de notificação se a mensagem não for do usuário atual e a janela não estiver em foco
      if (
        newMessage.senderId !== chatState.currentUser.uid &&
        document.visibilityState !== "visible"
      ) {
        playNotificationSound();
        showBrowserNotification(newMessage);
      }

      // Marca como lida se esta for a conversa ativa
      if (
        chatState.activeConversation &&
        chatState.activeConversation.id === conversationId &&
        newMessage.senderId !== chatState.currentUser.uid
      ) {
        await markMessageAsRead(conversationId, snapshot.key);
        chatState.lastSeenTimestamps[conversationId] = Date.now();
        cacheManager.saveLastSeen();
      }
    });

    // Listener para atualizações em mensagens existentes
    const unsubscribeChanged = onChildChanged(messagesRef, (snapshot) => {
      const updatedMessage = snapshot.val();
      updatedMessage.id = snapshot.key;

      const index = chatState.messages.findIndex(
        (msg) => msg.id === updatedMessage.id
      );

      if (index !== -1) {
        chatState.messages[index] = updatedMessage;
        renderMessages();
      }
    });

    // Armazena as funções de unsubscribe
    chatState.unsubscribeListeners.messages = () => {
      unsubscribeAdded();
      unsubscribeChanged();
    };

    return chatState.unsubscribeListeners.messages;
  } catch (error) {
    console.error("Error setting up messages listener:", error);
    return null;
  }
}

/**
 * Show conversation view
 */
function showConversationView() {
  const selectedChat = document.querySelector(".SelectedMensages");
  const notSelectedChat = document.querySelector(".notSelectedMensages");

  if (selectedChat) selectedChat.style.display = "flex";
  if (notSelectedChat) notSelectedChat.style.display = "none";

  adjustLayout();
}

/**
 * Back to contacts list (on small screens)
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
 * Adjust layout based on screen size
 */
function adjustLayout() {
  if (window.innerWidth <= 700 && chatState.activeConversation) {
    const containerUserChat = document.querySelector(".containerUserChat");
    const containerMain = document.querySelector("#containerMain");

    if (containerUserChat) containerUserChat.style.display = "none";
    if (containerMain) containerMain.style.display = "block";
  } else if (window.innerWidth > 700) {
    const containerUserChat = document.querySelector(".containerUserChat");
    const containerMain = document.querySelector("#containerMain");

    if (containerUserChat) containerUserChat.style.display = "flex";
    if (containerMain) containerMain.style.display = "block";
  }

  // Atualizar visibilidade do botão de voltar
  updateBackButtonVisibility();
}

/**
 * Create or retrieve a conversation with a specific user
 */
async function createConversation(targetUserId) {
  try {
    // Show loading indicator
    showPopup("info", "Criando conversa...", 1000);

    // Check if conversation already exists
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
      // Create new conversation
      const conversationData = {
        participants: [chatState.currentUser.uid, targetUserId],
        isGroup: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCount: {},
        creator: chatState.currentUser.uid,
      };

      const docRef = await addDoc(
        collection(firestore, "conversations"),
        conversationData
      );

      conversation = { id: docRef.id, ...conversationData };

      // Add to local state and cache
      chatState.conversations.unshift(conversation);
      cacheManager.saveConversations();

      // Trigger welcome message
      await sendSystemMessage(conversation.id, "Conversa iniciada. Diga olá!");
    }

    // Set as active conversation and open it
    chatState.activeConversation = conversation;
    await openConversation(conversation.id);

    return conversation;
  } catch (error) {
    console.error("Error creating conversation:", error);
    showPopup("error", "Erro ao criar conversa");
    return null;
  }
}

/**
 * Send a system message to a conversation
 */
async function sendSystemMessage(conversationId, text) {
  try {
    // Create system message object
    const systemMessage = {
      text: text,
      senderId: "system",
      timestamp: Date.now(),
      status: "sent",
      type: "system",
    };

    // Send to Realtime Database for instant sync
    const messagesRef = ref(realtimeDb, `messages/${conversationId}`);
    const newMessageRef = push(messagesRef);
    await set(newMessageRef, systemMessage);

    // Also save to Firestore for persistence
    await addDoc(
      collection(firestore, `conversations/${conversationId}/messages`),
      {
        text: text,
        senderId: "system",
        timestamp: Timestamp.fromDate(new Date(systemMessage.timestamp)),
        status: "sent",
        type: "system",
      }
    );

    return true;
  } catch (error) {
    console.error("Error sending system message:", error);
    return false;
  }
}

/**
 * Open a conversation and setup listeners
 */
async function openConversation(conversationId) {
  try {
    // Unsubscribe from previous messages listeners
    if (chatState.unsubscribeListeners.messages) {
      chatState.unsubscribeListeners.messages();
    }

    // Get conversation data
    const conversationDoc = await getDoc(
      doc(firestore, "conversations", conversationId)
    );

    if (!conversationDoc.exists()) {
      throw new Error("Conversation not found");
    }

    const conversationData = conversationDoc.data();
    chatState.activeConversation = { id: conversationId, ...conversationData };

    // Show loading indicator
    chatState.isLoading.messages = true;

    // Show conversation UI
    showConversationView();
    updateConversationUI();

    // Try to load from cache first for instant display
    const cacheFound = cacheManager.loadMessages(conversationId);

    // Reset unread count for current user
    if (
      chatState.activeConversation.unreadCount &&
      chatState.activeConversation.unreadCount[chatState.currentUser.uid] > 0
    ) {
      const conversationRef = doc(firestore, "conversations", conversationId);
      const unreadCount = { ...chatState.activeConversation.unreadCount };
      unreadCount[chatState.currentUser.uid] = 0;

      await updateDoc(conversationRef, { unreadCount });

      // Update local state
      chatState.activeConversation.unreadCount = unreadCount;
    }

    // Load messages from server
    await loadMessages(conversationId);

    // Setup real-time listeners
    setupMessagesListener(conversationId);
    setupTypingIndicatorsListener(conversationId);

    // Mark as read in the lastSeen object and save
    chatState.lastSeenTimestamps[conversationId] = Date.now();
    cacheManager.saveLastSeen();

    return true;
  } catch (error) {
    console.error("Error opening conversation:", error);
    showPopup("error", "Erro ao abrir conversa");
    return false;
  } finally {
    chatState.isLoading.messages = false;
  }
}

/**
 * Setup real-time listener for messages
 */

/**
 * Mark a message as read
 */
async function markMessageAsRead(conversationId, messageId) {
  try {
    // Update message status in Realtime Database
    await update(ref(realtimeDb, `messages/${conversationId}/${messageId}`), {
      status: "read",
    });

    // Also update in Firestore for persistence
    const messagesRef = collection(
      firestore,
      `conversations/${conversationId}/messages`
    );
    const q = query(messagesRef, where("id", "==", messageId), limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const messageRef = doc(
        firestore,
        `conversations/${conversationId}/messages`,
        querySnapshot.docs[0].id
      );
      await updateDoc(messageRef, { status: "read" });
    }

    return true;
  } catch (error) {
    console.error("Error marking message as read:", error);
    return false;
  }
}

/**
 * Update conversation UI with current conversation data
 */
function updateConversationUI() {
  if (!chatState.activeConversation) return;

  // Get elements
  const chatName = document.querySelector(".nameUserMensages");
  const chatStatus = document.querySelector(".userStatusText");
  const chatAvatar = document.querySelector(".ProfileMensagesPic");
  const statusDot = document.querySelector(".userStatusMensages");

  if (!chatName || !chatStatus || !chatAvatar) return;

  const conversation = chatState.activeConversation;

  if (conversation.isGroup) {
    // Group chat UI
    chatName.textContent = conversation.name || "Grupo";
    chatStatus.textContent = `${conversation.participants.length} participantes`;

    if (statusDot) {
      statusDot.style.backgroundColor = "#ccc"; // Neutral color for groups
    }

    // Group avatar (display first letter of group name)
    chatAvatar.innerHTML = `
      <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; border-radius: 50%; color: #00dfc4; font-weight: bold; font-size: 20px;">
        ${(conversation.name || "G").charAt(0).toUpperCase()}
      </div>
    `;
  } else {
    // Direct chat UI - get the other user's data
    const otherUserId = conversation.participants.find(
      (id) => id !== chatState.currentUser.uid
    );

    if (otherUserId) {
      // Try to get from cache first
      let userData = chatState.usersCache[otherUserId];

      if (!userData) {
        // If not in cache, load from Firestore
        fetchUserData(otherUserId).then((data) => {
          if (data) {
            chatState.usersCache[otherUserId] = data;
            updateConversationUI(); // Re-run this function after getting data
          }
        });

        // Show loading state
        chatName.textContent = "Carregando...";
        chatStatus.textContent = "";
        chatAvatar.innerHTML = `
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; border-radius: 50%;">
            <div class="loading-spinner" style="width: 20px; height: 20px; border: 2px solid rgba(0, 223, 196, 0.3); border-radius: 50%; border-top-color: #00dfc4; animation: spin 1s linear infinite;"></div>
          </div>
        `;
        return;
      }

      // Display user info
      chatName.textContent = userData.name || "Usuário";
      chatStatus.textContent = userData.isOnline
        ? "Online"
        : userData.lastSeen
        ? `Visto por último ${timeUtils.getTimeSince(userData.lastSeen)}`
        : "Offline";

      // Show online status color
      chatStatus.style.color = userData.isOnline ? "#4CAF50" : "#ccc";

      if (statusDot) {
        statusDot.style.backgroundColor = userData.isOnline
          ? "#4CAF50"
          : "#ccc";
      }

      // User avatar
      if (userData.photoURL) {
        chatAvatar.innerHTML = `<img src="${userData.photoURL}" alt="Foto de perfil" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      } else {
        // Default avatar with user initials
        const initials = (userData.name || "U")
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();

        chatAvatar.innerHTML = `
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; border-radius: 50%; color: #00dfc4; font-weight: bold; font-size: 18px;">
            ${initials}
          </div>
        `;
      }
    }
  }

  // Enable message input and buttons
  const messageInput = document.querySelector(".messageInput");
  const sendButton = document.querySelector(".sendButton");
  const attachButton = document.querySelector(".attachButton");
  const emojiButton = document.querySelector(".emojiButton");
  const voiceButton = document.querySelector(".voiceButton");

  if (messageInput) messageInput.disabled = false;
  if (sendButton) sendButton.disabled = false;
  if (attachButton) attachButton.disabled = false;
  if (emojiButton) emojiButton.disabled = false;
  if (voiceButton) voiceButton.disabled = false;
}

/**
 * Show new chat dialog
 */
function showNewChatDialog() {
  try {
    showPopup("info", "Carregando usuários...");

    // Fetch all users for the dialog
    getAllUsers()
      .then((users) => {
        // Filter out current user and existing direct conversations
        const existingChats = new Set();
        chatState.conversations.forEach((conv) => {
          if (!conv.isGroup) {
            conv.participants.forEach((participant) => {
              if (participant !== chatState.currentUser.uid) {
                existingChats.add(participant);
              }
            });
          }
        });

        const availableUsers = users.filter(
          (user) =>
            user.id !== chatState.currentUser.uid && !existingChats.has(user.id)
        );

        if (availableUsers.length === 0) {
          showPopup("info", "Não há usuários disponíveis para conversar.");
          return;
        }

        // Create users selection dialog
        createSelectUserDialog(
          availableUsers,
          "Nova Conversa",
          "Selecione um usuário para iniciar uma conversa:",
          (selectedUserId) => {
            if (selectedUserId) {
              createConversation(selectedUserId);
            }
          }
        );
      })
      .catch((error) => {
        console.error("Error loading users:", error);
        showPopup("error", "Erro ao carregar usuários");
      });
  } catch (error) {
    console.error("Error showing new chat dialog:", error);
    showPopup("error", "Erro ao abrir diálogo");
  }
}

/**
 * Create select user dialog with user list
 */
function createSelectUserDialog(users, title, message, callback) {
  // Create dialog container
  const dialogContainer = document.createElement("div");
  dialogContainer.className = "select-user-dialog";
  dialogContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  // Create dialog content
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background-color: #1d2b3a;
    border-radius: 10px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  `;

  // Create dialog header
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 15px;
    border-bottom: 1px solid rgba(0, 223, 196, 0.2);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = `
    <h3 style="margin: 0; color: #00dfc4;">${title}</h3>
    <button class="close-dialog" style="background: none; border: none; color: #00dfc4; font-size: 24px; cursor: pointer;">×</button>
  `;

  // Create message
  const messageElement = document.createElement("p");
  messageElement.style.cssText = `
    padding: 10px 15px;
    margin: 0;
    color: #fff;
  `;
  messageElement.textContent = message;

  // Create users list container
  const usersContainer = document.createElement("div");
  usersContainer.style.cssText = `
    flex-grow: 1;
    overflow-y: auto;
    padding: 0 15px;
    max-height: 50vh;
  `;

  // Create search input
  const searchContainer = document.createElement("div");
  searchContainer.style.cssText = `
    padding: 10px 15px;
    border-bottom: 1px solid rgba(0, 223, 196, 0.2);
  `;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Buscar usuários...";
  searchInput.style.cssText = `
    width: 100%;
    padding: 10px;
    border-radius: 20px;
    border: 1px solid rgba(0, 223, 196, 0.3);
    background-color: rgba(0, 0, 0, 0.2);
    color: #fff;
    box-sizing: border-box;
  `;

  searchContainer.appendChild(searchInput);

  // Create user list
  const usersList = document.createElement("ul");
  usersList.style.cssText = `
    list-style: none;
    padding: 0;
    margin: 0;
  `;

  // Populate user list
  function renderUsers(userArray, searchValue = "") {
    usersList.innerHTML = "";

    const filteredUsers = searchValue.trim()
      ? userArray.filter(
          (user) =>
            user.name.toLowerCase().includes(searchValue.toLowerCase()) ||
            (user.email &&
              user.email.toLowerCase().includes(searchValue.toLowerCase()))
        )
      : userArray;

    if (filteredUsers.length === 0) {
      usersList.innerHTML = `
        <li style="padding: 15px; text-align: center; color: #ccc;">
          Nenhum usuário encontrado
        </li>
      `;
      return;
    }

    filteredUsers.forEach((user) => {
      const userItem = document.createElement("li");
      userItem.style.cssText = `
        padding: 10px;
        margin: 5px 0;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
      `;

      userItem.innerHTML = `
        ${
          user.photoURL
            ? `<img src="${user.photoURL}" alt="${user.name}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px;">`
            : `<div style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px; background-color: rgba(0, 223, 196, 0.2); display: flex; align-items: center; justify-content: center; color: #00dfc4; font-weight: bold;">${
                user.name ? user.name.charAt(0).toUpperCase() : "U"
              }</div>`
        }
        <div>
          <div style="color: #fff; font-weight: bold;">${user.name}</div>
          ${
            user.email
              ? `<div style="color: #ccc; font-size: 0.8em;">${user.email}</div>`
              : ""
          }
        </div>
        <div style="margin-left: auto; margin-right: 5px; width: 8px; height: 8px; border-radius: 50%; background-color: ${
          user.isOnline ? "#4CAF50" : "#ccc"
        };"></div>
      `;

      userItem.addEventListener("mouseenter", () => {
        userItem.style.backgroundColor = "rgba(0, 223, 196, 0.1)";
      });

      userItem.addEventListener("mouseleave", () => {
        userItem.style.backgroundColor = "transparent";
      });

      userItem.addEventListener("click", () => {
        dialogContainer.remove();
        callback(user.id);
      });

      usersList.appendChild(userItem);
    });
  }

  // Initial render
  renderUsers(users);

  // Setup search functionality
  searchInput.addEventListener("input", (e) => {
    renderUsers(users, e.target.value);
  });

  // Create buttons container
  const buttons = document.createElement("div");
  buttons.style.cssText = `
    padding: 15px;
    border-top: 1px solid rgba(0, 223, 196, 0.2);
    display: flex;
    justify-content: flex-end;
  `;

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancelar";
  cancelButton.style.cssText = `
    background: none;
    border: 1px solid #00dfc4;
    color: #00dfc4;
    padding: 8px 15px;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.2s;
  `;

  cancelButton.addEventListener("mouseenter", () => {
    cancelButton.style.backgroundColor = "rgba(0, 223, 196, 0.1)";
  });

  cancelButton.addEventListener("mouseleave", () => {
    cancelButton.style.backgroundColor = "transparent";
  });

  cancelButton.addEventListener("click", () => {
    dialogContainer.remove();
    callback(null);
  });

  buttons.appendChild(cancelButton);

  // Assemble dialog
  dialog.appendChild(header);
  dialog.appendChild(messageElement);
  dialog.appendChild(searchContainer);
  dialog.appendChild(usersContainer);
  usersContainer.appendChild(usersList);
  dialog.appendChild(buttons);
  dialogContainer.appendChild(dialog);

  // Add close button event
  dialog.querySelector(".close-dialog").addEventListener("click", () => {
    dialogContainer.remove();
    callback(null);
  });

  // Add dialog to body
  document.body.appendChild(dialogContainer);

  // Add animation
  dialog.style.animation = "scaleIn 0.2s forwards";

  // Add animation style
  if (!document.getElementById("dialog-animation-style")) {
    const style = document.createElement("style");
    style.id = "dialog-animation-style";
    style.textContent = `
      @keyframes scaleIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // Focus search input
  setTimeout(() => searchInput.focus(), 100);
}

/**
 * Show create group dialog
 */
async function showCreateGroupDialog() {
  try {
    // Verifica se o usuário está autenticado
    if (!chatState.currentUser) {
      alert("Erro: Usuário não autenticado. Faça login para criar grupos.");
      return;
    }

    // Obtém a lista de contatos do usuário
    const contacts = await getUserContacts(chatState.currentUser.uid);
    if (contacts.length === 0) {
      alert("Você não tem contatos para adicionar ao grupo.");
      return;
    }

    // Chama a função para selecionar usuários (agora definida)
    const selectedUserIds = await createMultiSelectUserDialog(contacts);
    if (selectedUserIds.length === 0) {
      alert("Nenhum usuário selecionado para o grupo.");
      return;
    }

    // Solicita o nome do grupo
    const groupName = prompt("Digite o nome do grupo:");
    if (!groupName) {
      alert("O nome do grupo é obrigatório.");
      return;
    }

    // Cria os dados do grupo
    const participants = [chatState.currentUser.uid, ...selectedUserIds];
    const conversationData = {
      name: groupName,
      participants: participants,
      isGroup: true,
    };

    // Adiciona o grupo ao banco de dados (exemplo com Firebase)
    const docRef = await addDoc(collection(firestore, "conversations"), conversationData);

    alert("Grupo criado com sucesso!");
  } catch (error) {
    console.error("Erro ao criar grupo:", error);
    alert("Erro ao criar grupo.");
  }
}

// Função placeholder para seleção de usuários
async function createMultiSelectUserDialog(contacts) {
  return contacts.slice(0, 2).map(contact => contact.id); // Exemplo temporário
}

/**
 * Render conversations list
 */
function renderConversations(contactsList) {
  if (!contactsList) return;

  contactsList.innerHTML = "";

  if (chatState.conversations.length === 0) {
    contactsList.innerHTML = `
      <li>
        <div style="text-align: center; padding: 20px; color: #00dfc4; opacity: 0.8;">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
          </svg>
          <p>Nenhuma conversa ainda.</p>
          <p>Clique em + para iniciar uma conversa.</p>
        </div>
      </li>
    `;
    return;
  }

  // Sort conversations with unread messages to the top, then by last message time
  const sortedConversations = [...chatState.conversations].sort((a, b) => {
    // Get unread count for current user
    const unreadA = a.unreadCount?.[chatState.currentUser.uid] || 0;
    const unreadB = b.unreadCount?.[chatState.currentUser.uid] || 0;

    // First, sort by unread
    if (unreadA > 0 && unreadB === 0) return -1;
    if (unreadA === 0 && unreadB > 0) return 1;

    // Then by last message time
    const timeA = a.lastMessageAt
      ? a.lastMessageAt instanceof Timestamp
        ? a.lastMessageAt.toMillis()
        : a.lastMessageAt
      : 0;
    const timeB = b.lastMessageAt
      ? b.lastMessageAt instanceof Timestamp
        ? b.lastMessageAt.toMillis()
        : b.lastMessageAt
      : 0;

    return timeB - timeA; // Descending order
  });

  sortedConversations.forEach((conversation) => {
    // Skip the conversation if it has no messages yet
    if (!conversation.lastMessage && !conversation.isGroup) {
      return;
    }

    const listItem = document.createElement("li");
    let conversationName = "Conversa";
    let conversationImage = "";
    let onlineStatus = false;

    // Determine conversation name and image
    if (conversation.isGroup) {
      // Group chat
      conversationName = conversation.name || "Grupo";
      conversationImage = `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; border-radius: 50%; color: #00dfc4; font-weight: bold; font-size: 20px;">
          ${conversationName.charAt(0).toUpperCase()}
        </div>
      `;
    } else {
      // Direct chat - get the other user
      const otherUserId = conversation.participants.find(
        (id) => id !== chatState.currentUser.uid
      );

      const userData = chatState.usersCache[otherUserId];

      if (userData) {
        conversationName = userData.name || "Usuário";
        onlineStatus = userData.isOnline;

        if (userData.photoURL) {
          conversationImage = `<img src="${userData.photoURL}" alt="${conversationName}" style="width:100%;height:100%;border-radius:50%;">`;
        } else {
          const initials = (userData.name || "U")
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();

          conversationImage = `
            <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; border-radius: 50%; color: #00dfc4; font-weight: bold; font-size: 16px;">
              ${initials}
            </div>
          `;
        }
      } else {
        // If user data isn't cached yet, show placeholder
        conversationImage = `
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; border-radius: 50%; color: #00dfc4; font-weight: bold; font-size: 16px;">
            ?
          </div>
        `;

        // Attempt to load user data
        fetchUserData(otherUserId).then((data) => {
          if (data) {
            chatState.usersCache[otherUserId] = data;
            renderContacts(); // Re-render when we have user data
          }
        });
      }
    }

    // Get last message preview
    let lastMessagePreview = "";
    let lastMessageTime = "";

    if (conversation.lastMessage) {
      // Different preview based on message type
      switch (conversation.lastMessageType) {
        case "image":
          lastMessagePreview = "📷 Imagem";
          break;
        case "audio":
          lastMessagePreview = "🎤 Áudio";
          break;
        case "file":
          lastMessagePreview = "📎 Arquivo";
          break;
        case "location":
          lastMessagePreview = "📍 Localização";
          break;
        default:
          // For text messages, show preview with sender name in groups
          if (
            conversation.isGroup &&
            conversation.lastMessageSenderId !== chatState.currentUser.uid
          ) {
            const senderData =
              chatState.usersCache[conversation.lastMessageSenderId];
            const senderName = senderData ? senderData.name : "Alguém";
            lastMessagePreview = `${senderName}: ${conversation.lastMessage}`;
          } else {
            lastMessagePreview = conversation.lastMessage;
          }
      }

      // Get time for message
      lastMessageTime = conversation.lastMessageAt
        ? timeUtils.getTimeSince(conversation.lastMessageAt)
        : "";
    } else if (conversation.createdAt) {
      // If no messages yet, show creation time
      lastMessagePreview = "Conversa iniciada";
      lastMessageTime = timeUtils.getTimeSince(conversation.createdAt);
    }

    // Get unread count for current user
    const unreadCount =
      conversation.unreadCount?.[chatState.currentUser.uid] || 0;

    // Set active class if this is the active conversation
    const isActive =
      chatState.activeConversation &&
      chatState.activeConversation.id === conversation.id;

    // Create HTML for the conversation item
    listItem.className = isActive ? "active-conversation" : "";
    listItem.innerHTML = `
      <div class="list" data-conversation-id="${conversation.id}">
        <button type="button" class="button__pic">
          ${conversationImage}
          ${
            onlineStatus
              ? `<span style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; background-color: #4CAF50; border-radius: 50%; border: 2px solid #1d2b3a;"></span>`
              : ""
          }
        </button>
        <button type="button" class="button__user">
          <div class="container__left">
            <span class="nameUser__message">${conversationName}</span>
            <span class="messageUser">${
              lastMessagePreview.length > 40
                ? lastMessagePreview.substring(0, 40) + "..."
                : lastMessagePreview
            }</span>
          </div>
          <div class="container__right">
            <span class="Time__message">${lastMessageTime}</span>
            ${
              unreadCount > 0
                ? `<span class="count__message">${
                    unreadCount > 99 ? "99+" : unreadCount
                  }</span>`
                : ""
            }
          </div>
        </button>
      </div>
    `;

    // Add click event to open conversation
    listItem.querySelector(".list").addEventListener("click", () => {
      openConversation(conversation.id);
    });

    contactsList.appendChild(listItem);
  });

  // Add highlight for active conversation
  if (chatState.activeConversation) {
    const activeItem = contactsList.querySelector(
      `.list[data-conversation-id="${chatState.activeConversation.id}"]`
    );
    if (activeItem) {
      activeItem.classList.add("active");
    }
  }
}

/**
 * Play notification sound for new messages
 */
function playNotificationSound() {
  try {
    const audio = new Audio("../../assets/sounds/notification.mp3");
    audio.volume = 0.5;
    audio.play().catch((error) => {
      console.error("Error playing notification sound:", error);
    });
  } catch (error) {
    console.error("Error creating notification sound:", error);
  }
}

/**
 * Show browser notification for new messages
 */
function showBrowserNotification(message) {
  try {
    if (
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      document.visibilityState === "visible"
    ) {
      return;
    }

    // Get sender info
    const senderName = chatState.usersCache[message.senderId]
      ? chatState.usersCache[message.senderId].name
      : "Nova mensagem";

    // Create notification
    let notificationTitle = senderName;
    let notificationOptions = {
      body: message.text || "Nova mensagem recebida",
      icon: "../../assets/img/logo.png",
      badge: "../../assets/img/logo.png",
      tag: `chat-${message.senderId}`,
      renotify: true,
    };

    // Show notification
    const notification = new Notification(
      notificationTitle,
      notificationOptions
    );

    // Handle click on notification
    notification.addEventListener("click", () => {
      window.focus();
      if (
        chatState.activeConversation &&
        chatState.activeConversation.id === message.conversationId
      ) {
        scrollToBottom();
      } else if (message.conversationId) {
        openConversation(message.conversationId);
      }
    });
  } catch (error) {
    console.error("Error showing notification:", error);
  }
}

/**
 * Logout function for user menu
 */
function logout() {
  confirmDialog("Sair", "Tem certeza que deseja sair?", async () => {
    try {
      // Update online status
      if (chatState.currentUser) {
        await updateOnlineStatus(chatState.currentUser.uid, false);
      }

      // Unsubscribe from all listeners
      if (chatState.unsubscribeListeners.conversations) {
        chatState.unsubscribeListeners.conversations();
      }

      if (chatState.unsubscribeListeners.messages) {
        chatState.unsubscribeListeners.messages();
      }

      Object.values(chatState.unsubscribeListeners.userStatus).forEach(
        (unsubscribe) => {
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        }
      );

      // Save cache before logout
      cacheManager.saveLastSeen();

      // Sign out from Firebase
      await auth.signOut();

      // Redirect to login page
      window.location.href = "../splash.html";
    } catch (error) {
      console.error("Error logging out:", error);
      showPopup("error", "Erro ao sair");
    }
  });
}

// Add logout event listener to user profile
document.addEventListener("DOMContentLoaded", () => {
  const userProfile = document.querySelector(".userProfile");
  if (userProfile) {
    userProfile.addEventListener("click", () => {
      confirmDialog(
        "Opções",
        "O que você deseja fazer?",
        async () => {
          // Logout option
          logout();
        },
        null,
        [
          { text: "Sair", action: logout },
          { text: "Cancelar", action: () => {} },
        ]
      );
    });
  }
});
