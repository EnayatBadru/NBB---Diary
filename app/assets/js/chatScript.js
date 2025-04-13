import { auth, firestore, realtimeDb } from "./firebaseConfig.js";
import { showPopup, confirmDialog } from "./popup.js";
import {
  updateOnlineStatus,
  getUserContacts,
  getAllUsers,
  // fetchUserData,
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
    onlineStatusInterval: null,
    visibilityChange: null,
  },
  isLoading: {
    contacts: true,
    messages: false,
    search: false,
  },
  searchCache: {},
  lastSeenTimestamps: {},
  isOnline: true,
  lastActivityTimestamp: Date.now(),
  // Cached DOM elements
  elements: {
    contactsList: null,
    messagesContainer: null,
    messageInput: null,
    sendButton: null,
  },
};

/**
 * Enhanced cache functions using localStorage with versioning and TTL
 */
const cacheManager = {
  version: "v1.2",
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
    // Don't cache sensitive data
    const safeUserData = { ...userData };
    delete safeUserData.token;
    delete safeUserData.authData;

    return this.set(`user_${userId}`, safeUserData);
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

  // Clear expired cache items
  clearExpired() {
    try {
      const keysToCheck = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(`chat_${this.version}_`)) {
          keysToCheck.push(key);
        }
      }

      const now = Date.now();
      keysToCheck.forEach((fullKey) => {
        try {
          const cached = localStorage.getItem(fullKey);
          if (cached) {
            const cacheItem = JSON.parse(cached);
            if (now - cacheItem.timestamp > this.ttl) {
              localStorage.removeItem(fullKey);
            }
          }
        } catch (err) {
          console.error(`Error checking cached item: ${fullKey}`, err);
        }
      });

      return true;
    } catch (e) {
      console.error("Error clearing expired cache:", e);
      return false;
    }
  },
};

/**
 * Utility function to process timestamps
 */
const timeUtils = {
  // Format time as HH:MM
  formatTime(timestamp) {
    if (!timestamp) return "";

    try {
      let date = this.convertToDate(timestamp);
      if (!date) return "";

      return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      console.error("Erro ao formatar timestamp:", error, timestamp);
      return "";
    }
  },

  // Convert various timestamp formats to Date object
  convertToDate(timestamp) {
    try {
      if (timestamp instanceof Date) {
        return timestamp;
      }

      if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
      }

      if (typeof timestamp === "number") {
        return new Date(timestamp);
      }

      if (typeof timestamp === "object" && timestamp?.seconds) {
        return new Date(timestamp.seconds * 1000);
      }

      return null;
    } catch (error) {
      console.error("Erro ao converter timestamp:", error, timestamp);
      return null;
    }
  },

  // Format date for messages, showing relative time or date as needed
  formatMessageDate(timestamp) {
    if (!timestamp) return "";

    let date = this.convertToDate(timestamp);
    if (!date) return "";

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

    let date = this.convertToDate(timestamp);
    if (!date) return "";

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
 * Utility functions for UI components
 */
const uiComponents = {
  // Create user avatar component
  createUserAvatar(user, size = 45) {
    if (!user) return "";

    if (user.photoURL) {
      return `<img src="${user.photoURL}" alt="${
        user.name || "Usuário"
      }" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">`;
    } else {
      // Get initials for avatar
      const initial = user.name ? user.name.charAt(0).toUpperCase() : "U";
      return `<div style="width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background-color:#1d2b3a;color:#00dfc4;font-weight:bold;font-size:${
        size * 0.4
      }px;">${initial}</div>`;
    }
  },

  // Create loading spinner
  createLoadingSpinner(size = 30, color = "#00dfc4", text = "Carregando...") {
    return `
      <div style="text-align:center;padding:20px;color:${color};">
        <div class="loading-spinner" style="width:${size}px;height:${size}px;border:${
      size * 0.1
    }px solid rgba(0,223,196,0.3);border-radius:50%;border-top-color:${color};animation:spin 1s linear infinite;display:inline-block;margin-bottom:10px;"></div>
        <p>${text}</p>
      </div>
    `;
  },

  // Create confirmation dialog
  createConfirmDialog(
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel
  ) {
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.7);z-index:10000;display:flex;justify-content:center;align-items:center;";

    const dialog = document.createElement("div");
    dialog.style.cssText =
      "background-color:#1d2b3a;border-radius:10px;padding:20px;width:90%;max-width:400px;color:#fff;";

    dialog.innerHTML = `
      <h3 style="margin-top:0;border-bottom:1px solid #00dfc4;padding-bottom:10px;">${title}</h3>
      <p>${message}</p>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button class="cancel-btn" style="padding:8px 16px;border-radius:5px;border:1px solid #00dfc4;background:transparent;color:#00dfc4;cursor:pointer;">${
          cancelText || "Cancelar"
        }</button>
        <button class="confirm-btn" style="padding:8px 16px;border-radius:5px;border:none;background-color:#00dfc4;color:#1d2b3a;cursor:pointer;font-weight:bold;">${
          confirmText || "Confirmar"
        }</button>
      </div>
    `;

    dialog.querySelector(".cancel-btn").addEventListener("click", () => {
      document.body.removeChild(backdrop);
      if (onCancel) onCancel();
    });

    dialog.querySelector(".confirm-btn").addEventListener("click", () => {
      document.body.removeChild(backdrop);
      if (onConfirm) onConfirm();
    });

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    return backdrop;
  },

  // Create a dialog with custom content
  createDialog(title, content, width = 450, closeCallback) {
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.7);z-index:10000;display:flex;justify-content:center;align-items:center;";

    const dialog = document.createElement("div");
    dialog.style.cssText = `background-color:#1d2b3a;border-radius:10px;padding:20px;width:90%;max-width:${width}px;max-height:80vh;overflow:auto;color:#fff;`;

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #00dfc4;padding-bottom:10px;";
    header.innerHTML = `
      <h3 style="margin:0;">${title}</h3>
      <button class="close-dialog" style="background:none;border:none;color:#00dfc4;font-size:24px;cursor:pointer;">×</button>
    `;

    const contentContainer = document.createElement("div");
    if (typeof content === "string") {
      contentContainer.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      contentContainer.appendChild(content);
    }

    dialog.appendChild(header);
    dialog.appendChild(contentContainer);
    backdrop.appendChild(dialog);

    // Close dialog handlers
    const closeDialog = () => {
      if (document.body.contains(backdrop)) {
        document.body.removeChild(backdrop);
        if (closeCallback) closeCallback();
      }
    };

    header
      .querySelector(".close-dialog")
      .addEventListener("click", closeDialog);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDialog();
    });

    document.body.appendChild(backdrop);

    return {
      dialog,
      contentContainer,
      backdrop,
      close: closeDialog,
    };
  },

  // Add ripple effect to element
  addRippleEffect(element) {
    element.addEventListener("click", function (e) {
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
  },
};

/**
 * Utility for event management to prevent memory leaks
 */
const eventManager = {
  listeners: {},

  // Add event with automatic cleanup
  addEvent(element, type, handler, options) {
    if (!element) return null;

    const id = Math.random().toString(36).substring(2);
    element.addEventListener(type, handler, options);

    this.listeners[id] = {
      element,
      type,
      handler,
    };

    return id;
  },

  // Remove specific event
  removeEvent(id) {
    if (!id || !this.listeners[id]) return;

    const { element, type, handler } = this.listeners[id];
    element.removeEventListener(type, handler);
    delete this.listeners[id];
  },

  // Add document click handler with automatic removal
  addDocumentClickHandler(handler, exceptElement) {
    const documentHandler = (e) => {
      if (!exceptElement || !exceptElement.contains(e.target)) {
        handler(e);
        document.removeEventListener("click", documentHandler);
      }
    };

    document.addEventListener("click", documentHandler);
    return documentHandler;
  },
};

/**
 * Initialize chat application
 */
document.addEventListener("DOMContentLoaded", () => {
  try {
    // Add styles for animations
    addGlobalStyles();

    initChatElements();
    setupAuth();

    // Try to show cached data first for instant loading
    cacheManager.loadConversations();
    cacheManager.loadLastSeen();

    // Clean expired cache items
    cacheManager.clearExpired();
  } catch (error) {
    console.error("Chat initialization error:", error);
    showPopup("error", "Erro ao iniciar o chat. Tente atualizar a página.");
  }
});

/**
 * Add global styles needed for animations and components
 */
function addGlobalStyles() {
  if (!document.getElementById("chat-global-styles")) {
    const style = document.createElement("style");
    style.id = "chat-global-styles";
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes typingAnimation {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-5px); }
        100% { transform: translateY(0px); }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Initialize UI elements and add event listeners
 */
function initChatElements() {
  // Cache DOM elements for better performance
  chatState.elements.contactsList = document.getElementById("menu");
  chatState.elements.messagesContainer = document.querySelector(
    ".mainSelectedMensages"
  );
  chatState.elements.messageInput = document.querySelector(".messageInput");
  chatState.elements.sendButton = document.querySelector(".sendButton");

  // Search functionality
  const searchInput = document.getElementById("searchUser");
  if (searchInput) {
    // Use debounce for search to avoid excessive queries
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => handleSearch(e), 300);
    });
  }

  // Message sending
  if (chatState.elements.sendButton && chatState.elements.messageInput) {
    chatState.elements.sendButton.addEventListener("click", () => {
      const text = chatState.elements.messageInput.value.trim();
      if (text) sendMessage(text);
    });

    chatState.elements.messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = chatState.elements.messageInput.value.trim();
        if (text) sendMessage(text);
      }
    });

    // Add typing indicator
    chatState.elements.messageInput.addEventListener(
      "input",
      handleTypingEvent
    );
  }

  // Navigation and UI buttons
  const backButton = document.querySelector(".backButtonMensages");
  if (backButton) backButton.addEventListener("click", handleBackToContacts);

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
  window.addEventListener("resize", adjustLayout);

  // Add scroll event listener for messages container for lazy loading
  if (chatState.elements.messagesContainer) {
    chatState.elements.messagesContainer.addEventListener(
      "scroll",
      handleMessagesScroll
    );
  }

  // Setup notification permission request
  requestNotificationPermission();

  // Setup online/offline status detection
  setupConnectionStatusListener();

  // Setup page visibility detection
  setupVisibilityChangeDetection();
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
 * Setup online status periodic check
 */
function setupOnlineStatusCheck() {
  // Clear previous interval if exists
  if (chatState.unsubscribeListeners.onlineStatusInterval) {
    clearInterval(chatState.unsubscribeListeners.onlineStatusInterval);
  }

  // Set online status initially
  updateUserOnlineStatus(true);

  // Setup interval for every 30 seconds
  chatState.unsubscribeListeners.onlineStatusInterval = setInterval(
    async () => {
      // Update last activity timestamp
      chatState.lastActivityTimestamp = Date.now();

      // Only update if user is still in chat app and we have authentication
      if (
        chatState.currentUser &&
        document.visibilityState === "visible" &&
        chatState.isOnline
      ) {
        try {
          await updateUserOnlineStatus(true);
        } catch (error) {
          console.error("Error updating online status:", error);
        }
      }
    },
    30000
  ); // 30 seconds

  // Setup event listener for user activity
  ["click", "keypress", "scroll", "mousemove"].forEach((eventType) => {
    document.addEventListener(eventType, () => {
      chatState.lastActivityTimestamp = Date.now();
    });
  });
}

/**
 * Update user online status
 */
async function updateUserOnlineStatus(isOnline) {
  try {
    if (!chatState.currentUser?.uid) return;

    chatState.isOnline = isOnline;

    // Update in Firestore
    await updateDoc(doc(firestore, "users", chatState.currentUser.uid), {
      isOnline: isOnline,
      lastSeen: serverTimestamp(),
    });

    // Update in Realtime Database for faster access
    await set(ref(realtimeDb, `status/${chatState.currentUser.uid}`), {
      isOnline: isOnline,
      lastSeen: rtServerTimestamp(),
    });

    // Update UI
    if (chatState.currentUser) {
      chatState.currentUser.isOnline = isOnline;
      updateUserUI(chatState.currentUser);
    }

    return true;
  } catch (error) {
    console.error("Error updating online status:", error);
    return false;
  }
}

