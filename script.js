

// =========================================================
// 0. FIREBASE REALTIME DATABASE + STORAGE + LOCAL FALLBACK
// =========================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCMa6GiRkOtMKv5_LEE3keEYXuWHRbz95M",
  authDomain: "philosopher10-88875.firebaseapp.com",
  databaseURL: "https://philosopher10-88875-default-rtdb.firebaseio.com",
  projectId: "philosopher10-88875",
  storageBucket: "philosopher10-88875.firebasestorage.app",
  messagingSenderId: "72818422869",
  appId: "1:72818422869:web:a0fe37d58f0c84f21c90dc",
  measurementId: "G-MZV6FCSTGK"
};

const CLOUD_CONFIG = {
  enabled: true,
  apiUrl: "",
  apiKey: "",
  timeoutMs: 4500
};

const STORAGE_KEYS = {
  users: "registered_users",
  currentUser: "current_user",
  docs: "system_documents",
  chat: "system_chat_messages",
  announcements: "system_announcements",
  feedback: "system_feedback_items",
  financial: "home_financial_users",
  uiPrefs: "system_ui_preferences",
  lastBackup: "last_system_backup_at",
  pendingSync: "cloud_pending_sync"
};

const DB_PATHS = {
  users: "users",
  financial: "financialRecords",
  docs: "documents",
  chat: "chatMessages",
  announcements: "announcements",
  feedback: "feedbackItems",
  meta: "systemMeta"
};

let firebaseDb = null;
let firebaseStorage = null;
let isCloudConnected = false;
let isRealtimeListenerAttached = false;
let currentUserFilter = "all";
let resetVerificationCode = null;
let resetTargetEmail = null;
let activePreviewBlobUrl = null;

function getDashboardHref() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("_3") || path.includes("dashboard_3")) return "dashboard_3.html";
  if (path.includes("_2") || path.includes("dashboard_2")) return "dashboard_2.html";
  if (path.includes("dashboard_9.html")) return "dashboard_9.html";
  if (path.includes("dashboard_8.html")) return "dashboard_8.html";
  if (path.includes("dashboard_6.html") || path.includes("index_3.html")) return "dashboard_6.html";
  if (path.includes("dashboard_5.html")) return "dashboard_5.html";
  return "dashboard.html";
}

function getLoginHref() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("_2") || path.includes("dashboard_2")) return "index_2.html";
  if (path.includes("index_8.html") || path.includes("dashboard_8.html")) return "index_8.html";
  if (path.includes("dashboard_6.html") || path.includes("index_3.html")) return "index_3.html";
  if (path.includes("dashboard_5.html") || path.includes("index_2.html")) return "index_2.html";
  return "index.html";
}

function isDashboardPage() {
  const path = window.location.pathname.toLowerCase();
  return path.includes("dashboard") || Boolean(document.getElementById("mainSidebar"));
}

function isFirebaseConfigured() {
  return (
    typeof firebase !== "undefined" &&
    Boolean(FIREBASE_CONFIG.apiKey) &&
    !FIREBASE_CONFIG.apiKey.startsWith("SHYIRA_") &&
    !FIREBASE_CONFIG.apiKey.startsWith("API_KEY_YAWE") &&
    !FIREBASE_CONFIG.apiKey.startsWith("AIzaSy...") &&
    Boolean(FIREBASE_CONFIG.databaseURL) &&
    !FIREBASE_CONFIG.databaseURL.includes("SHYIRA_PROJECT_ID") &&
    !FIREBASE_CONFIG.databaseURL.includes("PROJECT_ID_YAWE") &&
    !FIREBASE_CONFIG.databaseURL.includes("umushingi-wawe")
  );
}

function initFirebaseIfConfigured() {
  if (!isFirebaseConfigured()) return false;
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    firebaseDb = firebase.database();
    return true;
  } catch {
    firebaseDb = null;
    return false;
  }
}

function initFirebaseStorageIfReady() {
  if (!initFirebaseIfConfigured() || typeof firebase.storage !== "function") return null;
  if (!firebaseStorage) {
    firebaseStorage = firebase.storage();
  }
  return firebaseStorage;
}

function escapeHtmlSafe(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser)) || null;
  } catch {
    return null;
  }
}

function setCurrentUserSession(userObj) {
  if (!userObj) return;
  localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(userObj));
  localStorage.setItem("currentUser", JSON.stringify(userObj));
}

function clearCurrentUserSession() {
  localStorage.removeItem(STORAGE_KEYS.currentUser);
  localStorage.removeItem("currentUser");
}

function isCurrentUserAdmin() {
  const currentUser = getCurrentUser();
  return Boolean(currentUser && (currentUser.role || "").toLowerCase() === "admin");
}

function requireAdminPermission(actionLabel = "gukora iki gikorwa") {
  if (!isCurrentUserAdmin()) {
    alert(`⛔ Ntibyemewe! Admin ni we wenyine utanga uburenganzira cyangwa wemerewe ${actionLabel}.`);
    return false;
  }
  return true;
}

function getCollection(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function firebaseNodeToArray(nodeVal) {
  if (!nodeVal) return [];
  if (Array.isArray(nodeVal)) return nodeVal.filter(Boolean);
  if (typeof nodeVal === "object") {
    return Object.entries(nodeVal).map(([key, val]) => {
      if (val && typeof val === "object") {
        return { id: val.id ?? key, ...val };
      }
      return { id: key, value: val };
    });
  }
  return [];
}

function arrayToFirebaseNode(list = []) {
  if (!Array.isArray(list)) return {};
  const obj = {};
  list.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const recordId = item.id !== undefined && item.id !== null ? String(item.id) : `item_${idx + 1}`;
    obj[recordId] = { ...item, id: item.id ?? recordId };
  });
  return obj;
}

function mapStorageKeyToDbPath(storageKey) {
  switch (storageKey) {
    case STORAGE_KEYS.users:
      return DB_PATHS.users;
    case STORAGE_KEYS.financial:
      return DB_PATHS.financial;
    case STORAGE_KEYS.docs:
      return DB_PATHS.docs;
    case STORAGE_KEYS.chat:
      return DB_PATHS.chat;
    case STORAGE_KEYS.announcements:
      return DB_PATHS.announcements;
    case STORAGE_KEYS.feedback:
      return DB_PATHS.feedback;
    default:
      return null;
  }
}

function setCollection(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  saveCollectionToCloud(key, data);
}

function getFullSystemState() {
  return {
    exportedAt: new Date().toISOString(),
    app: "Philosopher Dashboard System",
    registered_users: getCollection(STORAGE_KEYS.users, []),
    system_documents: getCollection(STORAGE_KEYS.docs, []),
    system_chat_messages: getCollection(STORAGE_KEYS.chat, []),
    system_announcements: getCollection(STORAGE_KEYS.announcements, []),
    system_feedback_items: getCollection(STORAGE_KEYS.feedback, []),
    home_financial_users: getCollection(STORAGE_KEYS.financial, [])
  };
}

function applyFullSystemState(state) {
  if (!state || typeof state !== "object") return false;

  if (Array.isArray(state.registered_users)) {
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(state.registered_users));
  }
  if (Array.isArray(state.system_documents)) {
    localStorage.setItem(STORAGE_KEYS.docs, JSON.stringify(state.system_documents));
  }
  if (Array.isArray(state.system_chat_messages)) {
    localStorage.setItem(STORAGE_KEYS.chat, JSON.stringify(state.system_chat_messages));
  }
  if (Array.isArray(state.system_announcements)) {
    localStorage.setItem(STORAGE_KEYS.announcements, JSON.stringify(state.system_announcements));
  }
  if (Array.isArray(state.system_feedback_items)) {
    localStorage.setItem(STORAGE_KEYS.feedback, JSON.stringify(state.system_feedback_items));
  }
  if (Array.isArray(state.home_financial_users)) {
    localStorage.setItem(STORAGE_KEYS.financial, JSON.stringify(state.home_financial_users));
  }
  return true;
}