/**
 * Setup visibility change detection
 */
function setupVisibilityChangeDetection() {
  // Remove previous listener if exists
  if (chatState.unsubscribeListeners.visibilityChange) {
    document.removeEventListener(
      "visibilitychange",
      chatState.unsubscribeListeners.visibilityChange
    );
  }

  // Create handler
  const visibilityChangeHandler = async () => {
    if (document.visibilityState === "visible") {
      // User came back to the app - set online
      if (chatState.currentUser?.uid) {
        await updateUserOnlineStatus(true);
        chatState.lastActivityTimestamp = Date.now();
      }
    } else {
      // User left the app - set offline
      if (chatState.currentUser?.uid) {
        await updateUserOnlineStatus(false);
      }
    }
  };

  // Add event listener
  document.addEventListener("visibilitychange", visibilityChangeHandler);

  // Store the handler for later cleanup
  chatState.unsubscribeListeners.visibilityChange = visibilityChangeHandler;
}

/**
 * Handle connection status change
 */
async function handleConnectionChange(e) {
  const isOnline = navigator.onLine;
  console.log(`Connection status: ${isOnline ? "online" : "offline"}`);

  chatState.isOnline = isOnline;

  if (isOnline && chatState.currentUser) {
    // Reconnect and update online status
    await updateUserOnlineStatus(true);
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

async function fetchUserData(userId) {
  try {
    if (!userId) {
      console.error("fetchUserData: userID is undefined");
      return null;
    }

    // Verificar cache primeiro
    const cachedUser = chatState.usersCache[userId];
    if (cachedUser) {
      return cachedUser;
    }

    console.log("Fetching user data for ID:", userId);

    const userDoc = await getDoc(doc(firestore, "users", userId));

    if (!userDoc.exists()) {
      console.log("User document does not exist:", userId);
      return null;
    }

    const userData = userDoc.data();

    // Adicionar o ID ao objeto de dados
    userData.id = userId;

    // Armazenar em cache
    chatState.usersCache[userId] = userData;
    cacheManager.saveUserData(userId, userData);

    console.log("User data fetched:", userData);

    return userData;
  } catch (error) {
    console.error(`Error fetching user data for ${userId}:`, error);
    return null;
  }
}

/**
 * Show typing indicator in the UI
 */
function showTypingIndicator(userIds) {
  const typingIndicator =
    document.querySelector(".typingIndicator") || createTypingIndicator();

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

    typingIndicator.querySelector(".typingText").textContent = text;
    typingIndicator.style.display = "flex";
  });
}

/**
 * Create typing indicator element
 */
function createTypingIndicator() {
  const container = document.querySelector(".SelectedMensages");
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "typingIndicator";
  typingIndicator.style.cssText =
    "display: none; align-items: center; padding: 5px 15px; color: #00dfc4; font-size: 0.9em;";

  typingIndicator.innerHTML = `
    <div class="typingDots" style="display: flex; margin-right: 8px;">
      <span style="width: 8px; height: 8px; background-color: #00dfc4; border-radius: 50%; margin-right: 4px; animation: typingAnimation 1s infinite 0s;"></span>
      <span style="width: 8px; height: 8px; background-color: #00dfc4; border-radius: 50%; margin-right: 4px; animation: typingAnimation 1s infinite 0.2s;"></span>
      <span style="width: 8px; height: 8px; background-color: #00dfc4; border-radius: 50%; animation: typingAnimation 1s infinite 0.4s;"></span>
    </div>
    <span class="typingText"></span>
  `;

  // Insert before the message input area
  const inputArea =
    container.querySelector(".containerInput") || container.lastElementChild;
  container.insertBefore(typingIndicator, inputArea);

  return typingIndicator;
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
    loadingIndicator.innerHTML = uiComponents.createLoadingSpinner(
      20,
      "#00dfc4",
      "Carregando mensagens anteriores..."
    );

    if (chatState.elements.messagesContainer) {
      const scrollHeight = chatState.elements.messagesContainer.scrollHeight;
      chatState.elements.messagesContainer.prepend(loadingIndicator);

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
            20
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
            const newScrollHeight =
              chatState.elements.messagesContainer.scrollHeight;
            chatState.elements.messagesContainer.scrollTop =
              newScrollHeight - scrollHeight;

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
      limit(messageLimit)
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

        // Set online status and setup online status check
        await updateUserOnlineStatus(true);
        setupOnlineStatusCheck();

        // Setup visibility change detection
        setupVisibilityChangeDetection();

        window.addEventListener("beforeunload", async (e) => {
          // We need to use synchronous localStorage to ensure data is saved before unload
          if (chatState.lastSeenTimestamps) {
            try {
              localStorage.setItem(
                "chat_v1.2_lastSeen",
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
          await updateUserOnlineStatus(false);
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
  const documentClickHandler = eventManager.addDocumentClickHandler(() => {
    if (document.body.contains(attachOptions)) {
      document.body.removeChild(attachOptions);
    }
  }, attachOptions);

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
    const dialogContent = `
      <div style="display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: center; margin-bottom: 15px; max-height: 300px; overflow: hidden;">
          <img src="${e.target.result}" style="max-width: 100%; max-height: 300px; object-fit: contain;">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px; color: #fff;">Adicionar legenda (opcional)</label>
          <input type="text" class="image-caption" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box;">
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button class="cancel-send" style="padding: 10px 15px; border-radius: 5px; border: 1px solid #00dfc4; background-color: transparent; color: #00dfc4; cursor: pointer;">Cancelar</button>
          <button class="confirm-send" style="padding: 10px 15px; border-radius: 5px; border: none; background-color: #00dfc4; color: #1d2b3a; cursor: pointer;">Enviar</button>
        </div>
      </div>
    `;

    const dialog = uiComponents.createDialog("Enviar imagem", dialogContent);

    dialog.contentContainer
      .querySelector(".cancel-send")
      .addEventListener("click", () => {
        dialog.close();
      });

    dialog.contentContainer
      .querySelector(".confirm-send")
      .addEventListener("click", () => {
        const caption = dialog.contentContainer
          .querySelector(".image-caption")
          .value.trim();
        dialog.close();

        // Here you would upload the image and send the message
        showPopup(
          "info",
          "Funcionalidade de envio de imagens será implementada em breve!"
        );
      });
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
  const documentClickHandler = eventManager.addDocumentClickHandler(() => {
    if (document.body.contains(emojiSelector)) {
      document.body.removeChild(emojiSelector);
    }
  }, emojiSelector);

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
    if (chatState.elements.messageInput) {
      const startPos = chatState.elements.messageInput.selectionStart;
      const endPos = chatState.elements.messageInput.selectionEnd;
      const text = chatState.elements.messageInput.value;

      // Insert emoji at cursor position
      chatState.elements.messageInput.value =
        text.substring(0, startPos) + emoji + text.substring(endPos);

      // Move cursor after the inserted emoji
      chatState.elements.messageInput.selectionStart =
        chatState.elements.messageInput.selectionEnd = startPos + emoji.length;

      // Focus the input
      chatState.elements.messageInput.focus();
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

    // Change message input placeholder
    if (chatState.elements.messageInput) {
      chatState.elements.messageInput.placeholder =
        "Gravando mensagem de voz...";
      chatState.elements.messageInput.disabled = true;
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
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    `;

    // Reset message input
    if (chatState.elements.messageInput) {
      chatState.elements.messageInput.placeholder = "Digite uma mensagem...";
      chatState.elements.messageInput.disabled = false;
      chatState.elements.messageInput.focus();
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
  if (profileContainer) {
    profileContainer.innerHTML = uiComponents.createUserAvatar(user, 100);
  }
}

/**
 * Setup listener for user online status
 */
function setupUserStatusListener(userId) {
  // Primeiramente, configurar escuta no Realtime Database para atualizações mais rápidas
  const userStatusRef = ref(realtimeDb, `status/${userId}`);

  const unsubscribeRealtime = onValue(userStatusRef, (snapshot) => {
    const status = snapshot.val();
    if (status && chatState.currentUser) {
      chatState.currentUser.isOnline = status.isOnline;
      updateUserUI(chatState.currentUser);
    }
  });

  // Também escutar mudanças no Firestore
  const userDoc = doc(firestore, "users", userId);

  const unsubscribeFirestore = onSnapshot(userDoc, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const userData = docSnapshot.data();
      if (chatState.currentUser) {
        chatState.currentUser.isOnline = userData.isOnline;
        // Atualizar outros campos que possam ter mudado
        chatState.currentUser = { ...chatState.currentUser, ...userData };
        updateUserUI(chatState.currentUser);
      }
    }
  });

  // Store the unsubscribe functions
  chatState.unsubscribeListeners.userStatus[userId] = () => {
    unsubscribeRealtime();
    unsubscribeFirestore();
  };

  return () => {
    unsubscribeRealtime();
    unsubscribeFirestore();
  };
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

    // Fetch user data in batches for better performance
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
  const contactsList = chatState.elements.contactsList;
  if (!contactsList) return;

  if (isLoading) {
    let loadingItem = contactsList.querySelector(".chat-loading");

    if (!loadingItem) {
      loadingItem = document.createElement("li");
      loadingItem.className = "chat-loading";
      loadingItem.innerHTML = uiComponents.createLoadingSpinner(
        30,
        "#00dfc4",
        message
      );

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
  const contactsList = chatState.elements.contactsList;
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
  document.querySelectorAll("#menu li .list").forEach((item) => {
    uiComponents.addRippleEffect(item);
  });
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

  // Create a title for search results
  const titleElement = document.createElement("div");
  titleElement.className = "search-results-title";
  titleElement.style.cssText =
    "padding: 10px 15px; color: #00dfc4; font-size: 0.9em; border-bottom: 1px solid rgba(0, 223, 196, 0.2);";
  titleElement.textContent = `Resultados da busca (${results.length})`;
  contactsList.appendChild(titleElement);

  // Display each result
  results.forEach((user) => {
    const listItem = document.createElement("li");

    // Check if this user already has a conversation with the current user
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
          ${uiComponents.createUserAvatar(user, 45)}
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

  // Add event listeners to search results
  document.querySelectorAll("#menu li .list.search-result").forEach((item) => {
    item.addEventListener("click", async () => {
      const userId = item.getAttribute("data-user-id");
      const existingConversationId = item.getAttribute(
        "data-existing-conversation"
      );

      if (existingConversationId) {
        // Open existing conversation
        await openConversation(existingConversationId);
      } else {
        // Create new conversation
        await createConversation(userId);
      }

      // Clear search input
      document.getElementById("searchUser").value = "";

      // Update UI
      renderContacts();
      showConversationView();
    });
  });
}

/**
 * Render conversations with improved UI and organization
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

  // Group conversations by date of last message
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  // Sort conversations into groups
  chatState.conversations.forEach((conversation) => {
    const lastMessageDate =
      timeUtils.convertToDate(conversation.lastMessageAt) || new Date(0);
    lastMessageDate.setHours(0, 0, 0, 0);

    if (lastMessageDate.getTime() === today.getTime()) {
      groups.today.push(conversation);
    } else if (lastMessageDate.getTime() === yesterday.getTime()) {
      groups.yesterday.push(conversation);
    } else if (lastMessageDate >= lastWeek) {
      groups.thisWeek.push(conversation);
    } else {
      groups.older.push(conversation);
    }
  });

  // Function to render a group of conversations
  const renderGroup = (conversations, title) => {
    if (conversations.length === 0) return;

    // Create group header
    const groupHeader = document.createElement("div");
    groupHeader.className = "conversation-group-header";
    groupHeader.style.cssText =
      "padding: 5px 15px; color: #00dfc4; font-size: 0.8em; opacity: 0.8;";
    groupHeader.textContent = title;
    contactsList.appendChild(groupHeader);

    // Render conversations in this group
    conversations.forEach((conversation) =>
      renderConversationItem(contactsList, conversation)
    );
  };

  // Render each group
  renderGroup(groups.today, "Hoje");
  renderGroup(groups.yesterday, "Ontem");
  renderGroup(groups.thisWeek, "Esta semana");
  renderGroup(groups.older, "Anteriores");

  // Add click handlers to all conversation items
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
 * Render a single conversation item
 */
function renderConversationItem(contactsList, conversation) {
  let displayName = conversation.isGroup
    ? conversation.name || "Grupo"
    : "Conversa";
  let lastMessagePreview = conversation.lastMessage || "Iniciar conversa...";
  let otherParticipantData = null;

  // For regular conversations, get the other participant's details
  if (!conversation.isGroup) {
    const otherParticipantId = conversation.participants.find(
      (id) => id !== chatState.currentUser.uid
    );

    otherParticipantData =
      chatState.contacts.find((contact) => contact.id === otherParticipantId) ||
      chatState.usersCache[otherParticipantId];

    if (!otherParticipantData) {
      // If we don't have the user data yet, fetch it asynchronously
      fetchUserData(otherParticipantId).then((data) => {
        if (data) {
          chatState.usersCache[otherParticipantId] = data;
          cacheManager.saveUserData(otherParticipantId, data);
          renderContacts(); // Re-render to show the new data
        }
      });

      // Use placeholder data while we fetch
      otherParticipantData = {
        id: otherParticipantId,
        name: "Carregando...",
        isOnline: false,
      };
    }

    displayName = otherParticipantData.name;
  }

  // Get unread count and format timestamps
  const unreadCount =
    conversation.unreadCount?.[chatState.currentUser.uid] || 0;
  const lastMessageTime = conversation.lastMessageAt
    ? timeUtils.formatTime(conversation.lastMessageAt)
    : "";

  // Determine if this is the active conversation
  const isActive = chatState.activeConversation?.id === conversation.id;

  // Create list item
  const listItem = document.createElement("li");

  // Truncate message preview if too long
  if (lastMessagePreview.length > 40) {
    lastMessagePreview = lastMessagePreview.substring(0, 37) + "...";
  }

  // If this is a media message, show appropriate preview
  if (conversation.lastMessageType === "image") {
    lastMessagePreview = "📷 Imagem";
  } else if (conversation.lastMessageType === "audio") {
    lastMessagePreview = "🎤 Mensagem de voz";
  } else if (conversation.lastMessageType === "file") {
    lastMessagePreview = "📎 Arquivo";
  } else if (conversation.lastMessageType === "location") {
    lastMessagePreview = "📍 Localização";
  }

  // If message was sent by the current user, prefix with "Você: "
  if (conversation.lastMessageSenderId === chatState.currentUser.uid) {
    lastMessagePreview = `Você: ${lastMessagePreview}`;
  }

  // Construct the HTML
  listItem.innerHTML = `
    <div class="list ${isActive ? "active" : ""} ${
    unreadCount > 0 ? "unread" : ""
  }" data-conversation-id="${conversation.id}">
      <button type="button" class="button__pic">
        ${
          conversation.isGroup
            ? `<div style="width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; color: #00dfc4; font-weight: bold; font-size: 16px;">${
                conversation.name
                  ? conversation.name.charAt(0).toUpperCase()
                  : "G"
              }</div>`
            : uiComponents.createUserAvatar(otherParticipantData, 45)
        }
        ${
          !conversation.isGroup && otherParticipantData?.isOnline
            ? `<span class="online-indicator" style="position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; border-radius: 50%; background-color: #4CAF50; border: 2px solid #1d2b3a;"></span>`
            : ""
        }
      </button>
      <button type="button" class="button__user">
        <div class="container__left">
          <span class="nameUser__message">${displayName}</span>
          <span class="messageUser ${
            unreadCount > 0 ? "unread-message" : ""
          }">${lastMessagePreview}</span>
        </div>
        <div class="container__right">
          <span class="Time__message">${lastMessageTime}</span>
          ${
            unreadCount > 0
              ? `<span class="length__message">${
                  unreadCount > 99 ? "99+" : unreadCount
                }</span>`
              : ""
          }
          ${
            conversation.isGroup &&
            conversation.typing &&
            conversation.typing.length > 0
              ? `<span class="typing-indicator" style="font-size: 0.7em; color: #00dfc4;">digitando...</span>`
              : ""
          }
        </div>
      </button>
    </div>
  `;

  contactsList.appendChild(listItem);
}

/**
 * Handle search input changes with debounce
 */
function handleSearch(e) {
  renderContacts();
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
    showPopup("error", "Erro ao iniciar conversa");
    throw error;
  }
}

/**
 * Send a system message to a conversation
 */
async function sendSystemMessage(conversationId, text) {
  try {
    // Create system message
    const systemMessage = {
      text: text,
      senderId: "system",
      timestamp: Date.now(),
      status: "delivered",
      type: "system",
    };

    // Add to realtime database
    const messagesRef = ref(realtimeDb, `messages/${conversationId}`);
    const newMessageRef = push(messagesRef);
    await set(newMessageRef, systemMessage);

    // Add to Firestore for persistence
    await addDoc(
      collection(firestore, `conversations/${conversationId}/messages`),
      {
        text: text,
        senderId: "system",
        timestamp: Timestamp.fromDate(new Date(systemMessage.timestamp)),
        status: "delivered",
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
 * Open an existing conversation and load messages with optimized caching
 */
async function openConversation(conversationId) {
  try {
    // Show loading state
    chatState.isLoading.messages = true;
    showMessagesLoading(true);

    // Get conversation data
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

    // Load participants data
    let participants = [];

    if (conversationData.isGroup) {
      // For groups, load all participants
      const participantPromises = conversationData.participants.map(
        async (participantId) => {
          if (participantId === chatState.currentUser.uid) {
            return chatState.currentUser;
          }

          // Try cache first
          let userData = chatState.usersCache[participantId];

          if (!userData) {
            userData = await fetchUserData(participantId);
            if (userData) {
              chatState.usersCache[participantId] = userData;
              cacheManager.saveUserData(participantId, userData);
            }
          }

          return userData || { id: participantId, name: "Usuário" };
        }
      );

      participants = await Promise.all(participantPromises);
    } else {
      // For direct conversations, just load the other user
      const otherParticipantId = conversationData.participants.find(
        (id) => id !== chatState.currentUser.uid
      );

      if (otherParticipantId) {
        // Try cache first
        let userData = chatState.usersCache[otherParticipantId];

        if (!userData) {
          userData = await fetchUserData(otherParticipantId);
          if (userData) {
            chatState.usersCache[otherParticipantId] = userData;
            cacheManager.saveUserData(otherParticipantId, userData);
          }
        }

        if (userData) {
          participants.push(userData);
        } else {
          participants.push({ id: otherParticipantId, name: "Usuário" });
        }
      }
    }

    console.log("Participants loaded:", participants);

    // Update active conversation state
    chatState.activeConversation = {
      ...conversationData,
      id: conversationId,
      participants,
    };

    // Reset unread count
    if (conversationData.unreadCount?.[chatState.currentUser.uid] > 0) {
      await updateDoc(doc(firestore, "conversations", conversationId), {
        [`unreadCount.${chatState.currentUser.uid}`]: 0,
      });

      // Update local state to reflect this change
      const conversationIndex = chatState.conversations.findIndex(
        (c) => c.id === conversationId
      );

      if (conversationIndex !== -1) {
        chatState.conversations[conversationIndex] = {
          ...chatState.conversations[conversationIndex],
          unreadCount: {
            ...chatState.conversations[conversationIndex].unreadCount,
            [chatState.currentUser.uid]: 0,
          },
        };

        cacheManager.saveConversations();
      }
    }

    // Update UI with conversation data
    updateConversationUI();

    // Try to load messages from cache first
    const messagesLoaded = cacheManager.loadMessages(conversationId);

    // Load messages from Firestore
    await loadMessages(conversationId);

    // Setup listeners for real-time updates
    setupMessagesListener(conversationId);
    setupTypingIndicatorsListener(conversationId);

    // Mark messages as read
    await markMessagesAsRead(conversationId);

    // Update last seen timestamp
    updateLastSeen(conversationId);

    // Update loading state
    chatState.isLoading.messages = false;
    showMessagesLoading(false);

    return chatState.activeConversation;
  } catch (error) {
    console.error("Error opening conversation:", error);
    showPopup("error", "Erro ao abrir conversa");
    chatState.isLoading.messages = false;
    showMessagesLoading(false);
    throw error;
  }
}

/**
 * Update last seen timestamp for a conversation
 */
function updateLastSeen(conversationId) {
  if (!chatState.currentUser || !conversationId) return;

  // Update timestamp locally
  chatState.lastSeenTimestamps[conversationId] = Date.now();
  cacheManager.saveLastSeen();

  // Update in database
  const lastSeenRef = doc(
    firestore,
    `conversations/${conversationId}/lastSeen`,
    chatState.currentUser.uid
  );
  setDoc(
    lastSeenRef,
    {
      timestamp: serverTimestamp(),
      userId: chatState.currentUser.uid,
    },
    { merge: true }
  );
}

/**
 * Mark all messages in conversation as read
 */
async function markMessagesAsRead(conversationId) {
  if (!chatState.currentUser || !conversationId) return;

  try {
    // Get unread messages
    const unreadMessages = chatState.messages.filter(
      (msg) =>
        msg.senderId !== chatState.currentUser.uid && msg.status !== "read"
    );

    if (unreadMessages.length === 0) return;

    // Update status in Realtime Database
    const batch = [];

    unreadMessages.forEach((msg) => {
      batch.push(
        update(ref(realtimeDb, `messages/${conversationId}/${msg.id}`), {
          status: "read",
        })
      );
    });

    await Promise.all(batch);

    // Update UI
    unreadMessages.forEach((msg) => {
      const index = chatState.messages.findIndex((m) => m.id === msg.id);
      if (index !== -1) {
        chatState.messages[index].status = "read";
      }
    });

    renderMessages();
    cacheManager.saveMessages(conversationId);

    return true;
  } catch (error) {
    console.error("Error marking messages as read:", error);
    return false;
  }
}

/**
 * Show loading indicator while messages are being fetched
 */
function showMessagesLoading(isLoading) {
  const conversationArea = chatState.elements.messagesContainer;
  if (!conversationArea) return;

  if (isLoading) {
    conversationArea.innerHTML = uiComponents.createLoadingSpinner(
      40,
      "#00dfc4",
      "Carregando mensagens..."
    );
  }
  // We'll leave the clearance of content to the rendering function
}

/**
 * Update conversation UI in the header area
 */
function updateConversationUI() {
  if (!chatState.activeConversation) return;

  const { isGroup, participants, name, typing } = chatState.activeConversation;

  // Update conversation name
  const headerName = document.querySelector(".nameUserMensages");
  if (headerName) {
    headerName.textContent = isGroup
      ? name || "Grupo"
      : participants[0]?.name || "Conversa";
  }

  // Update online status indicator for direct conversations
  const onlineStatus = document.querySelector(".userStatusMensages");
  if (onlineStatus) {
    if (!isGroup && participants[0]) {
      onlineStatus.style.display = "inline-block";
      onlineStatus.style.backgroundColor = participants[0].isOnline
        ? "#4CAF50"
        : "#ccc";
      onlineStatus.title = participants[0].isOnline ? "Online" : "Offline";
    } else {
      onlineStatus.style.display = "none";
    }
  }

  // Update user/group photo
  const headerPhoto = document.querySelector(".ProfileMensagesPic");
  if (headerPhoto) {
    if (isGroup) {
      // Show group avatar with first letter
      headerPhoto.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #1d2b3a; border-radius: 50%; color: #00dfc4; font-weight: bold; font-size: 18px;">
          ${name ? name.charAt(0).toUpperCase() : "G"}
        </div>
      `;
    } else {
      // Show user avatar
      const otherParticipant = participants[0];
      headerPhoto.innerHTML = uiComponents.createUserAvatar(
        otherParticipant,
        40
      );
    }
  }

  // Update participants info for group conversations
  const participantsInfo = document.querySelector(
    ".headerMensages .participantsInfo"
  );
  if (!participantsInfo && isGroup) {
    // Create participants info element if it doesn't exist
    const headerRight = document.querySelector(".headerMensages .right");
    if (headerRight) {
      const infoElement = document.createElement("div");
      infoElement.className = "participantsInfo";
      infoElement.style.cssText =
        "font-size: 0.8em; color: #ccc; margin-top: 2px;";
      infoElement.textContent = `${participants.length} participantes`;
      headerRight.appendChild(infoElement);
    }
  } else if (participantsInfo) {
    if (isGroup) {
      participantsInfo.style.display = "block";
      participantsInfo.textContent = `${participants.length} participantes`;
    } else {
      participantsInfo.style.display = "none";
    }
  }

  // Enable message input
  if (chatState.elements.messageInput) {
    chatState.elements.messageInput.disabled = false;
    chatState.elements.messageInput.placeholder = "Digite uma mensagem...";
    chatState.elements.messageInput.focus();
  }

  // Show conversation actions button
  const actionsButton = document.querySelector(".conversationActions");
  if (!actionsButton) {
    const headerMensages = document.querySelector(".headerMensages");
    if (headerMensages) {
      const actionsBtn = document.createElement("button");
      actionsBtn.className = "conversationActions";
      actionsBtn.style.cssText =
        "background: none; border: none; color: #00dfc4; margin-left: 10px; cursor: pointer;";
      actionsBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
          <circle cx="5" cy="12" r="1"></circle>
        </svg>
      `;
      actionsBtn.addEventListener("click", showConversationMenu);

      const rightContainer = headerMensages.querySelector(".right");
      if (rightContainer) {
        rightContainer.appendChild(actionsBtn);
      }
    }
  }
}

/**
 * Show conversation options menu
 */
function showConversationMenu(e) {
  e.stopPropagation();

  // Create menu
  const menu = document.createElement("div");
  menu.className = "conversation-menu";
  menu.style.cssText =
    "position: absolute; right: 20px; top: 50px; background-color: #1d2b3a; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 100; min-width: 150px;";

  const options = [];

  if (chatState.activeConversation?.isGroup) {
    // Group conversation options
    options.push(
      { label: "Informações do grupo", icon: "info", action: showGroupInfo },
      {
        label: "Adicionar participante",
        icon: "user-plus",
        action: addGroupParticipant,
      },
      { label: "Sair do grupo", icon: "log-out", action: leaveGroup }
    );
  } else {
    // Direct conversation options
    options.push(
      { label: "Ver perfil", icon: "user", action: viewUserProfile },
      { label: "Limpar conversa", icon: "trash-2", action: clearConversation },
      { label: "Bloquear usuário", icon: "slash", action: blockUser }
    );
  }

  // Common options for all conversations
  options.push(
    {
      label: "Arquivar conversa",
      icon: "archive",
      action: archiveConversation,
    },
    {
      label: "Silenciar notificações",
      icon: "bell-off",
      action: muteConversation,
    }
  );

  // Create menu items
  options.forEach((option) => {
    const item = document.createElement("div");
    item.className = "menu-item";
    item.style.cssText =
      "padding: 10px 15px; display: flex; align-items: center; cursor: pointer; transition: background-color 0.2s;";

    item.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px;">
        ${getIconPath(option.icon)}
      </svg>
      <span style="color: white;">${option.label}</span>
    `;

    item.addEventListener("mouseenter", () => {
      item.style.backgroundColor = "rgba(0, 223, 196, 0.1)";
    });

    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "transparent";
    });

    item.addEventListener("click", () => {
      if (document.body.contains(menu)) {
        document.body.removeChild(menu);
      }
      option.action();
    });

    menu.appendChild(item);
  });

  // Add to document
  document.body.appendChild(menu);

  // Close when clicking outside
  const documentClickHandler = eventManager.addDocumentClickHandler(() => {
    if (document.body.contains(menu)) {
      document.body.removeChild(menu);
    }
  }, menu);

  // Helper function to get SVG path for icons
  function getIconPath(icon) {
    switch (icon) {
      case "info":
        return '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';
      case "user-plus":
        return '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line>';
      case "log-out":
        return '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>';
      case "user":
        return '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>';
      case "trash-2":
        return '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>';
      case "slash":
        return '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>';
      case "archive":
        return '<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>';
      case "bell-off":
        return '<path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
      default:
        return "";
    }
  }
}

/**
 * Conversation action handlers
 */
function showGroupInfo() {
  if (!chatState.activeConversation?.isGroup) return;

  const { name, participants, createdAt } = chatState.activeConversation;

  const content = document.createElement("div");

  // Group avatar and name
  const groupInfo = document.createElement("div");
  groupInfo.style.cssText =
    "display: flex; flex-direction: column; align-items: center; margin-bottom: 20px;";
  groupInfo.innerHTML = `
    <div style="width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background-color: #00dfc4; color: #1d2b3a; font-size: 32px; font-weight: bold; margin-bottom: 10px;">
      ${name ? name.charAt(0).toUpperCase() : "G"}
    </div>
    <h2 style="margin: 0;">${name || "Grupo"}</h2>
    <p style="margin: 5px 0; color: #ccc; font-size: 0.9em;">Criado em ${
      createdAt
        ? timeUtils.convertToDate(createdAt)?.toLocaleDateString() ||
          "data desconhecida"
        : "data desconhecida"
    }</p>
  `;

  // Edit group name button
  const editNameBtn = document.createElement("button");
  editNameBtn.style.cssText =
    "background: none; border: 1px solid #00dfc4; color: #00dfc4; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.9em; margin-top: 10px;";
  editNameBtn.textContent = "Editar nome";
  editNameBtn.addEventListener("click", () => {
    const newName = prompt("Digite o novo nome do grupo:", name);
    if (newName && newName.trim() && newName !== name) {
      updateGroupName(chatState.activeConversation.id, newName.trim());
    }
  });
  groupInfo.appendChild(editNameBtn);

  // Participants list
  const participantsList = document.createElement("div");
  participantsList.style.cssText = "margin-top: 20px;";
  participantsList.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <h4 style="margin: 0;">Participantes (${participants.length})</h4>
      <button class="add-participant" style="background: none; border: none; color: #00dfc4; font-size: 0.9em; cursor: pointer; display: flex; align-items: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Adicionar
      </button>
    </div>
    <div class="participants-container" style="max-height: 300px; overflow-y: auto;"></div>
  `;

  const participantsContainer = participantsList.querySelector(
    ".participants-container"
  );

  // Add participants to list
  participants.forEach((participant) => {
    const isCurrentUser = participant.id === chatState.currentUser.uid;
    const item = document.createElement("div");
    item.style.cssText =
      "display: flex; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);";

    item.innerHTML = `
      <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; margin-right: 10px;">
        ${uiComponents.createUserAvatar(participant, 40)}
      </div>
      <div style="flex-grow: 1;">
        <div style="font-weight: bold;">${participant.name}${
      isCurrentUser ? " (Você)" : ""
    }</div>
        <div style="font-size: 0.8em; color: #ccc;">${
          participant.isOnline ? "Online" : "Offline"
        }</div>
      </div>
      ${
        !isCurrentUser
          ? `
        <button class="remove-participant" data-user-id="${participant.id}" style="background: none; border: none; color: #f44336; cursor: pointer;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </button>
      `
          : ""
      }
    `;

    participantsContainer.appendChild(item);
  });

  // Attach event listeners for participant actions
  participantsList
    .querySelector(".add-participant")
    .addEventListener("click", () => {
      dialog.close();
      addGroupParticipant();
    });

  participantsList.querySelectorAll(".remove-participant").forEach((button) => {
    button.addEventListener("click", (e) => {
      const userId = e.currentTarget.getAttribute("data-user-id");

      uiComponents.createConfirmDialog(
        "Remover participante",
        "Tem certeza que deseja remover este participante do grupo?",
        "Remover",
        "Cancelar",
        () => {
          removeGroupParticipant(chatState.activeConversation.id, userId);
          dialog.close();
        }
      );
    });
  });

  // Leave group button
  const leaveButton = document.createElement("button");
  leaveButton.style.cssText =
    "width: 100%; background-color: #f44336; color: white; border: none; padding: 10px; border-radius: 5px; margin-top: 20px; cursor: pointer;";
  leaveButton.textContent = "Sair do grupo";
  leaveButton.addEventListener("click", () => {
    uiComponents.createConfirmDialog(
      "Sair do grupo",
      "Tem certeza que deseja sair deste grupo?",
      "Sair",
      "Cancelar",
      () => {
        dialog.close();
        leaveGroup();
      }
    );
  });

  // Assemble content
  content.appendChild(groupInfo);
  content.appendChild(participantsList);
  content.appendChild(leaveButton);

  // Create dialog
  const dialog = uiComponents.createDialog(
    "Informações do Grupo",
    content,
    450
  );
}

/**
 * Update group name
 */
async function updateGroupName(groupId, newName) {
  try {
    await updateDoc(doc(firestore, "conversations", groupId), {
      name: newName,
      updatedAt: serverTimestamp(),
    });

    // Send system message about name change
    await sendSystemMessage(
      groupId,
      `${
        chatState.currentUser.name || "Um usuário"
      } alterou o nome do grupo para "${newName}"`
    );

    showPopup("success", "Nome do grupo atualizado!");
  } catch (error) {
    console.error("Error updating group name:", error);
    showPopup("error", "Erro ao atualizar nome do grupo");
  }
}

/**
 * Add participant to group
 */
function addGroupParticipant() {
  if (!chatState.activeConversation?.isGroup) return;

  // Get current participants
  const currentParticipantIds = chatState.activeConversation.participants.map(
    (p) => (typeof p === "string" ? p : p.id)
  );

  // Create search container
  const content = document.createElement("div");

  // Selected users container
  const selectedContainer = document.createElement("div");
  selectedContainer.style.cssText =
    "display: flex; flex-wrap: wrap; gap: 5px; margin: 15px 0;";

  // Search input
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Buscar usuários...";
  searchInput.style.cssText =
    "width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box; margin-bottom: 15px;";

  // Results container
  const resultsContainer = document.createElement("div");
  resultsContainer.style.cssText = "max-height: 300px; overflow-y: auto;";

  // Selected users array
  let selectedUsers = [];

  // Function to render selected users
  function renderSelectedUsers() {
    selectedContainer.innerHTML = "";

    if (selectedUsers.length === 0) {
      selectedContainer.innerHTML = `<div style="color: #ccc; width: 100%; text-align: center; padding: 10px;">Nenhum usuário selecionado</div>`;
      return;
    }

    selectedUsers.forEach((user) => {
      const userTag = document.createElement("div");
      userTag.style.cssText =
        "background-color: #00dfc4; color: #1d2b3a; padding: 5px 10px; border-radius: 15px; font-size: 0.9em; display: flex; align-items: center;";
      userTag.textContent = user.name;

      // Remove button
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

  // Initial render
  renderSelectedUsers();

  // Search users function
  let searchTimeout;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const searchTerm = searchInput.value.trim();

      if (searchTerm.length < 2) {
        resultsContainer.innerHTML = `<div style="text-align: center; padding: 10px; color: #ccc;">Digite pelo menos 2 caracteres para buscar</div>`;
        return;
      }

      resultsContainer.innerHTML = uiComponents.createLoadingSpinner(
        20,
        "#00dfc4",
        "Buscando usuários..."
      );

      try {
        // Get users that aren't already in the group
        const users = await getAllUsers();
        const filteredUsers = users.filter(
          (user) =>
            // Not in current participants
            !currentParticipantIds.includes(user.id) &&
            // Not current user
            user.id !== chatState.currentUser.uid &&
            // Matches search term
            user.name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (filteredUsers.length === 0) {
          resultsContainer.innerHTML = `<div style="text-align: center; padding: 10px; color: #ccc;">Nenhum usuário encontrado</div>`;
          return;
        }

        // Render users
        resultsContainer.innerHTML = "";
        filteredUsers.forEach((user) => {
          const isSelected = selectedUsers.some((u) => u.id === user.id);

          const userItem = document.createElement("div");
          userItem.style.cssText = `
            display: flex; 
            align-items: center; 
            padding: 10px; 
            border-radius: 5px; 
            cursor: pointer; 
            background-color: ${
              isSelected ? "rgba(0, 223, 196, 0.2)" : "transparent"
            }; 
            margin-bottom: 5px;
            transition: background-color 0.2s;
          `;

          userItem.innerHTML = `
            <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; margin-right: 10px;">
              ${uiComponents.createUserAvatar(user, 40)}
            </div>
            <div style="flex-grow: 1;">
              <div style="font-weight: bold;">${user.name}</div>
              <div style="font-size: 0.8em; color: #ccc;">${
                user.email || user.userType || ""
              }</div>
            </div>
            <div style="margin-left: 10px;">
              ${
                isSelected
                  ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
                  : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`
              }
            </div>
          `;

          userItem.addEventListener("mouseenter", () => {
            if (!isSelected)
              userItem.style.backgroundColor = "rgba(0, 223, 196, 0.1)";
          });

          userItem.addEventListener("mouseleave", () => {
            if (!isSelected) userItem.style.backgroundColor = "transparent";
          });

          userItem.addEventListener("click", () => {
            if (isSelected) {
              // Remove from selection
              selectedUsers = selectedUsers.filter((u) => u.id !== user.id);
            } else {
              // Add to selection
              selectedUsers.push(user);
            }
            renderSelectedUsers();
          });

          resultsContainer.appendChild(userItem);
        });
      } catch (error) {
        console.error("Error searching users:", error);
        resultsContainer.innerHTML = `<div style="text-align: center; padding: 10px; color: #f44336;">Erro ao buscar usuários</div>`;
      }
    }, 500);
  });

  // Add button
  const addButton = document.createElement("button");
  addButton.style.cssText =
    "width: 100%; background-color: #00dfc4; color: #1d2b3a; border: none; padding: 10px; border-radius: 5px; margin-top: 20px; cursor: pointer; font-weight: bold;";
  addButton.textContent = "Adicionar Participantes";
  addButton.addEventListener("click", async () => {
    if (selectedUsers.length === 0) {
      showPopup(
        "warning",
        "Selecione pelo menos um usuário para adicionar ao grupo"
      );
      return;
    }

    dialog.contentContainer.innerHTML = uiComponents.createLoadingSpinner(
      30,
      "#00dfc4",
      "Adicionando participantes..."
    );

    try {
      await addParticipantsToGroup(
        chatState.activeConversation.id,
        selectedUsers.map((u) => u.id)
      );

      dialog.close();
      showPopup("success", "Participantes adicionados com sucesso!");
    } catch (error) {
      console.error("Error adding participants:", error);
      showPopup("error", "Erro ao adicionar participantes");
      dialog.close();
    }
  });

  // Assemble content
  content.appendChild(selectedContainer);
  content.appendChild(searchInput);
  content.appendChild(resultsContainer);
  content.appendChild(addButton);

  // Create dialog
  const dialog = uiComponents.createDialog(
    "Adicionar Participantes",
    content,
    450
  );

  // Focus search input
  setTimeout(() => searchInput.focus(), 100);
}