function updateDbStatusBadge(mode) {
  const badges = document.querySelectorAll("#dbStatusBadge");
  badges.forEach(badge => {
    if (mode === "cloud") {
      badge.innerHTML = `<i class="fa-solid fa-cloud"></i> Cloud DB Connected`;
      badge.style.background = "#dcfce7";
      badge.style.color = "#15803d";
      badge.style.borderColor = "#86efac";
    } else {
      badge.innerHTML = `<i class="fa-solid fa-hard-drive"></i> Local Fallback`;
      badge.style.background = "#fef3c7";
      badge.style.color = "#b45309";
      badge.style.borderColor = "#fcd34d";
    }
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = CLOUD_CONFIG.timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function writeAllNodesToFirebase(fullState) {
  if (!initFirebaseIfConfigured() || !firebaseDb) return false;

  const updates = {};
  updates[`/${DB_PATHS.users}`] = arrayToFirebaseNode(fullState.registered_users || []);
  updates[`/${DB_PATHS.financial}`] = arrayToFirebaseNode(fullState.home_financial_users || []);
  updates[`/${DB_PATHS.docs}`] = arrayToFirebaseNode(fullState.system_documents || []);
  updates[`/${DB_PATHS.chat}`] = arrayToFirebaseNode(fullState.system_chat_messages || []);
  updates[`/${DB_PATHS.announcements}`] = arrayToFirebaseNode(fullState.system_announcements || []);
  updates[`/${DB_PATHS.feedback}`] = arrayToFirebaseNode(fullState.system_feedback_items || []);
  updates[`/${DB_PATHS.meta}/updatedAt`] = new Date().toISOString();

  await firebaseDb.ref().update(updates);
  return true;
}

async function readAllNodesFromFirebase() {
  if (!initFirebaseIfConfigured() || !firebaseDb) return null;

  const [usersSnap, finSnap, docsSnap, chatSnap, annSnap, fbSnap] = await Promise.all([
    firebaseDb.ref(DB_PATHS.users).get(),
    firebaseDb.ref(DB_PATHS.financial).get(),
    firebaseDb.ref(DB_PATHS.docs).get(),
    firebaseDb.ref(DB_PATHS.chat).get(),
    firebaseDb.ref(DB_PATHS.announcements).get(),
    firebaseDb.ref(DB_PATHS.feedback).get()
  ]);

  const hasAnyNodeData =
    usersSnap.exists() ||
    finSnap.exists() ||
    docsSnap.exists() ||
    chatSnap.exists() ||
    annSnap.exists() ||
    fbSnap.exists();

  if (hasAnyNodeData) {
    return {
      registered_users: usersSnap.exists() ? firebaseNodeToArray(usersSnap.val()) : [],
      home_financial_users: finSnap.exists() ? firebaseNodeToArray(finSnap.val()) : [],
      system_documents: docsSnap.exists() ? firebaseNodeToArray(docsSnap.val()) : [],
      system_chat_messages: chatSnap.exists() ? firebaseNodeToArray(chatSnap.val()) : [],
      system_announcements: annSnap.exists() ? firebaseNodeToArray(annSnap.val()) : [],
      system_feedback_items: fbSnap.exists() ? firebaseNodeToArray(fbSnap.val()) : []
    };
  }

  return null;
}

async function saveCollectionToCloud(changedKey = null, changedData = null) {
  if (!CLOUD_CONFIG.enabled || !navigator.onLine) {
    isCloudConnected = false;
    localStorage.setItem(STORAGE_KEYS.pendingSync, "true");
    updateDbStatusBadge("local");
    return false;
  }

  if (initFirebaseIfConfigured() && firebaseDb) {
    try {
      const targetPath = changedKey ? mapStorageKeyToDbPath(changedKey) : null;
      if (targetPath && Array.isArray(changedData)) {
        await firebaseDb.ref(targetPath).set(arrayToFirebaseNode(changedData));
        await firebaseDb.ref(`${DB_PATHS.meta}/updatedAt`).set(new Date().toISOString());
      } else {
        await writeAllNodesToFirebase(getFullSystemState());
      }

      isCloudConnected = true;
      localStorage.removeItem(STORAGE_KEYS.pendingSync);
      updateDbStatusBadge("cloud");
      return true;
    } catch {
      isCloudConnected = false;
      localStorage.setItem(STORAGE_KEYS.pendingSync, "true");
      updateDbStatusBadge("local");
      return false;
    }
  }

  if (!CLOUD_CONFIG.apiUrl) {
    isCloudConnected = false;
    localStorage.setItem(STORAGE_KEYS.pendingSync, "true");
    updateDbStatusBadge("local");
    return false;
  }

  try {
    const headers = { "Content-Type": "application/json" };
    if (CLOUD_CONFIG.apiKey) headers["Authorization"] = `Bearer ${CLOUD_CONFIG.apiKey}`;

    const payload = {
      updatedAt: new Date().toISOString(),
      changedKey,
      changedData,
      state: getFullSystemState()
    };

    const res = await fetchWithTimeout(CLOUD_CONFIG.apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Cloud write failed");
    isCloudConnected = true;
    localStorage.removeItem(STORAGE_KEYS.pendingSync);
    updateDbStatusBadge("cloud");
    return true;
  } catch {
    isCloudConnected = false;
    localStorage.setItem(STORAGE_KEYS.pendingSync, "true");
    updateDbStatusBadge("local");
    return false;
  }
}

function attachNodeListener(dbPath, storageKey, fallbackArray) {
  firebaseDb.ref(dbPath).on(
    "value",
    snapshot => {
      if (!navigator.onLine) return;

      const arr = snapshot.exists() ? firebaseNodeToArray(snapshot.val()) : fallbackArray;
      const currentArr = getCollection(storageKey, []);

      isCloudConnected = true;
      updateDbStatusBadge("cloud");

      if (JSON.stringify(currentArr) !== JSON.stringify(arr)) {
        localStorage.setItem(storageKey, JSON.stringify(arr));
        if (isDashboardPage()) {
          refreshAllDashboardViews();
        }
      }
    },
    () => {
      isCloudConnected = false;
      updateDbStatusBadge("local");
    }
  );
}

function startRealtimeCloudListener() {
  if (!initFirebaseIfConfigured() || !firebaseDb || isRealtimeListenerAttached) {
    return false;
  }

  isRealtimeListenerAttached = true;

  attachNodeListener(DB_PATHS.users, STORAGE_KEYS.users, []);
  attachNodeListener(DB_PATHS.financial, STORAGE_KEYS.financial, []);
  attachNodeListener(DB_PATHS.docs, STORAGE_KEYS.docs, []);
  attachNodeListener(DB_PATHS.chat, STORAGE_KEYS.chat, []);
  attachNodeListener(DB_PATHS.feedback, STORAGE_KEYS.feedback, []);
  attachNodeListener(DB_PATHS.announcements, STORAGE_KEYS.announcements, []);

  return true;
}

async function syncWithCloud(showFeedback = false) {
  if (!CLOUD_CONFIG.enabled || !navigator.onLine) {
    isCloudConnected = false;
    updateDbStatusBadge("local");
    if (showFeedback) {
      alert("ℹ️ Ukoresha Local Fallback (nta internet ihari cyangwa Cloud ntiyahujwe). Amakuru abitswe muri localStorage.");
    }
    return false;
  }

  if (initFirebaseIfConfigured() && firebaseDb) {
    try {
      startRealtimeCloudListener();

      const needsPush = localStorage.getItem(STORAGE_KEYS.pendingSync) === "true";
      if (needsPush) {
        await writeAllNodesToFirebase(getFullSystemState());
      }

      const remoteState = await readAllNodesFromFirebase();
      if (remoteState && typeof remoteState === "object") {
        applyFullSystemState(remoteState);
        if (isDashboardPage()) {
          refreshAllDashboardViews();
        }
      }

      isCloudConnected = true;
      updateDbStatusBadge("cloud");
      if (showFeedback) {
        alert("✅ Amakuru yahujwe neza n'ama-nodes ya Firebase Realtime Database!");
      }
      return true;
    } catch {
      isCloudConnected = false;
      updateDbStatusBadge("local");
      if (showFeedback) {
        alert("⚠️ Ntabwo byashobotse guhuza na Firebase ubu. Sisitemu irakomeza gukoresha Local Fallback.");
      }
      return false;
    }
  }

  if (showFeedback) {
    alert("ℹ️ Igenamiterere rya Firebase ntiriratangizwa neza.");
  }
  return false;
}

window.addEventListener("online", () => {
  startRealtimeCloudListener();
  syncWithCloud(false);
});

window.addEventListener("offline", () => {
  isCloudConnected = false;
  updateDbStatusBadge("local");
});

// =========================================================
// INDEXEDDB HELPER (Kubika PDF / Amadosiye mu buryo bwihuse)
// =========================================================
function openDocsIndexedDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PhilosopherDocsDB", 1);
    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains("pdfFiles")) {
        dbInstance.createObjectStore("pdfFiles", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePdfBlobToIndexedDb(docId, file) {
  const idb = await openDocsIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction("pdfFiles", "readwrite");
    const store = tx.objectStore("pdfFiles");
    store.put({
      id: String(docId),
      file: file,
      fileName: file.name,
      fileType: file.type || "application/pdf",
      savedAt: Date.now()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getPdfBlobFromIndexedDb(docId) {
  const idb = await openDocsIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction("pdfFiles", "readonly");
    const store = tx.objectStore("pdfFiles");
    const req = store.get(String(docId));
    req.onsuccess = () => {
      const record = req.result;
      resolve(record && record.file ? record.file : null);
    };
    req.onerror = () => reject(req.error);
  });
}

function readFileAsDataUrlFast(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// =========================================================
// 1. SECURITY GUARD
// =========================================================
if (isDashboardPage()) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert("❌ Ntubyemerewe! Banza winjire ufite konti y'ukuri.");
    window.location.href = getLoginHref();
  } else if (currentUser.role !== "Admin" && currentUser.status !== "Active") {
    alert("⏳ Konti yawe iracyari kuri Pending. Tegereza ko Admin aguha approval mbere yo gukoresha dashboard.");
    clearCurrentUserSession();
    window.location.href = getLoginHref();
  }
}

// =========================================================
// 2. AUTHENTICATION & PASSWORD RESET
// =========================================================
const signUpButton = document.getElementById("signUp");
const signInButton = document.getElementById("signIn");
const container = document.getElementById("container");

if (signUpButton && signInButton && container) {
  signUpButton.addEventListener("click", () => container.classList.add("right-panel-active"));
  signInButton.addEventListener("click", () => container.classList.remove("right-panel-active"));
}

function togglePasswordVisibility() {
  const input = document.getElementById("signinPassword");
  const icon = document.getElementById("toggleSigninPassword");
  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (icon) {
      icon.classList.remove("fa-eye");
      icon.classList.add("fa-eye-slash");
    }
  } else {
    input.type = "password";
    if (icon) {
      icon.classList.remove("fa-eye-slash");
      icon.classList.add("fa-eye");
    }
  }
}

function toggleForgotForm() {
  const forgotBox = document.getElementById("forgotPasswordContainer");
  const resetBox = document.getElementById("resetPasswordContainer");
  if (!forgotBox) return;

  if (resetBox) resetBox.style.display = "none";
  forgotBox.style.display = forgotBox.style.display === "none" ? "block" : "none";
}

function handleForgotPassword(event) {
  event.preventDefault();
  const emailInput = document.getElementById("forgotEmail");
  const forgotBox = document.getElementById("forgotPasswordContainer");
  const resetBox = document.getElementById("resetPasswordContainer");
  if (!emailInput) return;

  const email = emailInput.value.trim().toLowerCase();
  const users = getCollection(STORAGE_KEYS.users, []);
  const found = users.find(u => (u.email || "").trim().toLowerCase() === email);

  if (!found) {
    alert("❌ Iyi meri ntabwo iboneka muri sisitemu.");
    return;
  }

  resetTargetEmail = email;
  resetVerificationCode = String(Math.floor(1000 + Math.random() * 9000));
  alert(`📩 Code yawe yo guhindura ijambo ry'ibanga ni: ${resetVerificationCode}`);

  if (forgotBox) forgotBox.style.display = "none";
  if (resetBox) resetBox.style.display = "block";
}

function handleResetPassword(event) {
  event.preventDefault();
  const codeInput = document.getElementById("resetCodeInput");
  const newPassInput = document.getElementById("newPasswordInput");
  const resetBox = document.getElementById("resetPasswordContainer");
  if (!codeInput || !newPassInput) return;

  const code = codeInput.value.trim();
  const newPassword = newPassInput.value.trim();

  if (!resetTargetEmail || code !== resetVerificationCode) {
    alert("❌ Code mwanditse si yo!");
    return;
  }

  if (newPassword.length < 3) {
    alert("⚠️ Ijambo ry'ibanga rigomba kugira nibura inyuguti 3.");
    return;
  }

  let users = getCollection(STORAGE_KEYS.users, []);
  let updated = false;

  users = users.map(u => {
    if ((u.email || "").trim().toLowerCase() === resetTargetEmail) {
      updated = true;
      return { ...u, password: newPassword };
    }
    return u;
  });

  if (!updated) {
    alert("❌ Konti ntiyabonetse kugira ngo ihindurwe.");
    return;
  }

  setCollection(STORAGE_KEYS.users, users);

  alert("✅ Ijambo ry'ibanga ryahinduwe neza! Ubu ushobora kwinjira ukoresheje ijambo ry'ibanga rishya.");
  if (resetBox) resetBox.style.display = "none";
  codeInput.value = "";
  newPassInput.value = "";
  resetVerificationCode = null;
  resetTargetEmail = null;
}

function handleSignUp(event) {
  event.preventDefault();

  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const phone = document.getElementById("signupPhone").value.trim();
  const roleSelect = document.getElementById("signupRole");
  const requestedRole = roleSelect ? roleSelect.value : "User";
  const password = document.getElementById("signupPassword").value.trim();

  let users = getCollection(STORAGE_KEYS.users, []);

  if (users.some(u => (u.email || "").toLowerCase() === email) || email === "admin@gmail.com") {
    alert("❌ Iyi email isanzwe ikoreshwa!");
    return;
  }

  const newUser = {
    id: Date.now(),
    name,
    email,
    phone,
    role: requestedRole === "Admin" ? "User" : (requestedRole || "User"),
    status: "Pending",
    password,
    avatar: "",
    createdDate: new Date().toLocaleDateString()
  };

  users.push(newUser);
  setCollection(STORAGE_KEYS.users, users);

  alert("⏳ Konti yawe yoherejwe (Status: Pending)! Ntushobora guhita winjira utahawe approval na Admin.");
  if (container) container.classList.remove("right-panel-active");
  event.target.reset();
}

function handleSignIn(event) {
  event.preventDefault();

  const email = document.getElementById("signinEmail").value.trim().toLowerCase();
  const password = document.getElementById("signinPassword").value.trim();

  if (email === "admin@gmail.com" && password === "123") {
    const adminUser = {
      name: "Admin Mukuru",
      email,
      role: "Admin",
      status: "Active",
      avatar: ""
    };
    setCurrentUserSession(adminUser);
    window.location.href = getDashboardHref();
    return;
  }

  const storedUsers = getCollection(STORAGE_KEYS.users, []);
  const foundUser = storedUsers.find(
    u => (u.email || "").trim().toLowerCase() === email && (u.password || "").trim() === password
  );

  if (!foundUser) {
    alert("❌ Imeri cyangwa ijambo ry'ibanga si byo! Banza wuzuze neza cyangwa wiyandikishe.");
    return;
  }

  if (foundUser.status !== "Active") {
    alert("⏳ Konti yawe ntabwo irahabwa approval (Status: Pending). Tegereza ko Admin aguha uburenganzira mbere yo kwinjira.");
    return;
  }

  setCurrentUserSession(foundUser);
  window.location.href = getDashboardHref();
}

// =========================================================
// 3. DASHBOARD LOGIC & ADMIN APPROVAL WORKFLOW
// =========================================================
function switchTab(tabId) {
  const isAdmin = isCurrentUserAdmin();

  if (tabId === "users" && !isAdmin) {
    alert("⛔ Tab ya Users (Approval) igenewe Admin wenyine.");
    tabId = "home";
  }

  document.querySelectorAll(".content-section").forEach(sec => sec.classList.remove("active"));
  document.querySelectorAll(".sidebar-menu button").forEach(btn => btn.classList.remove("active"));

  const targetSec = document.getElementById(tabId);
  const targetBtn = document.getElementById("btn-" + tabId);
  if (targetSec) targetSec.classList.add("active");
  if (targetBtn) targetBtn.classList.add("active");
}

function logout() {
  clearCurrentUserSession();
  window.location.href = getLoginHref();
}

function handleLogout() {
  logout();
}

function setUserFilter(filter) {
  currentUserFilter = filter;
  renderAdminTable();
}

function updatePendingNotifications(users) {
  const isAdmin = isCurrentUserAdmin();
  const pendingUsers = users.filter(u => u.status === "Pending");

  const badge = document.getElementById("sidebarPendingBadge");
  if (badge) {
    if (isAdmin && pendingUsers.length > 0) {
      badge.style.display = "inline-block";
      badge.innerText = pendingUsers.length;
    } else {
      badge.style.display = "none";
    }
  }

  const alertBox = document.getElementById("adminPendingAlertBox");
  const alertCount = document.getElementById("adminPendingAlertCount");
  if (alertBox && alertCount) {
    if (isAdmin && pendingUsers.length > 0) {
      alertBox.style.display = "flex";
      alertCount.innerText = pendingUsers.length;
    } else {
      alertBox.style.display = "none";
    }
  }

  renderHomePendingApprovals(pendingUsers, isAdmin);
}

function renderHomePendingApprovals(pendingUsers, isAdmin) {
  const section = document.getElementById("homePendingApprovalSection");
  const tbody = document.getElementById("homePendingTableBody");
  if (!section || !tbody) return;

  if (!isAdmin || pendingUsers.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  tbody.innerHTML = "";

  pendingUsers.slice(0, 5).forEach((user, idx) => {
    tbody.innerHTML += `
      <tr>
        <td>#${idx + 1}</td>
        <td><b>${escapeHtmlSafe(user.name)}</b></td>
        <td>${escapeHtmlSafe(user.email)}</td>
        <td>${escapeHtmlSafe(user.role)}</td>
        <td>
          <button onclick="approveUser(${user.id})" style="background:#16a34a; color:#fff; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-size:11px; font-weight:600; margin-right:4px;">
            <i class="fa-solid fa-check"></i> Approve
          </button>
          <button onclick="makeUserAdmin(${user.id})" style="background:#0284c7; color:#fff; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-size:11px; font-weight:600; margin-right:4px;">
            Make Admin
          </button>
          <button onclick="deleteUser(${user.id})" style="background:#ef4444; color:#fff; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-size:11px; font-weight:600;">
            Siba
          </button>
        </td>
      </tr>
    `;
  });
}

function renderAdminTable() {
  const users = getCollection(STORAGE_KEYS.users, []);
  const tbody = document.getElementById("userTableBody");
  if (!tbody) return;

  const filterSelect = document.getElementById("userStatusFilter");
  const selectedFilter = filterSelect ? filterSelect.value : currentUserFilter;

  const filtered = (!selectedFilter || selectedFilter.toLowerCase() === "all")
    ? users
    : users.filter(u => u.status === selectedFilter);

  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:20px;">Nta bakoresha bahari kuri iki cyiciro.</td></tr>`;
    return;
  }

  filtered.forEach((user, index) => {
    const badge = user.status === "Active" ? "badge-active" : "badge-pending";
    const avatar = user.avatar
      ? user.avatar
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || "User")}&background=0284c7&color=fff&size=64`;
    const phoneDisplay = user.phone || "Nta telefoni";

    let actionBtn = "";
    if (user.status !== "Active") {
      actionBtn += `<button onclick="approveUser(${user.id})" style="background:#16a34a; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Approve</button>`;
    } else {
      actionBtn += `<button onclick="setUserPending(${user.id})" style="background:#f59e0b; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Pending</button>`;
    }

    if (user.role !== "Admin") {
      actionBtn += `<button onclick="makeUserAdmin(${user.id})" style="background:#0284c7; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Make Admin</button>`;
    }

    actionBtn += `<button onclick="deleteUser(${user.id})" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" title="Siba Umukoresha"><i class="fa-solid fa-trash"></i> Siba</button>`;

    tbody.innerHTML += `
      <tr>
        <td><strong>#${index + 1}</strong></td>
        <td><img src="${avatar}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;"></td>
        <td><b>${escapeHtmlSafe(user.name)}</b></td>
        <td>${escapeHtmlSafe(user.email)}</td>
        <td>${escapeHtmlSafe(phoneDisplay)}</td>
        <td>${escapeHtmlSafe(user.role)}</td>
        <td><span class="${badge}">${escapeHtmlSafe(user.status)}</span></td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });
}

function approveUser(userId) {
  if (!requireAdminPermission("kwemeza abakoresha (Approve)")) return;
  let users = getCollection(STORAGE_KEYS.users, []);
  users = users.map(u => (String(u.id) === String(userId) ? { ...u, status: "Active" } : u));
  setCollection(STORAGE_KEYS.users, users);
  alert("✅ Umukoresha yahawe uburenganzira (Active)!");
  refreshAllDashboardViews();
}

function setUserPending(userId) {
  if (!requireAdminPermission("gusubiza konti kuri Pending")) return;
  let users = getCollection(STORAGE_KEYS.users, []);
  users = users.map(u => (String(u.id) === String(userId) ? { ...u, status: "Pending" } : u));
  setCollection(STORAGE_KEYS.users, users);
  alert("⚠️ Konti yasubijwe kuri Pending.");
  refreshAllDashboardViews();
}

function makeUserAdmin(userId) {
  if (!requireAdminPermission("guha umukoresha uruhare rwa Admin")) return;
  let users = getCollection(STORAGE_KEYS.users, []);
  users = users.map(u => (String(u.id) === String(userId) ? { ...u, role: "Admin", status: "Active" } : u));
  setCollection(STORAGE_KEYS.users, users);
  alert("✅ Umuser yahinduwe Admin kandi ahawe uburenganzira!");
  refreshAllDashboardViews();
}

function deleteUser(userId) {
  if (!requireAdminPermission("gusiba umukoresha")) return;
  if (!confirm("⚠️ Urashaka rwose gusiba uyu mukoresha muri system?")) return;
  let users = getCollection(STORAGE_KEYS.users, []);
  users = users.filter(u => String(u.id) !== String(userId));
  setCollection(STORAGE_KEYS.users, users);
  alert("✅ Umukoresha yasibwe neza!");
  refreshAllDashboardViews();
}

// =========================================================
// 4. BACKUP & RESTORE
// =========================================================
function renderLastBackupInfo() {
  const el = document.getElementById("lastBackupInfo");
  if (!el) return;
  const ts = localStorage.getItem(STORAGE_KEYS.lastBackup);
  el.innerText = ts
    ? `Backup ya nyuma: ${new Date(ts).toLocaleString("rw-RW")}`
    : "Backup ya nyuma: Ntirakorwa";
}

function exportSystemBackup() {
  if (!requireAdminPermission("kumanura Backup")) return;
  const state = getFullSystemState();
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const dateTag = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `philosopher-backup-${dateTag}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  localStorage.setItem(STORAGE_KEYS.lastBackup, new Date().toISOString());
  renderLastBackupInfo();
  alert("✅ Backup (.json) yamanuwe neza!");
}

function importSystemBackup(event) {
  if (!requireAdminPermission("kugarura Backup")) return;
  const fileInput = document.getElementById("restoreBackupFileInput");
  const file = (event && event.target && event.target.files && event.target.files[0]) ||
    (fileInput && fileInput.files && fileInput.files[0]);
  if (!file) {
    alert("⚠️ Nyamuneka hitamo dosiye ya .json mbere yo gukanda Restore.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parsed = JSON.parse(e.target.result);
      const dataToRestore = parsed.state || parsed;
      if (!applyFullSystemState(dataToRestore)) {
        alert("❌ Dosiye ya backup ntabwo ifite imiterere yemewe.");
        return;
      }

      saveCollectionToCloud("restore_backup", getFullSystemState());
      alert("✅ Amakuru yagaruwe neza (Restore completed)!");
      refreshAllDashboardViews();
    } catch {
      alert("❌ Dosiye yatoranyijwe si JSON nziza.");
    } finally {
      if (event && event.target) event.target.value = "";
      if (fileInput) fileInput.value = "";
    }
  };
  reader.readAsText(file);
}

// =========================================================
// 5. DOCUMENTS UPLOAD, LIST & PREVIEW
// =========================================================



function safeSaveSystemDocuments(docsArray) {
  // Kuramo fileData (Base64) kugira ngo localStorage ituzura ikabyara QuotaExceededError
  const lightweightDocs = (Array.isArray(docsArray) ? docsArray : []).map(item => {
    const { fileData, ...rest } = item;
    return {
      ...rest,
      fileData: ""
    };
  });

  

  try {
    localStorage.setItem(STORAGE_KEYS.docs, JSON.stringify(lightweightDocs));
    return lightweightDocs;
  } catch (err) {
    console.warn("localStorage quota reached, keeping latest 15 lightweight records:", err);
    const trimmed = lightweightDocs.slice(0, 15);
    try {
      localStorage.setItem(STORAGE_KEYS.docs, JSON.stringify(trimmed));
    } catch {
      localStorage.removeItem(STORAGE_KEYS.docs);
    }
    
    return trimmed;
  }
}

async function uploadDocumentFromBrowser() {
  const titleInput = document.getElementById("docTitleInput");
  const fileInput = document.getElementById("browserFileInput");
  const progressText = document.getElementById("docUploadProgressText");

  const title = titleInput ? titleInput.value.trim() : "";
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;

  if (!title) {
    alert("⚠️ Nyamuneka shyiramo izina ry'inyandiko (Title).");
    return;
  }

  if (!file) {
    alert("⚠️ Nyamuneka hitamo ifayilo (PDF, Image, cyangwa Doc).");
    return;
  }

  const maxMB = 1024;
  if (file.size > maxMB * 1024 * 1024) {
    alert(`⚠️ Ifayilo ni nini cyane (irengeje ${maxMB} MB). Nyamuneka hitamo ifayilo itarengeje ${maxMB} MB.`);
    return;
  }

  if (progressText) {
    progressText.textContent = "⏳ Birimo koherezwa...";
  }

  try {
    const docId = String(Date.now());
    const currentUser = (typeof getCurrentUser === "function" && getCurrentUser()) ||
      JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser) || localStorage.getItem("currentUser") || "{}");
    const sizeKB = Math.max(1, Math.round(file.size / 1024));
    const sizeMBText = (file.size / (1024 * 1024)).toFixed(2) + " MB";
    const sizeLabel = file.size >= 1024 * 1024 ? sizeMBText : sizeKB + " KB";
    const mimeType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");

    // 1. Bika ifayilo nyayo mu IndexedDB kugira ngo ifunguke imbere muri Settings nta kwangirika
    if (typeof savePdfBlobToIndexedDb === "function") {
      await savePdfBlobToIndexedDb(docId, file);
    }

    // 2. Niba Firebase Storage ihari kandi tutari kuri file://, gerageza no kuyoherezayo
    let fileUrl = "";
    const isHttpOrigin = window.location.protocol === "http:" || window.location.protocol === "https:";
    const storageInstance = isHttpOrigin && typeof initFirebaseStorageIfReady === "function"
      ? initFirebaseStorageIfReady()
      : null;

    if (storageInstance) {
      try {
        const storageRef = storageInstance.ref(`documents/${docId}_${file.name}`);
        const snapshot = await storageRef.put(file);
        fileUrl = await snapshot.ref.getDownloadURL();
      } catch (storageErr) {
        console.warn("Firebase Storage ntiyakoreshejwe, dukoresha IndexedDB:", storageErr.message);
      }
    }

    const uploadedDateStr = new Date().toLocaleString();
    const docRecord = {
      id: docId,
      title: title,
      fileName: file.name,
      fileType: mimeType,
      sizeKB: sizeKB,
      sizeLabel: sizeLabel,
      fileSize: sizeLabel,
      uploadedBy: currentUser.name || currentUser.email || "Admin",
      uploadedAt: uploadedDateStr,
      uploadDate: uploadedDateStr,
      url: fileUrl,
      fileUrl: fileUrl,
      fileData: "",
      storedInIdb: true
    };

    // 3. Bika metadata gusa muri localStorage kugira ngo ntirenze quota
    const existingDocs = getCollection(STORAGE_KEYS.docs, []);
    existingDocs.unshift(docRecord);
    const savedDocs = safeSaveSystemDocuments(existingDocs);

    if (typeof renderDocumentsList === "function") {
      renderDocumentsList();
    }
    if (typeof loadAnalyticsData === "function") {
      loadAnalyticsData();
    }

    // 4. Kohereza metadata / link muri Firebase Realtime Database no guhuza cloud
    if (typeof firebaseDb !== "undefined" && firebaseDb) {
      await firebaseDb.ref(`${DB_PATHS.docs}/${docId}`).set(docRecord);
    } else if (typeof db !== "undefined" && db) {
      await db.ref(`documents/${docId}`).set(docRecord);
    } else if (typeof saveCollectionToCloud === "function") {
      await saveCollectionToCloud(STORAGE_KEYS.docs, savedDocs);
    }

    if (titleInput) titleInput.value = "";
    if (fileInput) fileInput.value = "";
    if (progressText) {
      progressText.textContent = `✅ Byoherejwe neza (${sizeLabel})!`;
    }
  } catch (err) {
    console.error("Upload error:", err);
    if (progressText) {
      progressText.textContent = "❌ Ntibikunze kohereza inyandiko.";
    }
    alert("❌ Habaye ikibazo mu kohereza inyandiko.");
  }
}


function renderDocumentsList() {
  const systemDocs = getCollection(STORAGE_KEYS.docs, []);
  const tbody = document.getElementById("documentTableBody");
  if (!tbody) return;

  const isAdmin = isCurrentUserAdmin();

  tbody.innerHTML = "";
  if (!Array.isArray(systemDocs) || systemDocs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px;">Nta dosiye irashyirwaho.</td></tr>`;
    return;
  }

  systemDocs.forEach((doc, index) => {
    const docTitle = doc.title || doc.fileName || "Document";
    const fileName = doc.fileName || docTitle;
    const sizeText = doc.sizeLabel || doc.fileSize || (doc.sizeKB ? `${doc.sizeKB} KB` : "—");
    const dateText = doc.uploadedAt || doc.uploadDate || "—";
    const fileHref = doc.url || doc.fileUrl || doc.fileData || "";

    const viewBtn = `<button type="button" onclick="viewDocumentInline('${doc.id}')" style="background:#0284c7; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:11px;">Reba</button>`;

    const downloadBtn = fileHref
      ? `<a href="${fileHref}" download="${escapeHtmlSafe(fileName)}" target="_blank" rel="noopener" style="background:#10b981; color:white; padding:5px 10px; border-radius:4px; font-size:11px; text-decoration:none; margin-left:4px;">Manura</a>`
      : "";

    const deleteBtn = isAdmin
      ? `<button type="button" onclick="deleteDocument('${doc.id}')" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:11px; margin-left:4px;" title="Siba Inyandiko">
           <i class="fa-solid fa-trash"></i> Siba
         </button>`
      : "";

    tbody.innerHTML += `
      <tr>
        <td><strong>#${index + 1}</strong></td>
        <td><b>${escapeHtmlSafe(docTitle)}</b><br><small>${escapeHtmlSafe(fileName)}</small></td>
        <td>${escapeHtmlSafe(sizeText)}</td>
        <td>${escapeHtmlSafe(dateText)}</td>
        <td>${viewBtn}${downloadBtn}${deleteBtn}</td>
      </tr>
    `;
  });
}

async function viewDocumentInline(docId) {
  const systemDocs = getCollection(STORAGE_KEYS.docs, []);
  const doc = systemDocs.find(d => String(d.id) === String(docId));
  if (!doc) return;

  const titleEl = document.getElementById("modalDocTitle");
  const viewerEl = document.getElementById("modalDocViewer");
  const modalEl = document.getElementById("documentPreviewModal");
  if (!viewerEl || !modalEl) return;

  if (activePreviewBlobUrl) {
    URL.revokeObjectURL(activePreviewBlobUrl);
    activePreviewBlobUrl = null;
  }

  const docTitle = doc.title || doc.fileName || "Document";
  const fileName = doc.fileName || docTitle;
  const mime = (doc.fileType || "").toLowerCase();
  const nameLower = fileName.toLowerCase();

  if (titleEl) titleEl.innerText = "Reba: " + docTitle;
  modalEl.style.display = "flex";

  viewerEl.innerHTML = `
    <div style="padding:20px; text-align:center; color:#cbd5e1; background:#0f172a; height:100%; display:flex; align-items:center; justify-content:center; gap:10px;">
      <i class="fa-solid fa-spinner fa-spin" style="color:#38bdf8;"></i>
      <span>Birimo gufungura inyandiko imbere muri Settings...</span>
    </div>
  `;

  let sourceUrl = "";

  try {
    const idbFile = await getPdfBlobFromIndexedDb(docId);
    if (idbFile) {
      const blobType = mime && mime !== "application/octet-stream"
        ? mime
        : (nameLower.endsWith(".pdf") ? "application/pdf" : idbFile.type);
      const blob = blobType ? new Blob([idbFile], { type: blobType }) : idbFile;
      sourceUrl = URL.createObjectURL(blob);
      activePreviewBlobUrl = sourceUrl;
    }
  } catch (idbErr) {
    console.warn("IndexedDB read warning:", idbErr);
  }

  if (!sourceUrl) {
    const fallbackRaw = doc.url || doc.fileUrl || doc.fileData || "";
    if (fallbackRaw.startsWith("data:")) {
      try {
        const res = await fetch(fallbackRaw);
        const blob = await res.blob();
        const blobType = mime && mime !== "application/octet-stream"
          ? mime
          : (nameLower.endsWith(".pdf") ? "application/pdf" : blob.type);
        sourceUrl = URL.createObjectURL(new Blob([blob], { type: blobType || "application/pdf" }));
        activePreviewBlobUrl = sourceUrl;
      } catch {
        sourceUrl = fallbackRaw;
      }
    } else {
      sourceUrl = fallbackRaw;
    }
  }

  if (!sourceUrl) {
    viewerEl.innerHTML = `
      <div style="padding:24px; text-align:center; color:#e2e8f0; background:#0f172a; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;">
        <i class="fa-solid fa-circle-info" style="font-size:32px; color:#f59e0b;"></i>
        <div><b>${escapeHtmlSafe(docTitle)}</b></div>
        <p style="font-size:13px; color:#94a3b8; max-width:460px;">
          Iyi dosiye ifite metadata gusa cyangwa nta fayilo y'imbere ibitse muri browser.
        </p>
      </div>
    `;
    return;
  }

  const isPdf = mime === "application/pdf" || nameLower.endsWith(".pdf");
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(nameLower);
  const isDocx = nameLower.endsWith(".docx") || mime.includes("wordprocessingml.document");

  if (isPdf) {
    viewerEl.innerHTML = `
      <embed
        src="${sourceUrl}"
        type="application/pdf"
        style="width:100%; height:100%; min-height:480px; border:none; background:#ffffff;"
      />
    `;
    return;
  }

  if (isImage) {
    viewerEl.innerHTML = `
      <div style="width:100%; height:100%; overflow:auto; display:flex; align-items:center; justify-content:center; background:#0f172a; padding:12px;">
        <img src="${sourceUrl}" alt="${escapeHtmlSafe(docTitle)}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:6px;" />
      </div>
    `;
    return;
  }

  if (isDocx && typeof mammoth !== "undefined") {
    try {
      const response = await fetch(sourceUrl);
      const arrayBuffer = await response.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      viewerEl.innerHTML = `
        <div style="width:100%; height:100%; overflow:auto; background:#ffffff; color:#0f172a; padding:24px; line-height:1.6; font-size:14px;">
          ${result.value || "<p>Nta mwandiko urimo.</p>"}
        </div>
      `;
      return;
    } catch (docxErr) {
      console.warn("DOCX preview warning:", docxErr);
    }
  }

  viewerEl.innerHTML = `
    <iframe src="${sourceUrl}" style="width:100%; height:100%; min-height:480px; border:none; background:#ffffff;"></iframe>
  `;
}

function closeDocumentPreview() {
  const modal = document.getElementById("documentPreviewModal");
  const viewerEl = document.getElementById("modalDocViewer");
  if (activePreviewBlobUrl) {
    URL.revokeObjectURL(activePreviewBlobUrl);
    activePreviewBlobUrl = null;
  }
  if (viewerEl) viewerEl.innerHTML = "";
  if (modal) modal.style.display = "none";
}

function deleteDocument(docId) {
  if (!requireAdminPermission("gusiba amadosiye")) return;
  if (!confirm("⚠️ Urashaka rwose gusiba iyi nyandiko muri system?")) return;

  let systemDocs = getCollection(STORAGE_KEYS.docs, []);
  systemDocs = systemDocs.filter(doc => String(doc.id) !== String(docId));
  setCollection(STORAGE_KEYS.docs, systemDocs);

  alert("✅ Inyandiko yasibwe neza!");
  renderDocumentsList();
  loadAnalyticsData();
}

// =========================================================
// 6. ANALYTICS, FINANCIAL TABLE, PROFILE, CHAT, ANNOUNCEMENTS & FEEDBACK
// =========================================================
function loadAnalyticsData() {
  const users = getCollection(STORAGE_KEYS.users, []);
  const docs = getCollection(STORAGE_KEYS.docs, []);

  if (document.getElementById("totalUsersCount")) {
    document.getElementById("totalUsersCount").innerText = users.length;
  }
  if (document.getElementById("pendingUsersCount")) {
    document.getElementById("pendingUsersCount").innerText = users.filter(u => u.status === "Pending").length;
  }
  if (document.getElementById("adminCount")) {
    const adminsInList = users.filter(u => u.role === "Admin").length;
    document.getElementById("adminCount").innerText = Math.max(1, adminsInList);
  }
  if (document.getElementById("activeUsersCount")) {
    document.getElementById("activeUsersCount").innerText = users.filter(u => u.status === "Active").length;
  }
  if (document.getElementById("pendingAnalyticsCount")) {
    document.getElementById("pendingAnalyticsCount").innerText = users.filter(u => u.status === "Pending").length;
  }
  if (document.getElementById("totalDocsCount")) {
    document.getElementById("totalDocsCount").innerText = docs.length;
  }

  const homeUserTableBody = document.getElementById("homeUserTableBody");
  if (homeUserTableBody) {
    homeUserTableBody.innerHTML = "";
    users.forEach((u, idx) => {
      const badge = u.status === "Active" ? "badge-active" : "badge-pending";
      homeUserTableBody.innerHTML += `
        <tr>
          <td>#${idx + 1}</td>
          <td><b>${escapeHtmlSafe(u.name)}</b></td>
          <td>${escapeHtmlSafe(u.email)}</td>
          <td>${escapeHtmlSafe(u.role)}</td>
          <td><span class="${badge}">${escapeHtmlSafe(u.status)}</span></td>
        </tr>
      `;
    });
  }

  updateUsersPercentageBars(users);
  updatePendingNotifications(users);
}

function updateUsersPercentageBars(allUsers = null) {
  const users = allUsers || getCollection(STORAGE_KEYS.users, []);
  const total = users.length;
  const activeCount = users.filter(u => u.status && u.status.toLowerCase() === "active").length;
  const pendingCount = users.filter(u => u.status && u.status.toLowerCase() === "pending").length;

  const activePct = total > 0 ? Math.round((activeCount / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.round((pendingCount / total) * 100) : 0;

  if (document.getElementById("activePercentage")) {
    document.getElementById("activePercentage").innerText = `${activePct}%`;
  }
  if (document.getElementById("pendingPercentage")) {
    document.getElementById("pendingPercentage").innerText = `${pendingPct}%`;
  }
  if (document.getElementById("activeProgressBar")) {
    document.getElementById("activeProgressBar").style.width = `${activePct}%`;
  }
  if (document.getElementById("pendingProgressBar")) {
    document.getElementById("pendingProgressBar").style.width = `${pendingPct}%`;
  }
}

function renderHomeFinancialTable() {
  const tbody = document.getElementById("homeFinancialTableBody");
  if (!tbody) return;

  const currentUser = getCurrentUser();
  const isAdmin = isCurrentUserAdmin();
  const allFinancialUsers = getCollection(STORAGE_KEYS.financial, []);
  const registeredUsers = getCollection(STORAGE_KEYS.users, []);

  const currentUserName = (currentUser && currentUser.name ? currentUser.name : "").trim().toLowerCase();
  const currentUserEmail = (currentUser && currentUser.email ? currentUser.email : "").trim().toLowerCase();

  const visibleFinancialUsers = isAdmin
    ? allFinancialUsers
    : allFinancialUsers.filter(item => {
        const writtenByAdmin = !item.createdByRole || item.createdByRole === "Admin";
        if (!writtenByAdmin) return false;

        const itemName = (item.name || item.userName || "").trim().toLowerCase();
        const itemEmail = (item.email || "").trim().toLowerCase();

        if (itemEmail && currentUserEmail) {
          return itemEmail === currentUserEmail;
        }

        const matchedUser = registeredUsers.find(
          u => (u.name || "").trim().toLowerCase() === itemName
        );
        if (matchedUser && (matchedUser.email || "").trim().toLowerCase() === currentUserEmail) {
          return true;
        }

        return Boolean(currentUserName && itemName === currentUserName);
      });

  document.querySelectorAll(".admin-only-col").forEach(col => {
    col.style.display = isAdmin ? "table-cell" : "none";
  });

  const userAmountHeader = document.getElementById("userFinancialAmountHeader");
  if (userAmountHeader) {
    userAmountHeader.style.display = isAdmin ? "none" : "table-cell";
  }

  tbody.innerHTML = "";
  if (visibleFinancialUsers.length === 0) {
    const emptyMsg = isAdmin
      ? "Nta makuru y'imari arashyirwamo."
      : "Nta gikorwa cy'amafaranga cyanditswe na Admin kikuriho.";
    const colSpanCount = isAdmin ? 5 : 3;
    tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; color:#94a3b8; padding:16px;">${emptyMsg}</td></tr>`;
    return;
  }

  visibleFinancialUsers.forEach((item, idx) => {
    const displayName = item.name || item.userName || "User";
    const amountDisplay = `${Number(item.amount || 0).toLocaleString()} RWF`;

    if (isAdmin) {
      tbody.innerHTML += `
        <tr>
          <td>#${idx + 1}</td>
          <td><b>${escapeHtmlSafe(displayName)}</b></td>
          <td>${amountDisplay}</td>
          <td>${escapeHtmlSafe(item.date || "-")}</td>
          <td>
            <button onclick="deleteHomeFinancialUser(${item.id})" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px;">Siba</button>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML += `
        <tr>
          <td>#${idx + 1}</td>
          <td><b>${escapeHtmlSafe(displayName)}</b></td>
          <td><span style="font-weight:700; color:#0284c7;">${amountDisplay}</span></td>
        </tr>
      `;
    }
  });
}

function openAddHomeUserModal() {
  if (!requireAdminPermission("kwandika amakuru y'imari")) return;
  const modal = document.getElementById("addHomeUserModal");
  if (modal) modal.style.display = "flex";
}

function closeAddHomeUserModal() {
  const modal = document.getElementById("addHomeUserModal");
  if (modal) modal.style.display = "none";
}

function saveHomeFinancialUser(event) {
  event.preventDefault();
  if (!requireAdminPermission("kwandika amakuru y'imari")) return;

  const currentUser = getCurrentUser();
  const nameInput = document.getElementById("financialUserName");
  const amountInput = document.getElementById("financialUserAmount");
  if (!nameInput || !amountInput) return;

  const rawName = nameInput.value.trim();
  const amount = amountInput.value.trim();
  if (!rawName || !amount) {
    alert("⚠️ Nyamuneka andika izina n'umubare w'amafaranga.");
    return;
  }

  const registeredUsers = getCollection(STORAGE_KEYS.users, []);
  const matchedUser = registeredUsers.find(
    u =>
      (u.name || "").trim().toLowerCase() === rawName.toLowerCase() ||
      (u.email || "").trim().toLowerCase() === rawName.toLowerCase()
  );

  const resolvedName = matchedUser && matchedUser.name ? matchedUser.name : rawName;
  const resolvedEmail = matchedUser ? (matchedUser.email || "").trim().toLowerCase() : "";

  const list = getCollection(STORAGE_KEYS.financial, []);
  list.push({
    id: Date.now(),
    name: resolvedName,
    userName: resolvedName,
    email: resolvedEmail,
    amount: Number(amount),
    date: new Date().toLocaleDateString(),
    createdByRole: "Admin",
    createdBy: (currentUser?.email || "admin@gmail.com").trim().toLowerCase()
  });
  setCollection(STORAGE_KEYS.financial, list);

  nameInput.value = "";
  amountInput.value = "";
  closeAddHomeUserModal();
  renderHomeFinancialTable();
}

function deleteHomeFinancialUser(id) {
  if (!requireAdminPermission("gusiba amakuru y'imari")) return;
  let list = getCollection(STORAGE_KEYS.financial, []);
  list = list.filter(item => String(item.id) !== String(id));
  setCollection(STORAGE_KEYS.financial, list);
  renderHomeFinancialTable();
}


function compressAvatarDataUrl(file, maxSize = 160, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;

        if (w > h) {
          if (w > maxSize) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          }
        } else {
          if (h > maxSize) {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}



async function updateHomeProfilePicture(event) {
  event.preventDefault();
  const fileInput = document.getElementById("homeAvatarInput");
  const file = fileInput && fileInput.files && fileInput.files[0];
  const currentUser = getCurrentUser();
  if (!file || !currentUser) return;

  try {
    const avatarData = await compressAvatarDataUrl(file, 160, 0.72);
    currentUser.avatar = avatarData;
    setCurrentUserSession(currentUser);

    let users = getCollection(STORAGE_KEYS.users, []);
    const emailKey = (currentUser.email || "").trim().toLowerCase();
    const existsInUsers = users.some(u => (u.email || "").trim().toLowerCase() === emailKey);

    if (existsInUsers) {
      users = users.map(u =>
        (u.email || "").trim().toLowerCase() === emailKey ? { ...u, avatar: avatarData } : u
      );
    } else if (emailKey) {
      users.push({
        id: currentUser.id || Date.now(),
        name: currentUser.name || "User",
        email: currentUser.email,
        phone: currentUser.phone || "",
        role: currentUser.role || "User",
        status: currentUser.status || "Active",
        password: currentUser.password || "",
        avatar: avatarData,
        createdDate: currentUser.createdDate || new Date().toLocaleDateString()
      });
    }

   
    setCollection(STORAGE_KEYS.users, users);

    if (firebaseDb && currentUser.id) {
      await firebaseDb.ref(`${DB_PATHS.users}/${currentUser.id}/avatar`).set(avatarData);
    }

    fileInput.value = "";
    applyUserProfileUI();
    renderAdminTable();
    alert("✅ Ifoto y'umwirondoro yahinduwe neza kandi yoherejwe kuri Cloud!");
  } catch (err) {
    console.error("Avatar update error:", err);
    alert("❌ Ntibikunze guhindura ifoto.");
  }

  setCollection(STORAGE_KEYS.users, users);

    // HANO NI HO WAYANDIKIRA KURI FIREBASE (users node)
    if (firebaseDb) {
      const targetUser = users.find(
        u => (u.email || "").trim().toLowerCase() === emailKey
      );
      const userNodeId = (targetUser && targetUser.id) || currentUser.id;
      if (userNodeId) {
        await firebaseDb.ref(`${DB_PATHS.users}/${userNodeId}/avatar`).set(avatarData);
      }
    }

    fileInput.value = "";
    applyUserProfileUI();
    renderAdminTable();

}


function applyUserProfileUI() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const avatarUrl = currentUser.avatar
    ? currentUser.avatar
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || "User")}&background=0284c7&color=fff&size=100`;

  document.querySelectorAll(".user-profile-avatar").forEach(img => {
    img.src = avatarUrl;
  });
  document.querySelectorAll(".user-profile-name, [data-user-name], #loggedUserName").forEach(el => {
    el.innerText = currentUser.name || "Umukoresha";
  });
  document.querySelectorAll(".user-profile-email, [data-user-email]").forEach(el => {
    el.innerText = currentUser.email || "";
  });
  document.querySelectorAll("[data-user-role], #loggedUserRole").forEach(el => {
    el.innerText = currentUser.role || "User";
  });

  const welcomeTitle = document.getElementById("welcomeTitle");
  if (welcomeTitle) {
    welcomeTitle.innerText = `🏠 Ikaze kuri Home, ${currentUser.name || "Umukoresha"}`;
  }

  const isAdmin = currentUser.role === "Admin";
  const usersTabBtn = document.getElementById("btn-users");
  const addHomeUserBtn = document.getElementById("addHomeUserBtn");
  const adminDocCard = document.getElementById("adminDocumentUploadCard");
  const adminBackupCard = document.getElementById("adminBackupCard");
  const clearChatBtn = document.getElementById("clearChatBtn");
  const clearFeedbackBtn = document.getElementById("clearFeedbackBtn");

  if (usersTabBtn) usersTabBtn.style.display = isAdmin ? "flex" : "none";
  if (addHomeUserBtn) addHomeUserBtn.style.display = isAdmin ? "inline-flex" : "none";
  if (adminDocCard) adminDocCard.style.display = isAdmin ? "block" : "none";
  if (adminBackupCard) adminBackupCard.style.display = isAdmin ? "block" : "none";
  if (clearChatBtn) clearChatBtn.style.display = isAdmin ? "inline-block" : "none";
  if (clearFeedbackBtn) clearFeedbackBtn.style.display = isAdmin ? "inline-block" : "none";
}

const latestUsers = getCollection(STORAGE_KEYS.users, []);
  const matchedLatest = latestUsers.find(
    u => (u.email || "").trim().toLowerCase() === (currentUser.email || "").trim().toLowerCase()
  );
  if (matchedLatest && matchedLatest.avatar && matchedLatest.avatar !== currentUser.avatar) {
    currentUser.avatar = matchedLatest.avatar;
    setCurrentUserSession(currentUser);
  }


function formatSentTimestamp(dateObj = new Date()) {
  const datePart = dateObj.toLocaleDateString("rw-RW", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const timePart = dateObj.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  return `${datePart} saa ${timePart}`;
}

function sendChatMessage() {
  const input = document.getElementById("chatInputMsg");
  const currentUser = getCurrentUser();
  if (!input || !currentUser) return;

  const text = input.value.trim();
  if (!text) return;

  const now = new Date();
  const messages = getCollection(STORAGE_KEYS.chat, []);
  messages.push({
    id: Date.now(),
    sender: currentUser.name || currentUser.email,
    role: currentUser.role || "User",
    text,
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    sentAt: formatSentTimestamp(now)
  });
  setCollection(STORAGE_KEYS.chat, messages);
  input.value = "";
  renderChatMessages();
}

function renderChatMessages() {
  const box = document.getElementById("chatMessagesBox");
  const lastInfo = document.getElementById("lastChatSentInfo");
  if (!box) return;

  const isAdmin = isCurrentUserAdmin();
  const messages = getCollection(STORAGE_KEYS.chat, []);
  box.innerHTML = "";

  if (messages.length === 0) {
    if (lastInfo) lastInfo.innerText = "Ubutumwa buheruka: Nta buriho";
    box.innerHTML = `<div style="color:#94a3b8; font-size:12px; text-align:center;">Nta butumwa burandikwa. Tangira ikiganiro!</div>`;
    return;
  }

  const latestMsg = messages[messages.length - 1];
  if (lastInfo) {
    const latestTime = latestMsg.sentAt || latestMsg.time || "";
    lastInfo.innerText = `Ubutumwa buheruka bwoherejwe: ${latestTime}`;
  }

  messages.forEach(msg => {
    const sentLabel = msg.sentAt ? `Byoherejwe: ${msg.sentAt}` : `Igihe: ${msg.time || ""}`;
    const deleteSingleBtn = isAdmin
      ? `<button onclick="deleteChatMessage('${msg.id}')" title="Siba ubu butumwa" style="background:transparent; color:#f87171; border:none; cursor:pointer; font-size:12px; padding:0 4px;">
           <i class="fa-solid fa-trash"></i>
         </button>`
      : "";

    box.innerHTML += `
      <div style="background:#1e293b; padding:8px 12px; border-radius:8px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; color:#38bdf8; font-weight:600; margin-bottom:3px; gap:8px;">
          <span>${escapeHtmlSafe(msg.sender)} (${escapeHtmlSafe(msg.role)})</span>
          <span style="display:inline-flex; align-items:center; gap:6px; font-size:10px; color:#94a3b8;">
            <span>${escapeHtmlSafe(sentLabel)}</span>
            ${deleteSingleBtn}
          </span>
        </div>
        <div style="color:#f8fafc;">${escapeHtmlSafe(msg.text)}</div>
      </div>
    `;
  });
  box.scrollTop = box.scrollHeight;
}

function deleteChatMessage(messageId) {
  if (!requireAdminPermission("gusiba ubutumwa")) return;
  if (!confirm("⚠️ Urashaka rwose gusiba ubu butumwa?")) return;

  let messages = getCollection(STORAGE_KEYS.chat, []);
  messages = messages.filter(msg => String(msg.id) !== String(messageId));
  setCollection(STORAGE_KEYS.chat, messages);
  renderChatMessages();
}

function clearAllChatMessages() {
  if (!requireAdminPermission("gusiba ubutumwa bwose")) return;
  if (!confirm("⚠️ Urashaka gusiba ubutumwa bwose bw'ikiganiro?")) return;

  setCollection(STORAGE_KEYS.chat, []);
  renderChatMessages();
}

function postAnnouncement() {
  const titleEl = document.getElementById("announcementTitle");
  const priorityEl = document.getElementById("announcementPriority");
  const targetEl = document.getElementById("announcementTargetRole");
  const bodyEl = document.getElementById("announcementBody");
  const currentUser = getCurrentUser();
  if (!titleEl || !bodyEl || !currentUser) return;

  const title = titleEl.value.trim();
  const body = bodyEl.value.trim();
  const priority = priorityEl ? priorityEl.value : "Normal";
  const targetRole = targetEl ? targetEl.value : "All";
  if (!title || !body) return;

  const now = new Date();
  const list = getCollection(STORAGE_KEYS.announcements, []);
  list.unshift({
    id: Date.now(),
    title,
    body,
    priority,
    targetRole,
    author: currentUser.name || currentUser.email,
    date: now.toLocaleDateString(),
    sentAt: formatSentTimestamp(now)
  });
  setCollection(STORAGE_KEYS.announcements, list);

  titleEl.value = "";
  bodyEl.value = "";
  renderAnnouncements();
}

function renderAnnouncements() {
  const container = document.getElementById("announcementsListContainer");
  const lastInfo = document.getElementById("lastAnnouncementSentInfo");
  if (!container) return;

  const currentUser = getCurrentUser();
  const userRole = (currentUser && currentUser.role) || "User";
  const isAdmin = isCurrentUserAdmin();
  const allList = getCollection(STORAGE_KEYS.announcements, []);

  const list = isAdmin
    ? allList
    : allList.filter(item => {
        const target = item.targetRole || "All";
        return target === "All" || target === userRole;
      });

  container.innerHTML = "";

  if (list.length === 0) {
    if (lastInfo) lastInfo.innerText = "Itangazo riheruka: Nta ririho";
    container.innerHTML = `<div style="color:#94a3b8; font-size:12px; text-align:center;">Nta tangazo rirahari.</div>`;
    return;
  }

  const latestAnn = list[0];
  if (lastInfo) {
    const latestAnnTime = latestAnn.sentAt || latestAnn.date || "";
    lastInfo.innerText = `Itangazo riheruka gushyirwaho: ${latestAnnTime}`;
  }

  list.forEach(item => {
    const isUrgent = item.priority === "Urgent";
    const targetBadge = item.targetRole && item.targetRole !== "All"
      ? `<span style="background:#0284c7; color:#fff; padding:1px 6px; border-radius:4px; font-size:9px; margin-left:6px;">${escapeHtmlSafe(item.targetRole)}</span>`
      : `<span style="background:#334155; color:#cbd5e1; padding:1px 6px; border-radius:4px; font-size:9px; margin-left:6px;">Bose</span>`;
    const sentLabel = item.sentAt ? `Byashyizweho: ${item.sentAt}` : `Itariki: ${item.date || ""}`;
    const deleteSingleBtn = isAdmin
      ? `<button onclick="deleteAnnouncement('${item.id}')" title="Siba iri tangazo" style="background:transparent; color:#f87171; border:none; cursor:pointer; font-size:12px; padding:0 4px;">
           <i class="fa-solid fa-trash"></i>
         </button>`
      : "";

    container.innerHTML += `
      <div style="background:#1e293b; border-left:3px solid ${isUrgent ? "#ef4444" : "#f59e0b"}; padding:8px 10px; border-radius:6px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; gap:8px;">
          <strong style="color:${isUrgent ? "#fca5a5" : "#fde68a"};">${escapeHtmlSafe(item.title)}${targetBadge}</strong>
          <span style="display:inline-flex; align-items:center; gap:6px; font-size:10px; color:#94a3b8;">
            <span>${escapeHtmlSafe(sentLabel)}</span>
            ${deleteSingleBtn}
          </span>
        </div>
        <div style="color:#e2e8f0;">${escapeHtmlSafe(item.body)}</div>
      </div>
    `;
  });
}

function deleteAnnouncement(announcementId) {
  if (!requireAdminPermission("gusiba amatangazo")) return;
  if (!confirm("⚠️ Urashaka rwose gusiba iri tangazo?")) return;

  let list = getCollection(STORAGE_KEYS.announcements, []);
  list = list.filter(item => String(item.id) !== String(announcementId));
  setCollection(STORAGE_KEYS.announcements, list);
  renderAnnouncements();
}

function submitFeedbackItem() {
  const categoryEl = document.getElementById("feedbackCategory");
  const inputEl = document.getElementById("feedbackInputText");
  const currentUser = getCurrentUser();
  if (!inputEl || !currentUser) return;

  const message = inputEl.value.trim();
  const category = categoryEl ? categoryEl.value : "Igitekerezo";
  if (!message) return;

  const now = new Date();
  const list = getCollection(STORAGE_KEYS.feedback, []);
  list.unshift({
    id: Date.now(),
    category,
    message,
    author: currentUser.name || currentUser.email,
    role: currentUser.role || "User",
    date: now.toLocaleDateString(),
    sentAt: formatSentTimestamp(now)
  });
  setCollection(STORAGE_KEYS.feedback, list);

  inputEl.value = "";
  renderFeedbackItems();
}

function deleteFeedbackItem(feedbackId) {
  if (!requireAdminPermission("gusiba ibitekerezo")) return;
  if (!confirm("⚠️ Urashaka gusiba iki gitekerezo / icyifuzo?")) return;

  let list = getCollection(STORAGE_KEYS.feedback, []);
  list = list.filter(item => String(item.id) !== String(feedbackId));
  setCollection(STORAGE_KEYS.feedback, list);
  renderFeedbackItems();
}

function clearAllFeedbackItems() {
  if (!requireAdminPermission("gusiba ibitekerezo byose")) return;
  if (!confirm("⚠️ Urashaka gusiba ibyifuzo n'ibitekerezo byose?")) return;

  setCollection(STORAGE_KEYS.feedback, []);
  renderFeedbackItems();
}

function renderFeedbackItems() {
  const container = document.getElementById("feedbackListContainer");
  const lastInfo = document.getElementById("lastFeedbackSentInfo");
  if (!container) return;

  const currentUser = getCurrentUser();
  const isAdmin = isCurrentUserAdmin();
  const allList = getCollection(STORAGE_KEYS.feedback, []);

  const list = isAdmin
    ? allList
    : allList.filter(item => {
        const sameAuthor = (item.author || "").toLowerCase() === (currentUser?.name || currentUser?.email || "").toLowerCase();
        return sameAuthor;
      });

  container.innerHTML = "";

  if (list.length === 0) {
    if (lastInfo) lastInfo.innerText = "Igitekerezo giheruka: Nta gihari";
    container.innerHTML = `<div style="color:#94a3b8; font-size:12px; text-align:center;">Nta gitekerezo cyangwa icyifuzo kirandikwa.</div>`;
    return;
  }

  const latestItem = list[0];
  if (lastInfo) {
    lastInfo.innerText = `Giheruka koherezwa: ${latestItem.sentAt || latestItem.date || ""}`;
  }

  list.forEach(item => {
    const sentLabel = item.sentAt ? `Byoherejwe: ${item.sentAt}` : `Itariki: ${item.date || ""}`;
    const deleteSingleBtn = isAdmin
      ? `<button onclick="deleteFeedbackItem('${item.id}')" title="Siba iki gitekerezo" style="background:transparent; color:#f87171; border:none; cursor:pointer; font-size:12px; padding:0 4px;">
           <i class="fa-solid fa-trash"></i>
         </button>`
      : "";

    container.innerHTML += `
      <div style="background:#1e293b; border-left:3px solid #34d399; padding:8px 10px; border-radius:6px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; gap:8px;">
          <strong style="color:#6ee7b7;">${escapeHtmlSafe(item.category)} • ${escapeHtmlSafe(item.author)} (${escapeHtmlSafe(item.role)})</strong>
          <span style="display:inline-flex; align-items:center; gap:6px; font-size:10px; color:#94a3b8;">
            <span>${escapeHtmlSafe(sentLabel)}</span>
            ${deleteSingleBtn}
          </span>
        </div>
        <div style="color:#e2e8f0;">${escapeHtmlSafe(item.message)}</div>
      </div>
    `;
  });
}

function applyAndSaveUiPreferences() {
  const themeSelect = document.getElementById("uiThemeSelect");
  const fontSelect = document.getElementById("uiFontSizeSelect");

  const theme = themeSelect ? themeSelect.value : "light";
  const fontSize = fontSelect ? fontSelect.value : "normal";

  localStorage.setItem(STORAGE_KEYS.uiPrefs, JSON.stringify({ theme, fontSize }));
  loadSavedUiPreferences();
}

function loadSavedUiPreferences() {
  let prefs = { theme: "light", fontSize: "normal" };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.uiPrefs));
    if (saved && typeof saved === "object") prefs = { ...prefs, ...saved };
  } catch {}

  document.body.classList.toggle("dark-theme", prefs.theme === "dark");
  document.body.classList.toggle("font-large", prefs.fontSize === "large");

  const themeSelect = document.getElementById("uiThemeSelect");
  const fontSelect = document.getElementById("uiFontSizeSelect");
  if (themeSelect) themeSelect.value = prefs.theme;
  if (fontSelect) fontSelect.value = prefs.fontSize;
}

function resetUiPreferences() {
  localStorage.removeItem(STORAGE_KEYS.uiPrefs);
  loadSavedUiPreferences();
}

function sendEmailFromPage(event) {
  event.preventDefault();
  const form = event.target;
  const textInputs = form.querySelectorAll('input[type="text"]');
  const name = (textInputs[0]?.value || "").trim();
  const senderEmail = (form.querySelector('input[type="email"]')?.value || "").trim();
  const subject = (textInputs[1]?.value || "Ubusabe bwa Serivisi").trim();
  const message = (form.querySelector("textarea")?.value || "").trim();

  const adminEmail = "ukwitegetseprosper@gmail.com";
  const mailBody = `Amazina: ${name}%0D%0AEmail: ${senderEmail}%0D%0A%0D%0AUbutumwa:%0D%0A${encodeURIComponent(message)}`;
  window.location.href = `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}&body=${mailBody}`;
}

function toggleSidebar() {
  const sidebar = document.getElementById("mainSidebar");
  const mainContent = document.getElementById("mainContent");
  const icon = document.getElementById("toggleIcon");

  if (sidebar) sidebar.classList.toggle("open");
  if (mainContent) mainContent.classList.toggle("shifted");
  if (icon) {
    icon.classList.toggle("fa-bars");
    icon.classList.toggle("fa-xmark");
  }
}

function refreshAllDashboardViews() {
  applyUserProfileUI();
  loadAnalyticsData();
  renderAdminTable();
  renderDocumentsList();
  renderHomeFinancialTable();
  renderChatMessages();
  renderAnnouncements();
  renderFeedbackItems();
  renderLastBackupInfo();
  loadSavedUiPreferences();
}

function startClocks() {
  function tick() {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);
    const dateStr = now.toLocaleDateString("rw-RW", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric"
    });

    ["liveClock", "loginLiveClock"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = timeStr;
    });

    ["liveDate", "loginLiveDate"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = dateStr;
    });
  }

  tick();
  setInterval(tick, 1000);
}

// =========================================================
// 7. INITIALIZATION
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  loadSavedUiPreferences();
  startClocks();

  const connectedNow = initFirebaseIfConfigured();
  isCloudConnected = connectedNow;
  updateDbStatusBadge(isCloudConnected ? "cloud" : "local");

  if (isDashboardPage()) {
    refreshAllDashboardViews();
  }

  if (connectedNow && navigator.onLine) {
    startRealtimeCloudListener();
    syncWithCloud(false);
  }
});