/**
 * Add participants to group
 */
async function addParticipantsToGroup(groupId, userIds) {
  if (!userIds || userIds.length === 0) return;

  try {
    const groupRef = doc(firestore, "conversations", groupId);

    // Get current group data
    const groupDoc = await getDoc(groupRef);
    if (!groupDoc.exists()) throw new Error("Group does not exist");

    const groupData = groupDoc.data();
    const currentParticipants = groupData.participants || [];

    // Add new participants
    const newParticipants = [...new Set([...currentParticipants, ...userIds])];

    // Update group
    await updateDoc(groupRef, {
      participants: newParticipants,
      updatedAt: serverTimestamp(),
    });

    // Get added user names for the system message
    const addedUserPromises = userIds.map(async (userId) => {
      const userData =
        chatState.usersCache[userId] || (await fetchUserData(userId));
      return userData?.name || "Novo usuário";
    });

    const addedUserNames = await Promise.all(addedUserPromises);

    // Send system message
    await sendSystemMessage(
      groupId,
      `${
        chatState.currentUser.name || "Usuário"
      } adicionou ${addedUserNames.join(", ")} ao grupo`
    );

    return true;
  } catch (error) {
    console.error("Error adding participants to group:", error);
    throw error;
  }
}

/**
 * Remove participant from group
 */
async function removeGroupParticipant(groupId, userId) {
  try {
    const groupRef = doc(firestore, "conversations", groupId);

    // Get current group data
    const groupDoc = await getDoc(groupRef);
    if (!groupDoc.exists()) throw new Error("Group does not exist");

    const groupData = groupDoc.data();
    const currentParticipants = groupData.participants || [];

    // Remove participant
    const newParticipants = currentParticipants.filter((id) => id !== userId);

    // Update group
    await updateDoc(groupRef, {
      participants: newParticipants,
      updatedAt: serverTimestamp(),
    });

    // Get removed user name
    const userData =
      chatState.usersCache[userId] || (await fetchUserData(userId));
    const userName = userData?.name || "Usuário";

    // Send system message
    await sendSystemMessage(
      groupId,
      `${chatState.currentUser.name || "Usuário"} removeu ${userName} do grupo`
    );

    showPopup("success", "Participante removido com sucesso!");

    return true;
  } catch (error) {
    console.error("Error removing participant from group:", error);
    showPopup("error", "Erro ao remover participante");
    throw error;
  }
}

/**
 * Leave group
 */
async function leaveGroup() {
  if (!chatState.activeConversation?.isGroup) return;

  try {
    const groupId = chatState.activeConversation.id;
    const groupRef = doc(firestore, "conversations", groupId);

    // Get current group data
    const groupDoc = await getDoc(groupRef);
    if (!groupDoc.exists()) throw new Error("Group does not exist");

    const groupData = groupDoc.data();
    const currentParticipants = groupData.participants || [];

    // Remove current user
    const newParticipants = currentParticipants.filter(
      (id) => id !== chatState.currentUser.uid
    );

    // If no participants left, delete the group
    if (newParticipants.length === 0) {
      // TODO: implement group deletion logic
      showPopup("warning", "Você era o último membro. O grupo será arquivado.");
    } else {
      // Update group
      await updateDoc(groupRef, {
        participants: newParticipants,
        updatedAt: serverTimestamp(),
      });

      // Send system message
      await sendSystemMessage(
        groupId,
        `${chatState.currentUser.name || "Usuário"} saiu do grupo`
      );
    }

    // Return to conversations list
    handleBackToContacts();

    // Remove from local state
    const conversationIndex = chatState.conversations.findIndex(
      (conv) => conv.id === groupId
    );

    if (conversationIndex !== -1) {
      chatState.conversations.splice(conversationIndex, 1);
      cacheManager.saveConversations();
      renderContacts();
    }

    showPopup("success", "Você saiu do grupo");

    return true;
  } catch (error) {
    console.error("Error leaving group:", error);
    showPopup("error", "Erro ao sair do grupo");
    throw error;
  }
}

/**
 * View user profile
 */
function viewUserProfile() {
  if (chatState.activeConversation?.isGroup) return;

  const otherUser = chatState.activeConversation?.participants[0];
  if (!otherUser) {
    console.error("Erro: Não foi possível encontrar informações do usuário");
    showPopup("error", "Erro ao carregar perfil do usuário");
    return;
  }

  console.log("User profile data:", otherUser);

  // Garantir que temos dados completos do usuário
  fetchUserData(otherUser.id).then((userData) => {
    if (userData) {
      // Atualizar cache
      chatState.usersCache[otherUser.id] = userData;

      // Obter a biografia do usuário
      const userBio = getUserBio(userData);

      const content = document.createElement("div");
      content.style.cssText =
        "display: flex; flex-direction: column; align-items: center;";

      // User avatar and info
      content.innerHTML = `
        <div style="width: 100px; height: 100px; border-radius: 50%; overflow: hidden; margin-bottom: 15px;">
          ${uiComponents.createUserAvatar(userData, 100)}
        </div>
        <h2 style="margin: 0 0 5px 0;">${userData.name || "Usuário"}</h2>
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${
            userData.isOnline ? "#4CAF50" : "#ccc"
          }; margin-right: 5px;"></span>
          <span style="color: #ccc;">${
            userData.isOnline ? "Online" : "Offline"
          }</span>
        </div>
      `;

      // Adicionar biografia se existir
      if (userBio) {
        const bioContainer = document.createElement("div");
        bioContainer.style.cssText =
          "background-color: rgba(0, 223, 196, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px; width: 100%; text-align: center;";
        bioContainer.innerHTML = `
          <div style="font-style: italic; color: #ddd;">"${userBio}"</div>
        `;
        content.appendChild(bioContainer);
      }

      // User info
      if (userData.email) {
        const emailRow = document.createElement("div");
        emailRow.style.cssText =
          "display: flex; align-items: center; width: 100%; margin-bottom: 10px;";
        emailRow.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px;">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          <span>${userData.email}</span>
        `;
        content.appendChild(emailRow);
      }

      if (userData.userType) {
        const typeRow = document.createElement("div");
        typeRow.style.cssText =
          "display: flex; align-items: center; width: 100%; margin-bottom: 10px;";
        typeRow.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px;">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
          <span>${
            userData.userType === "paciente"
              ? "Paciente"
              : userData.userType === "medico"
              ? "Médico"
              : userData.userType
          }</span>
        `;
        content.appendChild(typeRow);
      }

      // Action buttons
      const actions = document.createElement("div");
      actions.style.cssText =
        "display: flex; justify-content: space-between; width: 100%; margin-top: 20px;";

      const blockButton = document.createElement("button");
      blockButton.style.cssText =
        "flex: 1; background-color: #f44336; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; margin-right: 10px;";
      blockButton.textContent = "Bloquear";

      const messageButton = document.createElement("button");
      messageButton.style.cssText =
        "flex: 1; background-color: #00dfc4; color: #1d2b3a; border: none; padding: 10px; border-radius: 5px; cursor: pointer;";
      messageButton.textContent = "Mensagem";

      actions.appendChild(blockButton);
      actions.appendChild(messageButton);
      content.appendChild(actions);

      // Criar dialog ANTES de adicionar event listeners
      const dialog = uiComponents.createDialog("Perfil", content, 400);

      // Agora que a dialog já está criada, podemos adicionar event listeners que a referenciam
      blockButton.addEventListener("click", () => {
        uiComponents.createConfirmDialog(
          "Bloquear usuário",
          `Tem certeza que deseja bloquear ${userData.name || "este usuário"}?`,
          "Bloquear",
          "Cancelar",
          () => {
            dialog.close();
            blockUser(userData);
          }
        );
      });

      messageButton.addEventListener("click", () => dialog.close());
    } else {
      showPopup(
        "error",
        "Não foi possível carregar os dados completos do usuário"
      );
    }
  });
}

/**
 * Busca a biografia do usuário em vários campos possíveis
 */
function getUserBio(userData) {
  if (!userData) return null;

  // Verificar campos possíveis para biografia
  if (userData.bio) return userData.bio;
  if (userData.about) return userData.about;
  if (userData.description) return userData.description;
  if (userData.aboutMe) return userData.aboutMe;
  if (
    userData.status &&
    typeof userData.status === "string" &&
    userData.status.length > 5
  ) {
    return userData.status;
  }

  return null;
}

/**
 * Clear conversation messages
 */
async function clearConversation() {
  if (!chatState.activeConversation) return;

  uiComponents.createConfirmDialog(
    "Limpar conversa",
    "Tem certeza que deseja limpar todas as mensagens desta conversa? Esta ação não pode ser desfeita.",
    "Limpar",
    "Cancelar",
    async () => {
      try {
        showPopup("info", "Limpando conversa...");
        const conversationId = chatState.activeConversation.id;

        // Armazenar referência à conversa ativa antes de limpar
        const activeConversation = {...chatState.activeConversation};

        // Atualizar no Firebase
        await updateDoc(doc(firestore, "conversations", conversationId), {
          lastMessage: "",
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Limpar mensagens locais
        chatState.messages = [];
        cacheManager.saveMessages(conversationId);
        
        // Manter a mesma conversa ativa
        chatState.activeConversation = activeConversation;
        
        // Renderizar UI atualizada
        renderMessages();
        renderContacts();

        // Enviar mensagem do sistema
        await sendSystemMessage(conversationId, "Conversa limpa");
        showPopup("success", "Conversa limpa com sucesso!");
      } catch (error) {
        console.error("Error clearing conversation:", error);
        showPopup("error", "Erro ao limpar conversa");
      }
    }
  );
}

/**
 * Block user
 */
async function blockUser(userToBlock) {
  if (chatState.activeConversation?.isGroup) return;

  // Usar o parâmetro userToBlock se disponível, ou tentar obter do activeConversation
  const otherUser = userToBlock || chatState.activeConversation?.participants[0];

  // Verificação explícita para garantir que otherUser existe e tem um ID
  if (!otherUser) {
    console.error("Error: User to block is undefined");
    showPopup("error", "Erro ao identificar usuário para bloquear");
    return;
  }

  const userIdToBlock = otherUser.id;
  if (!userIdToBlock) {
    console.error("Error: User ID to block is undefined", otherUser);
    showPopup("error", "ID do usuário não encontrado");
    return;
  }

  try {
    showPopup("info", "Bloqueando usuário...");

    // Update user document with blocked user
    const userRef = doc(firestore, "users", chatState.currentUser.uid);

    // Obter documento atual para verificar se já existe um array blockedUsers
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();

      // Se o documento existe mas não tem blockedUsers, criar um novo array
      if (!userData.blockedUsers) {
        await updateDoc(userRef, {
          blockedUsers: [userIdToBlock]
        });
      }
      // Se blockedUsers existe mas não é um array, substituir por um novo array
      else if (!Array.isArray(userData.blockedUsers)) {
        await updateDoc(userRef, {
          blockedUsers: [userIdToBlock]
        });
      }
      // Se blockedUsers é um array e o usuário ainda não está bloqueado, adicionar
      else if (!userData.blockedUsers.includes(userIdToBlock)) {
        await updateDoc(userRef, {
          blockedUsers: arrayUnion(userIdToBlock)
        });
      }
    } else {
      // Se o documento não existir, criar com o array blockedUsers
      await setDoc(userRef, {
        blockedUsers: [userIdToBlock]
      }, { merge: true });
    }

    // Update conversation with blocked status
    const conversationId = chatState.activeConversation?.id;
    if (conversationId) {
      await updateDoc(
        doc(firestore, "conversations", conversationId),
        {
          [`blocked.${chatState.currentUser.uid}`]: true,
          updatedAt: serverTimestamp(),
        }
      );
      
      // IMPORTANTE: Atualizar o estado local para refletir o bloqueio
      const conversationIndex = chatState.conversations.findIndex(
        conv => conv.id === conversationId
      );
      
      if (conversationIndex !== -1) {
        // Atualizar a conversa no estado local
        const updatedConversation = {
          ...chatState.conversations[conversationIndex],
          blocked: {
            ...chatState.conversations[conversationIndex].blocked,
            [chatState.currentUser.uid]: true
          }
        };
        
        chatState.conversations[conversationIndex] = updatedConversation;
        cacheManager.saveConversations();
      }
    }

    showPopup("success", `${otherUser.name || "Usuário"} foi bloqueado`);

    // Limpar a conversa ativa e atualizar a UI
    chatState.activeConversation = null;
    
    // Atualizar a UI de forma segura
    safelyReturnToContacts();
    
  } catch (error) {
    console.error("Error blocking user:", error);
    showPopup("error", "Erro ao bloquear usuário: " + error.message);
  }
}

// Nova função para retornar à lista de contatos de forma segura
function safelyReturnToContacts() {
  // Atualizar a UI para refletir as mudanças
  renderContacts();
  
  // Ajustar a visualização
  const selectedChat = document.querySelector(".SelectedMensages");
  const notSelectedChat = document.querySelector(".notSelectedMensages");
  
  if (selectedChat) selectedChat.style.display = "none";
  if (notSelectedChat) notSelectedChat.style.display = "flex";
  
  // Ajustar baseado no tamanho da tela
  if (window.innerWidth <= 700) {
    const containerUserChat = document.querySelector(".containerUserChat");
    const containerMain = document.querySelector("#containerMain");
    
    if (containerUserChat) containerUserChat.style.display = "flex";
    if (containerMain) containerMain.style.display = "none";
  }
}

/**
 * Archive conversation
 */
function archiveConversation() {
  showPopup(
    "info",
    "Funcionalidade de arquivar conversas será implementada em breve!"
  );
}

/**
 * Mute conversation notifications
 */
function muteConversation() {
  showPopup(
    "info",
    "Funcionalidade de silenciar notificações será implementada em breve!"
  );
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
 * Set up listeners for real-time message updates
 */
function setupMessagesListener(conversationId) {
  try {
    // Unsubscribe from previous listener
    if (chatState.unsubscribeListeners.messages) {
      chatState.unsubscribeListeners.messages();
    }

    // Use Realtime Database for better performance with real-time updates
    const messagesRef = ref(realtimeDb, `messages/${conversationId}`);

    // Listen for new messages
    const onNewMessage = onChildAdded(messagesRef, (snapshot) => {
      const messageData = snapshot.val();
      const messageId = snapshot.key;

      // Verificar se já existe uma mensagem com este ID no estado
      const existingMessageIndex = chatState.messages.findIndex(
        (m) => m.id === messageId
      );

      // Verificar se existe uma mensagem temporária que corresponda a esta
      const tempMessageIndex = chatState.messages.findIndex(
        (m) =>
          m.id.startsWith("temp-") &&
          m.senderId === messageData.senderId &&
          m.text === messageData.text &&
          Math.abs(m.timestamp - messageData.timestamp) < 5000 // Mensagens enviadas em um intervalo de 5 segundos
      );

      // Se já existe uma mensagem temporária, substitua-a
      if (tempMessageIndex !== -1) {
        chatState.messages[tempMessageIndex] = {
          id: messageId,
          ...messageData,
        };
        renderMessages();
        cacheManager.saveMessages(conversationId);
      }
      // Se já existe uma mensagem com este ID, apenas atualize-a
      else if (existingMessageIndex !== -1) {
        chatState.messages[existingMessageIndex] = {
          id: messageId,
          ...messageData,
        };
        renderMessages();
        cacheManager.saveMessages(conversationId);
      }
      // Se é uma mensagem nova, adicione-a
      else {
        // Add new message to state
        chatState.messages.push({ id: messageId, ...messageData });

        // Update UI and cache
        renderMessages();
        scrollToBottom();
        cacheManager.saveMessages(conversationId);

        // Update message status if it's from another user
        if (
          messageData.senderId !== chatState.currentUser.uid &&
          messageData.status === "sent"
        ) {
          update(ref(realtimeDb, `messages/${conversationId}/${messageId}`), {
            status: "delivered",
          });
        }

        // Show notification if app is not focused
        if (
          messageData.senderId !== chatState.currentUser.uid &&
          document.visibilityState !== "visible"
        ) {
          showMessageNotification(messageData);
        }

        // Mark as read if viewing this conversation
        if (
          messageData.senderId !== chatState.currentUser.uid &&
          document.visibilityState === "visible" &&
          chatState.activeConversation?.id === conversationId
        ) {
          update(ref(realtimeDb, `messages/${conversationId}/${messageId}`), {
            status: "read",
          });
        }

        // Update last seen
        updateLastSeen(conversationId);
      }
    });

    // Listen for status updates
    const onStatusChanged = onChildChanged(messagesRef, (snapshot) => {
      const messageData = snapshot.val();
      const messageId = snapshot.key;

      // Find and update message
      const messageIndex = chatState.messages.findIndex(
        (m) => m.id === messageId
      );

      if (messageIndex !== -1) {
        chatState.messages[messageIndex] = {
          ...chatState.messages[messageIndex],
          ...messageData,
        };

        // Update UI and cache
        renderMessages();
        cacheManager.saveMessages(conversationId);
      }
    });

    // Store unsubscribe functions
    chatState.unsubscribeListeners.messages = () => {
      onNewMessage();
      onStatusChanged();
    };

    return chatState.unsubscribeListeners.messages;
  } catch (error) {
    console.error("Error setting up message listener:", error);
    showPopup("error", "Erro ao monitorar novas mensagens");
  }
}

/**
 * Show browser notification for new messages
 */
function showMessageNotification(messageData) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    // Get sender info
    const senderId = messageData.senderId;
    let senderName = "Nova mensagem";
    let senderPhoto = null;

    // Find sender in contacts or cache
    if (senderId === "system") {
      senderName = "Sistema";
    } else if (chatState.usersCache[senderId]) {
      senderName = chatState.usersCache[senderId].name || "Usuário";
      senderPhoto = chatState.usersCache[senderId].photoURL;
    }

    // Create notification
    const notification = new Notification(senderName, {
      body: messageData.text,
      icon: senderPhoto || "/assets/images/icon.png",
      badge: "/assets/images/badge.png",
      tag: `message-${messageData.id}`,
    });

    // Handle notification click
    notification.onclick = function () {
      window.focus();
      if (chatState.activeConversation?.id !== messageData.conversationId) {
        openConversation(messageData.conversationId);
      }
      notification.close();
    };

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  } catch (error) {
    console.error("Error showing notification:", error);
  }
}

/**
 * Render messages with improved UI and grouped by date
 */
function renderMessages() {
  const conversationArea = chatState.elements.messagesContainer;
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
    const messageDate = timeUtils.convertToDate(message.timestamp);
    if (!messageDate) return;

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
  const messageTime = timeUtils.formatTime(message.timestamp);

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
        statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm-7.75 7.75L5.83 10.33 4.41 11.75l5.84 5.84 1.41-1.41-1.41-1.43z" fill="#00dfc4"/></svg>`;
        break;
      case "delivered":
        statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm-7.75 7.75L5.83 10.33 4.41 11.75l5.84 5.84 1.41-1.41-1.41-1.43z" fill="#00dfc4"/></svg>`;
        break;
      case "sent":
        statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#00dfc4"/></svg>`;
        break;
      case "pending":
        statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10" stroke="#00dfc4" stroke-width="1" fill="none"/><path d="M12 7v5l3 3" stroke="#00dfc4" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
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
  const conversationArea = chatState.elements.messagesContainer;
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

    scrollButton.addEventListener("click", () => {
      if (chatState.elements.messagesContainer) {
        chatState.elements.messagesContainer.scrollTop =
          chatState.elements.messagesContainer.scrollHeight;
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
async function sendMessage(text) {
  try {
    if (!text.trim() || !chatState.activeConversation) return;

    const conversationId = chatState.activeConversation.id;
    const currentUserId = chatState.currentUser.uid;

    // Clear input field immediately for better UX
    if (chatState.elements.messageInput) {
      chatState.elements.messageInput.value = "";
      chatState.elements.messageInput.focus();
    }

    // Show sending indicator
    showSendingIndicator();

    // Gerar um ID temporário
    const tempId = `temp-${Date.now()}`;

    // Create message object
    const newMessage = {
      id: tempId,
      text: text.trim(),
      senderId: currentUserId,
      timestamp: Date.now(),
      status: "pending", // Status inicial "pending" (mostra relógio)
      type: "text",
    };

    // Adicionar a mensagem temporária ao estado local para exibir o relógio
    chatState.messages.push(newMessage);
    renderMessages();
    scrollToBottom();

    try {
      // Send to Realtime Database for instant sync
      const messagesRef = ref(realtimeDb, `messages/${conversationId}`);
      const newMessageRef = push(messagesRef);
      const messageId = newMessageRef.key;

      await set(newMessageRef, {
        text: text.trim(),
        senderId: currentUserId,
        timestamp: Date.now(),
        status: "sent", // Inicial status quando chega no Firebase
        type: "text",
      });

      // Hide sending indicator
      hideSendingIndicator();

      // Update conversation metadata
      const unreadCount = {};

      // For each participant, increment unread count (except sender)
      chatState.activeConversation.participants.forEach((participant) => {
        // If it's a user object, get the ID
        const participantId =
          typeof participant === "string" ? participant : participant.id;

        unreadCount[participantId] =
          (chatState.activeConversation.unreadCount?.[participantId] || 0) +
          (participantId === currentUserId ? 0 : 1);
      });

      // Update Firestore conversation
      const conversationRef = doc(firestore, "conversations", conversationId);
      await updateDoc(conversationRef, {
        lastMessage: text.trim(),
        lastMessageType: "text",
        lastMessageSenderId: currentUserId,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCount,
      });

      // Também salvar no Firestore para persistência
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

      // Atualizar a mensagem temporária no estado para "sent" (✓)
      const messageIndex = chatState.messages.findIndex((m) => m.id === tempId);
      if (messageIndex !== -1) {
        // Atualizar a mensagem temporária com o ID real e status "sent"
        chatState.messages[messageIndex] = {
          ...chatState.messages[messageIndex],
          id: messageId,
          status: "sent",
        };

        // Atualizar a UI para mostrar o ícone de enviado (✓)
        renderMessages();
        cacheManager.saveMessages(conversationId);
      }

      // Atualiza a lista de conversas
      updateConversationsList(conversationId, text.trim(), currentUserId);

      return true;
    } catch (error) {
      console.error("Error sending message:", error);

      // Hide sending indicator
      hideSendingIndicator();

      // Mostrar erro ao usuário
      showPopup("error", "Erro ao enviar mensagem. Tente novamente.");

      // Marcar a mensagem como falhou no estado
      const messageIndex = chatState.messages.findIndex((m) => m.id === tempId);
      if (messageIndex !== -1) {
        chatState.messages[messageIndex] = {
          ...chatState.messages[messageIndex],
          status: "failed",
        };
        renderMessages();
      }

      return false;
    }
  } catch (error) {
    console.error("Error in sendMessage function:", error);
    hideSendingIndicator();
    showPopup("error", "Erro ao enviar mensagem");
    return false;
  }
}

/**
 * Atualiza a lista de conversas após enviar uma mensagem
 */
function updateConversationsList(conversationId, messageText, senderId) {
  try {
    // Encontra a conversa na lista
    const conversationIndex = chatState.conversations.findIndex(
      (conv) => conv.id === conversationId
    );

    if (conversationIndex !== -1) {
      // Atualiza os campos da conversa
      chatState.conversations[conversationIndex] = {
        ...chatState.conversations[conversationIndex],
        lastMessage: messageText,
        lastMessageType: "text",
        lastMessageSenderId: senderId,
        lastMessageAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Reordena as conversas (mais recente primeiro)
      chatState.conversations.sort((a, b) => {
        const timeA = a.updatedAt || 0;
        const timeB = b.updatedAt || 0;
        return timeB - timeA;
      });

      // Atualiza o cache e a UI
      cacheManager.saveConversations();
      renderContacts();
    }
  } catch (error) {
    console.error("Error updating conversations list:", error);
  }
}

// Adicionar funções para mostrar/esconder indicador de envio
function showSendingIndicator() {
  const container = document.querySelector(".SelectedMensages");
  if (!container) return;

  let indicator = container.querySelector(".sending-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "sending-indicator";
    indicator.style.cssText =
      "position: absolute; bottom: 80px; right: 60px; background-color: rgba(0, 223, 196, 0.2); padding: 5px 10px; border-radius: 10px; font-size: 12px; color: #00dfc4;";
    indicator.textContent = "Enviando...";
    container.appendChild(indicator);
  }
}

function hideSendingIndicator() {
  const indicator = document.querySelector(".sending-indicator");
  if (indicator && indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
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
}

/**
 * Show new chat dialog with improved UI
 */
async function showNewChatDialog() {
  try {
    // Create dialog content
    const content = document.createElement("div");

    // Search input
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Procurar usuário...";
    searchInput.style.cssText =
      "width: 100%; padding: 12px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box; margin-bottom: 15px;";

    const usersList = document.createElement("div");
    usersList.style.cssText = "max-height: 400px; overflow-y: auto;";

    // Function to render users list with loading state
    async function renderUsersList(searchTerm = "") {
      // Show loading indicator
      usersList.innerHTML = uiComponents.createLoadingSpinner(
        30,
        "#00dfc4",
        "Buscando usuários..."
      );

      try {
        // Get users from cache or fetch from server
        const users = await getAllUsers(chatState.currentUser.uid, searchTerm);

        // Filter users based on search
        const filteredUsers = searchTerm
          ? users.filter(
              (user) =>
                user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (user.email &&
                  user.email.toLowerCase().includes(searchTerm.toLowerCase()))
            )
          : users;

        // Show no results message if needed
        if (filteredUsers.length === 0) {
          usersList.innerHTML = `<div style="text-align: center; padding: 20px; color: #00dfc4;">Nenhum usuário encontrado</div>`;
          return;
        }

        // Render users
        usersList.innerHTML = "";

        // Create sections for online and offline users
        const sections = {
          online: [],
          offline: [],
        };

        // Sort users into sections
        filteredUsers.forEach((user) => {
          if (user.isOnline) {
            sections.online.push(user);
          } else {
            sections.offline.push(user);
          }
        });

        // Function to create a user item
        function createUserItem(user) {
          const existingConversation = chatState.conversations.find(
            (conv) =>
              !conv.isGroup &&
              conv.participants.includes(user.id) &&
              conv.participants.includes(chatState.currentUser.uid)
          );

          const userItem = document.createElement("div");
          userItem.style.cssText =
            "display: flex; align-items: center; padding: 12px; border-radius: 5px; cursor: pointer; transition: background-color 0.2s;";
          userItem.innerHTML = `
            <div style="width: 50px; height: 50px; border-radius: 50%; overflow: hidden; margin-right: 15px; flex-shrink: 0;">
              ${uiComponents.createUserAvatar(user, 50)}
            </div>
            <div style="flex-grow: 1;">
              <div style="font-weight: bold; margin-bottom: 3px;">${
                user.name
              }</div>
              <div style="font-size: 0.8em; opacity: 0.7; display: flex; align-items: center;">
                <span style="margin-right: 5px;">${
                  existingConversation
                    ? "Conversa existente"
                    : "Iniciar conversa"
                }</span>
                ${
                  user.userType
                    ? `<span style="display: inline-block; padding: 2px 6px; background-color: ${
                        user.userType === "paciente"
                          ? "#2196F3"
                          : user.userType === "medico"
                          ? "#FF9800"
                          : "#00dfc4"
                      }; border-radius: 10px; font-size: 0.8em; margin-left: 5px;">${
                        user.userType
                      }</span>`
                    : ""
                }
              </div>
            </div>
            <div style="display: flex; align-items: center; margin-left: 10px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${
                user.isOnline ? "#4CAF50" : "#ccc"
              }; margin-right: 5px;"></span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h13M12 5l7 7-7 7"/>
              </svg>
            </div>
          `;

          userItem.addEventListener("mouseenter", () => {
            userItem.style.backgroundColor = "rgba(0, 223, 196, 0.1)";
          });

          userItem.addEventListener("mouseleave", () => {
            userItem.style.backgroundColor = "transparent";
          });

          userItem.addEventListener("click", async () => {
            // Show loading state
            userItem.style.opacity = "0.7";
            userItem.style.pointerEvents = "none";

            try {
              dialog.close();

              if (existingConversation) {
                await openConversation(existingConversation.id);
              } else {
                await createConversation(user.id);
              }

              renderContacts();
              showConversationView();
            } catch (error) {
              console.error("Error creating conversation:", error);
              showPopup("error", "Erro ao iniciar conversa");
            }
          });

          return userItem;
        }

        // Render online users first
        if (sections.online.length > 0) {
          const onlineHeader = document.createElement("div");
          onlineHeader.style.cssText =
            "padding: 5px 15px; color: #00dfc4; font-size: 0.8em; opacity: 0.8;";
          onlineHeader.textContent = "Online";
          usersList.appendChild(onlineHeader);

          sections.online.forEach((user) => {
            usersList.appendChild(createUserItem(user));
          });
        }

        // Then render offline users
        if (sections.offline.length > 0) {
          const offlineHeader = document.createElement("div");
          offlineHeader.style.cssText =
            "padding: 5px 15px; color: #00dfc4; font-size: 0.8em; opacity: 0.8; margin-top: 10px;";
          offlineHeader.textContent = "Offline";
          usersList.appendChild(offlineHeader);

          sections.offline.forEach((user) => {
            usersList.appendChild(createUserItem(user));
          });
        }
      } catch (error) {
        console.error("Error rendering users list:", error);
        usersList.innerHTML = `<div style="text-align: center; padding: 20px; color: #f44336;">Erro ao buscar usuários</div>`;
      }
    }

    // Add debounce to search
    let searchTimeout;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        renderUsersList(searchInput.value.trim());
      }, 300);
    });

    // Assemble content
    content.appendChild(searchInput);
    content.appendChild(usersList);

    // Create dialog
    const dialog = uiComponents.createDialog("Nova conversa", content, 450);

    // Initial render
    renderUsersList();

    // Focus search input
    setTimeout(() => searchInput.focus(), 100);
  } catch (error) {
    console.error("Error showing new chat dialog:", error);
    showPopup("error", "Erro ao mostrar diálogo de nova conversa");
  }
}

/**
 * Show create group dialog with improved UI
 */
/**
 * Show create group dialog with improved UI
 */
async function showCreateGroupDialog() {
  try {
    // Create content container
    const content = document.createElement("div");

    // Step indicator
    const stepIndicator = document.createElement("div");
    stepIndicator.style.cssText =
      "display: flex; justify-content: center; margin-bottom: 20px;";
    stepIndicator.innerHTML = `
      <div class="step-indicator" style="display: flex; position: relative; width: 70%;">
        <div class="step active" style="flex: 1; text-align: center; z-index: 2;">
          <div style="width: 30px; height: 30px; background-color: #00dfc4; color: #1d2b3a; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 5px auto; font-weight: bold;">1</div>
          <div style="font-size: 0.8em; color: #00dfc4;">Nome do grupo</div>
        </div>
        <div class="step" style="flex: 1; text-align: center; z-index: 2;">
          <div style="width: 30px; height: 30px; background-color: rgba(0, 223, 196, 0.3); color: #00dfc4; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 5px auto; font-weight: bold;">2</div>
          <div style="font-size: 0.8em; color: #ccc;">Adicionar participantes</div>
        </div>
        <div style="position: absolute; top: 15px; left: 15%; width: 70%; height: 2px; background-color: rgba(0, 223, 196, 0.3); z-index: 1;"></div>
      </div>
    `;

    // Create step containers
    const stepsContainer = document.createElement("div");

    // Step 1: Group name
    const step1 = document.createElement("div");
    step1.className = "step-1";

    const groupNameInput = document.createElement("input");
    groupNameInput.type = "text";
    groupNameInput.placeholder = "Nome do grupo";
    groupNameInput.style.cssText =
      "width: 100%; padding: 12px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box; margin-bottom: 15px; font-size: 16px;";

    const groupDescriptionInput = document.createElement("textarea");
    groupDescriptionInput.placeholder = "Descrição do grupo (opcional)";
    groupDescriptionInput.style.cssText =
      "width: 100%; padding: 12px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box; margin-bottom: 30px; min-height: 80px; resize: vertical; font-size: 16px;";

    const nextButton = document.createElement("button");
    nextButton.textContent = "Avançar";
    nextButton.style.cssText =
      "width: 100%; padding: 12px; border: none; border-radius: 5px; background-color: #00dfc4; color: #1d2b3a; cursor: pointer; font-weight: bold; font-size: 16px;";

    step1.appendChild(groupNameInput);
    step1.appendChild(groupDescriptionInput);
    step1.appendChild(nextButton);

    // Step 2: Add participants
    const step2 = document.createElement("div");
    step2.className = "step-2";
    step2.style.display = "none";

    const selectedParticipantsContainer = document.createElement("div");
    selectedParticipantsContainer.style.cssText =
      "display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; min-height: 40px;";

    const participantSearchInput = document.createElement("input");
    participantSearchInput.type = "text";
    participantSearchInput.placeholder = "Buscar usuários...";
    participantSearchInput.style.cssText =
      "width: 100%; padding: 12px; border-radius: 5px; border: 1px solid #00dfc4; background-color: #1d2b3a; color: #fff; box-sizing: border-box; margin-bottom: 15px; font-size: 16px;";

    const participantsList = document.createElement("div");
    participantsList.style.cssText =
      "max-height: 250px; overflow-y: auto; margin-bottom: 20px;";

    const createGroupButton = document.createElement("button");
    createGroupButton.textContent = "Criar Grupo";
    createGroupButton.style.cssText =
      "width: 100%; padding: 12px; border: none; border-radius: 5px; background-color: #00dfc4; color: #1d2b3a; cursor: pointer; font-weight: bold; font-size: 16px;";
    createGroupButton.disabled = true; // Inicialmente desativado até ter participantes

    const backButton = document.createElement("button");
    backButton.textContent = "Voltar";
    backButton.style.cssText =
      "width: 100%; padding: 12px; border: 1px solid #00dfc4; border-radius: 5px; background-color: transparent; color: #00dfc4; cursor: pointer; margin-top: 10px; font-size: 16px;";

    step2.appendChild(selectedParticipantsContainer);
    step2.appendChild(participantSearchInput);
    step2.appendChild(participantsList);
    step2.appendChild(createGroupButton);
    step2.appendChild(backButton);

    // Add steps to container
    stepsContainer.appendChild(step1);
    stepsContainer.appendChild(step2);

    // Add elements to content
    content.appendChild(stepIndicator);
    content.appendChild(stepsContainer);

    // Create dialog
    const dialog = uiComponents.createDialog("Criar Grupo", content, 500);

    // Focus on input
    setTimeout(() => groupNameInput.focus(), 100);

    // Selected participants
    let selectedUsers = [];

    // Render selected participants
    function renderSelectedParticipants() {
      selectedParticipantsContainer.innerHTML = "";

      if (selectedUsers.length === 0) {
        selectedParticipantsContainer.innerHTML = `<div style="width: 100%; color: #ccc; padding: 10px 0;">Nenhum participante selecionado</div>`;
        createGroupButton.disabled = true;
        createGroupButton.style.opacity = "0.6";
        return;
      }

      // Habilitar botão de criar grupo se houver participantes selecionados
      createGroupButton.disabled = false;
      createGroupButton.style.opacity = "1";

      selectedUsers.forEach((user) => {
        const participantTag = document.createElement("div");
        participantTag.style.cssText =
          "display: flex; align-items: center; padding: 5px 10px; background-color: rgba(0, 223, 196, 0.2); border-radius: 20px;";

        participantTag.innerHTML = `
          <div style="width: 20px; height: 20px; border-radius: 50%; overflow: hidden; margin-right: 5px;">
            ${uiComponents.createUserAvatar(user, 20)}
          </div>
          <span style="margin-right: 5px;">${user.name}</span>
          <button style="background: none; border: none; color: #00dfc4; cursor: pointer; font-size: 18px; line-height: 1;">×</button>
        `;

        participantTag.querySelector("button").addEventListener("click", () => {
          selectedUsers = selectedUsers.filter((u) => u.id !== user.id);
          renderSelectedParticipants();
          renderUsersList(participantSearchInput.value.trim());
        });

        selectedParticipantsContainer.appendChild(participantTag);
      });
    }

    // Initial render
    renderSelectedParticipants();

    // Render users list
    async function renderUsersList(searchTerm = "") {
      // Show loading
      participantsList.innerHTML = uiComponents.createLoadingSpinner(
        20,
        "#00dfc4",
        "Buscando usuários..."
      );

      try {
        // Get all users except current user
        const allUsers = await getAllUsers(chatState.currentUser.uid);

        // Filter by search term if provided
        const filteredUsers = searchTerm
          ? allUsers.filter(
              (user) =>
                user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (user.email &&
                  user.email.toLowerCase().includes(searchTerm.toLowerCase()))
            )
          : allUsers;

        if (filteredUsers.length === 0) {
          participantsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #ccc;">Nenhum usuário encontrado</div>`;
          return;
        }

        // Sort users by online status first, then by name
        filteredUsers.sort((a, b) => {
          // Primeiro por status online
          if (a.isOnline && !b.isOnline) return -1;
          if (!a.isOnline && b.isOnline) return 1;

          // Depois por nome
          return a.name.localeCompare(b.name);
        });

        // Clear list
        participantsList.innerHTML = "";

        // Render each user
        filteredUsers.forEach((user) => {
          const isSelected = selectedUsers.some((u) => u.id === user.id);

          const userItem = document.createElement("div");
          userItem.style.cssText = `
            display: flex; 
            align-items: center; 
            padding: 10px; 
            border-radius: 5px; 
            cursor: pointer; 
            background-color: ${
              isSelected ? "rgba(0, 223, 196, 0.2)" : "transparent"
            }; 
            margin-bottom: 5px;
            transition: background-color 0.2s;
          `;

          userItem.innerHTML = `
            <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; margin-right: 10px;">
              ${uiComponents.createUserAvatar(user, 40)}
            </div>
            <div style="flex-grow: 1;">
              <div style="font-weight: bold;">${user.name}</div>
              <div style="font-size: 0.8em; color: #ccc; display: flex; align-items: center;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${
                  user.isOnline ? "#4CAF50" : "#ccc"
                }; margin-right: 5px;"></span>
                <span>${user.isOnline ? "Online" : "Offline"}</span>
                ${
                  user.userType
                    ? `<span style="margin-left: 10px; padding: 2px 6px; background-color: ${
                        user.userType === "paciente"
                          ? "#2196F3"
                          : user.userType === "medico"
                          ? "#FF9800"
                          : "#00dfc4"
                      }; border-radius: 10px; font-size: 0.8em;">${
                        user.userType
                      }</span>`
                    : ""
                }
              </div>
            </div>
            <div style="margin-left: 10px;">
              ${
                isSelected
                  ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00dfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
                  : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`
              }
            </div>
          `;

          userItem.addEventListener("mouseenter", () => {
            if (!isSelected)
              userItem.style.backgroundColor = "rgba(0, 223, 196, 0.1)";
          });

          userItem.addEventListener("mouseleave", () => {
            if (!isSelected) userItem.style.backgroundColor = "transparent";
          });

          userItem.addEventListener("click", () => {
            if (isSelected) {
              // Remove from selection
              selectedUsers = selectedUsers.filter((u) => u.id !== user.id);
            } else {
              // Add to selection
              selectedUsers.push(user);
            }
            renderSelectedParticipants();
            renderUsersList(participantSearchInput.value.trim());
          });

          participantsList.appendChild(userItem);
        });
      } catch (error) {
        console.error("Error rendering users list:", error);
        participantsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #f44336;">Erro ao buscar usuários</div>`;
      }
    }

    // Add step navigation and event handlers
    nextButton.addEventListener("click", () => {
      const groupName = groupNameInput.value.trim();

      if (!groupName) {
        showPopup("warning", "Por favor, informe um nome para o grupo.");
        groupNameInput.focus();
        return;
      }

      // Show step 2
      step1.style.display = "none";
      step2.style.display = "block";

      // Update step indicator
      stepIndicator.querySelector(
        ".step:nth-child(1) div:first-child"
      ).style.backgroundColor = "#1d2b3a";
      stepIndicator.querySelector(
        ".step:nth-child(1) div:first-child"
      ).style.color = "#00dfc4";
      stepIndicator.querySelector(
        ".step:nth-child(1) div:last-child"
      ).style.color = "#ccc";

      stepIndicator.querySelector(
        ".step:nth-child(2) div:first-child"
      ).style.backgroundColor = "#00dfc4";
      stepIndicator.querySelector(
        ".step:nth-child(2) div:first-child"
      ).style.color = "#1d2b3a";
      stepIndicator.querySelector(
        ".step:nth-child(2) div:last-child"
      ).style.color = "#00dfc4";

      // Focus search input and render users list
      setTimeout(() => {
        participantSearchInput.focus();
        renderUsersList();
      }, 100);
    });

    backButton.addEventListener("click", () => {
      // Show step 1
      step2.style.display = "none";
      step1.style.display = "block";

      // Update step indicator
      stepIndicator.querySelector(
        ".step:nth-child(1) div:first-child"
      ).style.backgroundColor = "#00dfc4";
      stepIndicator.querySelector(
        ".step:nth-child(1) div:first-child"
      ).style.color = "#1d2b3a";
      stepIndicator.querySelector(
        ".step:nth-child(1) div:last-child"
      ).style.color = "#00dfc4";

      stepIndicator.querySelector(
        ".step:nth-child(2) div:first-child"
      ).style.backgroundColor = "rgba(0, 223, 196, 0.3)";
      stepIndicator.querySelector(
        ".step:nth-child(2) div:first-child"
      ).style.color = "#00dfc4";
      stepIndicator.querySelector(
        ".step:nth-child(2) div:last-child"
      ).style.color = "#ccc";
    });

    // Add search input handler with debounce
    let searchTimeout;
    participantSearchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        renderUsersList(participantSearchInput.value.trim());
      }, 300);
    });

    // Handle create group button
    createGroupButton.addEventListener("click", async () => {
      const groupName = groupNameInput.value.trim();
      const groupDescription = groupDescriptionInput.value.trim();

      if (!groupName) {
        showPopup("warning", "Por favor, informe um nome para o grupo.");
        return;
      }

      if (selectedUsers.length === 0) {
        showPopup(
          "warning",
          "Selecione pelo menos um participante para o grupo."
        );
        return;
      }

      try {
        // Desativar botão para evitar cliques duplos
        createGroupButton.disabled = true;
        createGroupButton.textContent = "Criando...";

        // Show loading state
        dialog.contentContainer.innerHTML = uiComponents.createLoadingSpinner(
          40,
          "#00dfc4",
          "Criando grupo..."
        );

        // Include current user in participants
        const participants = [
          chatState.currentUser.uid,
          ...selectedUsers.map((user) => user.id),
        ];

        // Create group data
        const groupData = {
          name: groupName,
          description: groupDescription || null,
          participants,
          isGroup: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          creator: chatState.currentUser.uid,
          unreadCount: {},
        };

        // Add to Firestore
        const docRef = await addDoc(
          collection(firestore, "conversations"),
          groupData
        );

        // Add to local state
        const newGroup = { id: docRef.id, ...groupData };
        chatState.conversations.unshift(newGroup);
        cacheManager.saveConversations();

        // Send welcome message
        await sendSystemMessage(
          docRef.id,
          `Grupo "${groupName}" criado por ${
            chatState.currentUser.name || "Usuário"
          }`
        );

        // Close dialog and show success
        dialog.close();
        showPopup("success", "Grupo criado com sucesso!");

        // Open new conversation
        await openConversation(docRef.id);
        renderContacts();
        showConversationView();
      } catch (error) {
        console.error("Error creating group:", error);
        showPopup("error", "Erro ao criar grupo: " + error.message);
        dialog.close();
      }
    });
  } catch (error) {
    console.error("Error showing create group dialog:", error);
    showPopup("error", "Erro ao mostrar diálogo de criação de grupo");
  }
}

// Export main functions
export {
  chatState,
  sendMessage,
  openConversation,
  createConversation,
  renderContacts,
  renderMessages,
  showNewChatDialog,
  showCreateGroupDialog,
};
