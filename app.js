import { auth, db } from "./firebase-config.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let pendingDeleteId = null;
let people = [];
let editingPersonId = null;
let tasks = [];
let unsubscribeTasks = null;
let suggestionIndex = -1;
let selectedCalendarDate = null;

const PEOPLE_STORAGE_KEY = "my-task-app-people";
const TASK_STORAGE_KEY = "my-task-app-tasks";
const PREFERENCE_STORAGE_KEY = "my-task-app-preferences";
const ACTIVITY_LIMIT = 16;
const NOTIFICATION_TITLE = "My Task App";

let taskList = null;
let menuDropdown = null;
let menuUser = null;
let menuSignIn = null;
let menuSignOut = null;
let assignedToInput = null;
let peopleSuggestions = null;
let taskSearchInput = null;
let taskFilterSelect = null;
let priorityFilterSelect = null;
let sortSelect = null;
let darkModeToggle = null;
let aiPanel = null;
let calendarPanel = null;
let dashboard = null;
let progressBar = null;
let completionLabel = null;
let statusLegend = null;
let personCounts = null;
let activityTimeline = null;
let calendarGrid = null;
let calendarSummary = null;
let loadingOverlay = null;
let toastRoot = null;

const state = {
  search: "",
  statusFilter: "All",
  priorityFilter: "All",
  sortMode: "latest"
};

function bootstrap() {
  taskList = document.getElementById("task-list");
  menuDropdown = document.getElementById("menu-dropdown");
  menuUser = document.getElementById("menu-user");
  menuSignIn = document.getElementById("menu-signin");
  menuSignOut = document.getElementById("menu-signout");
  assignedToInput = document.getElementById("assigned-to");
  peopleSuggestions = document.getElementById("people-suggestions");
  taskSearchInput = document.getElementById("task-search");
  taskFilterSelect = document.getElementById("task-filter");
  priorityFilterSelect = document.getElementById("priority-filter");
  sortSelect = document.getElementById("sort-select");
  darkModeToggle = document.getElementById("dark-mode-toggle");
  aiPanel = document.getElementById("ai-assistant-panel");
  calendarPanel = document.getElementById("calendar-panel");
  dashboard = document.getElementById("dashboard");
  progressBar = document.getElementById("progress-bar");
  completionLabel = document.getElementById("completion-label");
  statusLegend = document.getElementById("status-legend");
  personCounts = document.getElementById("person-counts");
  activityTimeline = document.getElementById("activity-timeline");
  calendarGrid = document.getElementById("calendar-grid");
  calendarSummary = document.getElementById("calendar-summary");
  loadingOverlay = document.getElementById("loading-overlay");
  toastRoot = document.getElementById("toast-root");

  attachEvents();
  loadPreferences();
  loadPeopleFromStorage();
  subscribeToAuth();
}

function attachEvents() {
  const taskInput = document.getElementById("task-input");
  const taskDescription = document.getElementById("task-description");
  const checklistInput = document.getElementById("checklist-input");
  const peopleSearchInput = document.getElementById("people-search");

  if (taskInput) {
    taskInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        window.addTask();
      }
    });
  }

  if (taskSearchInput) {
    taskSearchInput.addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLowerCase();
      persistPreferences();
      renderTasks();
    });
  }

  if (taskFilterSelect) {
    taskFilterSelect.addEventListener("change", (event) => {
      state.statusFilter = event.target.value;
      persistPreferences();
      renderTasks();
    });
  }

  if (priorityFilterSelect) {
    priorityFilterSelect.addEventListener("change", (event) => {
      state.priorityFilter = event.target.value;
      persistPreferences();
      renderTasks();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (event) => {
      state.sortMode = event.target.value;
      persistPreferences();
      renderTasks();
    });
  }

  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", () => {
      const next = document.body.classList.toggle("dark");
      persistPreferences();
      darkModeToggle.textContent = next ? "Light Mode" : "Dark Mode";
    });
  }

  const aiButton = document.getElementById("ai-assistant-toggle");
  if (aiButton) {
    aiButton.addEventListener("click", toggleAssistantPanel);
  }

  const calendarToggle = document.getElementById("calendar-toggle");
  if (calendarToggle) {
    calendarToggle.addEventListener("click", () => {
      if (calendarPanel) {
        calendarPanel.classList.toggle("hidden");
      }
    });
  }

  if (assignedToInput) {
    assignedToInput.addEventListener("input", updateAssignmentSuggestions);
    assignedToInput.addEventListener("focus", updateAssignmentSuggestions);
    assignedToInput.addEventListener("keydown", handleSuggestionKeyboard);
    assignedToInput.addEventListener("blur", () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (peopleSuggestions && !peopleSuggestions.contains(active)) {
          peopleSuggestions.classList.add("hidden");
        }
      }, 180);
    });
  }

  if (peopleSuggestions) {
    peopleSuggestions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-name]");
      if (button) {
        window.selectPersonSuggestion(button.getAttribute("data-name"));
      }
    });
  }

  if (peopleSearchInput) {
    peopleSearchInput.addEventListener("input", () => {
      renderPeopleList();
    });
  }

  if (taskDescription) {
    taskDescription.addEventListener("input", () => {
      if (taskDescription.value.trim()) {
        taskDescription.classList.add("has-value");
      } else {
        taskDescription.classList.remove("has-value");
      }
    });
  }

  if (checklistInput) {
    checklistInput.addEventListener("input", () => {
      if (checklistInput.value.trim()) {
        checklistInput.classList.add("has-value");
      } else {
        checklistInput.classList.remove("has-value");
      }
    });
  }
}

function subscribeToAuth() {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (menuUser) {
      menuUser.textContent = user ? user.displayName || "Signed in" : "Not signed in";
    }
    if (menuSignIn) {
      menuSignIn.classList.toggle("hidden", Boolean(user));
    }
    if (menuSignOut) {
      menuSignOut.classList.toggle("hidden", !user);
    }

    if (unsubscribeTasks) {
      unsubscribeTasks();
      unsubscribeTasks = null;
    }

    if (user) {
      loadTasksFromFirestore();
    } else {
      loadTasksFromStorage();
    }
  });
}

window.toggleMenu = function () {
  if (menuDropdown) {
    menuDropdown.classList.toggle("hidden");
  }
};

window.closeMenu = function () {
  if (menuDropdown) {
    menuDropdown.classList.add("hidden");
  }
};

window.signIn = async function () {
  window.closeMenu();
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    showToast("Signed in successfully.");
  } catch (error) {
    console.error(error);
    showToast("Login failed.", "error");
  }
};

window.signOutUser = async function () {
  window.closeMenu();
  try {
    await signOut(auth);
    showToast("Signed out successfully.");
  } catch (error) {
    console.error(error);
    showToast("Unable to sign out.", "error");
  }
};

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/\"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCaseName(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeTask(task, id) {
  return {
    id,
    text: task.text || "Untitled task",
    assignedTo: task.assignedTo || "Unassigned",
    createdBy: task.createdBy || "System",
    completed: Boolean(task.completed),
    status: task.status || (task.completed ? "Completed" : "Open"),
    priority: task.priority || "Medium",
    dueDate: task.dueDate || "",
    dueTime: task.dueTime || "",
    labels: Array.isArray(task.labels) ? task.labels : [],
    checklist: Array.isArray(task.checklist)
      ? task.checklist.map((item) => ({ text: item.text || "", done: Boolean(item.done) }))
      : [],
    comments: Array.isArray(task.comments)
      ? task.comments
      : Array.isArray(task.updates)
        ? task.updates.map((entry) => ({
            user: entry.user || "System",
            message: entry.message || "",
            timestamp: entry.timestamp || new Date().toISOString()
          }))
        : [],
    attachments: Array.isArray(task.attachments) ? task.attachments : [],
    history: Array.isArray(task.history) ? task.history : [],
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
  };
}

function getStorageTasks() {
  try {
    const saved = localStorage.getItem(TASK_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveTasksToStorage() {
  localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
}

function loadTasksFromStorage() {
  tasks = getStorageTasks().map((task, index) => normalizeTask(task, task.id || `local-${index}`));
  renderEverything();
}

function loadTasksFromFirestore() {
  showLoading(true);
  unsubscribeTasks = onSnapshot(collection(db, "tasks"), (snapshot) => {
    tasks = snapshot.docs.map((docSnap) => normalizeTask(docSnap.data(), docSnap.id));
    saveTasksToStorage();
    renderEverything();
    showLoading(false);
  }, (error) => {
    console.error(error);
    showLoading(false);
    showToast("Could not sync with Firestore.", "error");
    loadTasksFromStorage();
  });
}

function savePeople() {
  localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people));
}

function loadPeopleFromStorage() {
  try {
    const saved = localStorage.getItem(PEOPLE_STORAGE_KEY);
    people = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(people)) {
      people = [];
    }
  } catch (error) {
    console.error(error);
    people = [];
  }

  renderPeopleList();
  updateAssignmentSuggestions();
}

function persistPreferences() {
  const payload = {
    darkMode: document.body.classList.contains("dark"),
    search: state.search,
    statusFilter: state.statusFilter,
    priorityFilter: state.priorityFilter,
    sortMode: state.sortMode
  };
  localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(payload));
}

function loadPreferences() {
  try {
    const stored = localStorage.getItem(PREFERENCE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.darkMode) {
        document.body.classList.add("dark");
      }
      state.search = parsed.search || "";
      state.statusFilter = parsed.statusFilter || "All";
      state.priorityFilter = parsed.priorityFilter || "All";
      state.sortMode = parsed.sortMode || "latest";
      if (taskSearchInput) taskSearchInput.value = state.search;
      if (taskFilterSelect) taskFilterSelect.value = state.statusFilter;
      if (priorityFilterSelect) priorityFilterSelect.value = state.priorityFilter;
      if (sortSelect) sortSelect.value = state.sortMode;
    }
  } catch (error) {
    console.error(error);
  }

  if (darkModeToggle) {
    darkModeToggle.textContent = document.body.classList.contains("dark") ? "Light Mode" : "Dark Mode";
  }
}

function showNotification(title, message) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body: message });
  }
}

function showLoading(isVisible) {
  if (loadingOverlay) {
    loadingOverlay.classList.toggle("hidden", !isVisible);
  }
}

function showToast(message, variant = "success") {
  if (!toastRoot) return;
  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;
  toast.textContent = message;
  toastRoot.appendChild(toast);

  window.clearTimeout(toast.timeoutId);
  toast.timeoutId = window.setTimeout(() => {
    toast.remove();
  }, 2200);
}

function addPersonIfMissing(rawName) {
  const normalized = normalizeName(rawName);
  if (!normalized) {
    return "";
  }

  const existing = people.find((entry) => normalizeName(entry.name) === normalized);
  if (existing) {
    existing.lastAssignedAt = new Date().toISOString();
    savePeople();
    renderPeopleList();
    updateAssignmentSuggestions();
    return existing.name;
  }

  const titleName = titleCaseName(rawName);
  const newPerson = {
    id: crypto.randomUUID(),
    name: titleName,
    lastAssignedAt: new Date().toISOString()
  };

  people.push(newPerson);
  savePeople();
  renderPeopleList();
  updateAssignmentSuggestions();
  return titleName;
}

function setPeopleMessage(message, isError = false) {
  const messageBox = document.getElementById("people-status");
  if (!messageBox) return;
  messageBox.textContent = message;
  messageBox.className = `people-status ${isError ? "error" : "success"}`;
}

function renderPeopleList() {
  const list = document.getElementById("people-list");
  if (!list) return;

  const searchTerm = document.getElementById("people-search")?.value.trim().toLowerCase() || "";
  const filtered = people.filter((person) => normalizeName(person.name).includes(searchTerm));

  if (!filtered.length) {
    list.innerHTML = '<div class="people-empty">No people yet. Add one above.</div>';
    return;
  }

  list.innerHTML = filtered
    .map((person) => {
      const counts = getPersonStats(person.name);
      return `
        <div class="person-item">
          <div>
            <div class="person-name">${escapeAttribute(person.name)}</div>
            <div class="person-stats">${counts.total} total · ${counts.completed} done · ${counts.pending} pending</div>
          </div>
          <div class="person-actions">
            <button type="button" class="person-action edit" onclick="editPerson('${person.id}')">Edit</button>
            <button type="button" class="person-action delete" onclick="deletePerson('${person.id}')">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function getPersonStats(name) {
  const matching = tasks.filter((task) => task.assignedTo === name);
  return {
    total: matching.length,
    completed: matching.filter((task) => task.status === "Completed").length,
    pending: matching.filter((task) => task.status !== "Completed" && task.status !== "Cancelled").length
  };
}

function updateAssignmentSuggestions() {
  if (!assignedToInput || !peopleSuggestions) return;

  const query = assignedToInput.value.trim().toLowerCase();
  const peopleByRecency = [...people].sort((a, b) => (b.lastAssignedAt || "").localeCompare(a.lastAssignedAt || ""));
  const matches = peopleByRecency.filter((person) => normalizeName(person.name).includes(query));

  if (!query) {
    peopleSuggestions.innerHTML = "";
    peopleSuggestions.classList.add("hidden");
    return;
  }

  if (!matches.length) {
    peopleSuggestions.innerHTML = '<div class="suggestion-item muted">No matching person</div>';
    peopleSuggestions.classList.remove("hidden");
    suggestionIndex = -1;
    return;
  }

  peopleSuggestions.innerHTML = matches
    .map((person) => `
      <button type="button" class="suggestion-item" data-name="${escapeAttribute(person.name)}">
        <span class="suggestion-avatar">${escapeAttribute(person.name.charAt(0).toUpperCase())}</span>
        ${escapeAttribute(person.name)}
      </button>
    `)
    .join("");
  peopleSuggestions.classList.remove("hidden");
  suggestionIndex = -1;
}

function handleSuggestionKeyboard(event) {
  const items = Array.from(peopleSuggestions?.querySelectorAll("[data-name]") || []);
  if (!items.length) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    suggestionIndex = (suggestionIndex + 1) % items.length;
    highlightSuggestion(items, suggestionIndex);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    suggestionIndex = (suggestionIndex - 1 + items.length) % items.length;
    highlightSuggestion(items, suggestionIndex);
  } else if (event.key === "Enter" && suggestionIndex >= 0) {
    event.preventDefault();
    const selectedName = items[suggestionIndex].getAttribute("data-name");
    if (selectedName) {
      window.selectPersonSuggestion(selectedName);
    }
  } else if (event.key === "Escape") {
    if (peopleSuggestions) {
      peopleSuggestions.classList.add("hidden");
    }
  }
}

function highlightSuggestion(items, index) {
  items.forEach((item, itemIndex) => {
    item.classList.toggle("active", itemIndex === index);
  });
}

window.openPeopleManager = function () {
  window.closeMenu();
  const modal = document.getElementById("people-modal");
  if (modal) {
    modal.classList.remove("hidden");
  }

  editingPersonId = null;
  const nameInput = document.getElementById("person-name");
  if (nameInput) {
    nameInput.value = "";
    nameInput.focus();
  }

  loadPeopleFromStorage();
  setPeopleMessage("Add a person to make assignment suggestions quicker.");
};

window.closePeopleManager = function () {
  const modal = document.getElementById("people-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
  editingPersonId = null;
  const nameInput = document.getElementById("person-name");
  if (nameInput) {
    nameInput.value = "";
  }
  setPeopleMessage("");
};

window.resetPeopleForm = function () {
  editingPersonId = null;
  const nameInput = document.getElementById("person-name");
  if (nameInput) {
    nameInput.value = "";
  }
  setPeopleMessage("");
};

window.savePerson = function () {
  const nameInput = document.getElementById("person-name");
  const rawName = nameInput?.value || "";
  const personName = titleCaseName(rawName);

  if (!personName) {
    setPeopleMessage("Please enter a name.", true);
    return;
  }

  const duplicate = people.some(
    (person) => person.id !== editingPersonId && normalizeName(person.name) === normalizeName(personName)
  );

  if (duplicate) {
    setPeopleMessage("That person already exists.", true);
    return;
  }

  if (editingPersonId) {
    people = people.map((person) => (person.id === editingPersonId ? { ...person, name: personName } : person));
    setPeopleMessage(`${personName} updated successfully.`);
  } else {
    people.push({
      id: crypto.randomUUID(),
      name: personName,
      lastAssignedAt: new Date().toISOString()
    });
    setPeopleMessage(`${personName} added successfully.`);
  }

  savePeople();
  renderPeopleList();
  updateAssignmentSuggestions();
  if (nameInput) {
    nameInput.value = "";
  }
  editingPersonId = null;
};

window.editPerson = function (id) {
  const person = people.find((entry) => entry.id === id);
  if (!person) return;

  const nameInput = document.getElementById("person-name");
  if (nameInput) {
    nameInput.value = person.name;
    nameInput.focus();
  }

  editingPersonId = id;
  setPeopleMessage(`Editing ${person.name}.`);
};

window.deletePerson = function (id) {
  const person = people.find((entry) => entry.id === id);
  if (!person) return;

  people = people.filter((entry) => entry.id !== id);
  savePeople();
  renderPeopleList();
  updateAssignmentSuggestions();
  setPeopleMessage(`${person.name} deleted successfully.`);
  if (editingPersonId === id) {
    editingPersonId = null;
    const nameInput = document.getElementById("person-name");
    if (nameInput) {
      nameInput.value = "";
    }
  }
};

window.selectPersonSuggestion = function (name) {
  if (assignedToInput) {
    assignedToInput.value = name;
    assignedToInput.focus();
  }
  if (peopleSuggestions) {
    peopleSuggestions.innerHTML = "";
    peopleSuggestions.classList.add("hidden");
  }
};

function findSimilarTasks(text) {
  const normalized = normalizeName(text);
  return tasks.find((task) => normalizeName(task.text).includes(normalized) || normalized.includes(normalizeName(task.text)));
}

function getPriorityClass(priority) {
  switch (priority) {
    case "High":
      return "high";
    case "Low":
      return "low";
    default:
      return "medium";
  }
}

function getStatusClass(status) {
  switch (status) {
    case "Completed":
      return "completed";
    case "In Progress":
      return "in-progress";
    case "Blocked":
      return "blocked";
    case "Cancelled":
      return "cancelled";
    default:
      return "open";
  }
}

function getDueBadge(task) {
  if (!task.dueDate) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDate - today) / 86400000);

  if (task.status === "Completed" || task.status === "Cancelled") return "";
  if (diffDays < 0) return '<span class="badge overdue">Overdue</span>';
  if (diffDays === 0) return '<span class="badge due-today">Due Today</span>';
  if (diffDays === 1) return '<span class="badge due-tomorrow">Due Tomorrow</span>';
  return "";
}

function getFilteredTasks() {
  const searchText = state.search;
  return tasks
    .filter((task) => {
      const matchesSearch =
        !searchText ||
        task.text.toLowerCase().includes(searchText) ||
        task.assignedTo.toLowerCase().includes(searchText) ||
        task.status.toLowerCase().includes(searchText) ||
        task.priority.toLowerCase().includes(searchText) ||
        task.labels.some((label) => label.toLowerCase().includes(searchText));

      const matchesStatus = state.statusFilter === "All" || state.statusFilter === task.status || (state.statusFilter === "Pending" && task.status !== "Completed" && task.status !== "Cancelled") || (state.statusFilter === "Completed" && task.status === "Completed") || (state.statusFilter === "Overdue" && isOverdue(task)) || (state.statusFilter === "High Priority" && task.priority === "High") || (state.statusFilter === "Assigned to Me" && task.assignedTo === (currentUser?.displayName || ""));

      const matchesPriority = state.priorityFilter === "All" || task.priority === state.priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    })
    .sort((a, b) => {
      switch (state.sortMode) {
        case "oldest":
          return new Date(a.createdAt) - new Date(b.createdAt);
        case "dueDate":
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        case "priority":
          const priorityRank = { High: 0, Medium: 1, Low: 2 };
          return priorityRank[a.priority] - priorityRank[b.priority];
        case "status":
          return a.status.localeCompare(b.status);
        case "assignedPerson":
          return a.assignedTo.localeCompare(b.assignedTo);
        case "latest":
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });
}

function isOverdue(task) {
  if (!task.dueDate || task.status === "Completed" || task.status === "Cancelled") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function renderDashboard() {
  if (!dashboard) return;

  const pending = tasks.filter((task) => task.status !== "Completed" && task.status !== "Cancelled").length;
  const completed = tasks.filter((task) => task.status === "Completed").length;
  const overdue = tasks.filter((task) => isOverdue(task)).length;
  const highPriority = tasks.filter((task) => task.priority === "High").length;
  const completionPercent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  dashboard.innerHTML = `
    <div class="stat-card"><p class="number">${tasks.length}</p><p class="label">Total Tasks</p></div>
    <div class="stat-card"><p class="number">${pending}</p><p class="label">Pending Tasks</p></div>
    <div class="stat-card"><p class="number">${completed}</p><p class="label">Completed Tasks</p></div>
    <div class="stat-card"><p class="number">${overdue}</p><p class="label">Overdue Tasks</p></div>
    <div class="stat-card"><p class="number">${highPriority}</p><p class="label">High Priority</p></div>
    <div class="stat-card"><p class="number">${completionPercent}%</p><p class="label">Completion %</p></div>
  `;

  if (progressBar) {
    progressBar.style.width = `${completionPercent}%`;
  }
  if (completionLabel) {
    completionLabel.textContent = `${completionPercent}%`;
  }
  if (statusLegend) {
    const statusCounts = {
      Open: tasks.filter((task) => task.status === "Open").length,
      "In Progress": tasks.filter((task) => task.status === "In Progress").length,
      Blocked: tasks.filter((task) => task.status === "Blocked").length,
      Completed: tasks.filter((task) => task.status === "Completed").length,
      Cancelled: tasks.filter((task) => task.status === "Cancelled").length
    };
    statusLegend.innerHTML = Object.entries(statusCounts)
      .map(([label, value]) => `
        <div class="status-pill">
          <span class="status-dot ${getStatusClass(label)}"></span>
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `)
      .join("");
  }
  if (personCounts) {
    const personMap = {};
    tasks.forEach((task) => {
      const key = task.assignedTo || "Unassigned";
      personMap[key] = (personMap[key] || 0) + 1;
    });
    personCounts.innerHTML = Object.entries(personMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => `<div class="person-count-row"><span>${escapeAttribute(name)}</span><strong>${count}</strong></div>`)
      .join("");
  }
}

function renderTasks() {
  if (!taskList) return;

  const filteredTasks = getFilteredTasks();

  if (!filteredTasks.length) {
    taskList.innerHTML = '<div class="empty-state"><p>No tasks match the current filters.</p></div>';
    return;
  }

  taskList.innerHTML = filteredTasks
    .map((task) => {
      const dueBadge = getDueBadge(task);
      const labels = task.labels.length
        ? task.labels.map((label) => `<span class="label-pill" style="border-color:${getLabelColor(label)}; color:${getLabelColor(label)}">${escapeAttribute(label)}</span>`).join("")
        : "";
      const checklistMarkup = task.checklist.length
        ? task.checklist
            .map((item, index) => `
              <label class="checklist-item">
                <input type="checkbox" ${item.done ? "checked" : ""} onchange="toggleChecklistItem('${task.id}', ${index})" />
                <span class="checklist-text ${item.done ? "done" : ""}">${escapeAttribute(item.text)}</span>
              </label>
            `)
            .join("")
        : "";
      const commentsMarkup = task.comments.length
        ? task.comments
            .map((comment) => `
              <div class="comment-item">
                <div class="comment-meta"><strong>${escapeAttribute(comment.user)}</strong><span>${formatTimestamp(comment.timestamp)}</span></div>
                <div>${escapeAttribute(comment.message)}</div>
              </div>
            `)
            .join("")
        : '<div class="comment-empty">No comments yet.</div>';
      const attachmentsMarkup = task.attachments.length
        ? task.attachments
            .map((attachment) => {
              if (attachment.type?.startsWith("image/")) {
                return `<a class="attachment-item" href="${attachment.data}" target="_blank" rel="noreferrer"><img src="${attachment.data}" alt="Attachment preview" /></a>`;
              }
              return `<a class="attachment-item" href="${attachment.data}" target="_blank" rel="noreferrer">${escapeAttribute(attachment.name)}</a>`;
            })
            .join("")
        : "";
      const dueText = task.dueDate ? `${formatDate(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ""}` : "No due date";
      const statusOptions = ["Open", "In Progress", "Blocked", "Completed", "Cancelled"]
        .map((status) => `<option value="${status}" ${task.status === status ? "selected" : ""}>${status}</option>`)
        .join("");

      return `
        <div class="task-item ${isOverdue(task) ? "overdue" : ""} ${task.status === "Completed" ? "completed" : ""}">
          <button class="task-delete" onclick="deleteTask('${task.id}')" aria-label="Delete task">Delete</button>
          <div class="task-card-top">
            <div class="task-title">${escapeAttribute(task.text)}</div>
            <div class="task-badges">
              <span class="priority-badge ${getPriorityClass(task.priority)}">${escapeAttribute(task.priority)}</span>
              ${dueBadge}
              <span class="status-badge ${getStatusClass(task.status)}">${escapeAttribute(task.status)}</span>
            </div>
          </div>
          <div class="task-meta">
            <div><span>Assigned:</span> <strong>${escapeAttribute(task.assignedTo)}</strong></div>
            <div><span>Due:</span> <strong>${escapeAttribute(dueText)}</strong></div>
            <div><span>Created by:</span> <strong>${escapeAttribute(task.createdBy)}</strong></div>
          </div>
          <div class="task-labels">${labels}</div>
          <div class="task-action-row">
            <select class="status-select" onchange="updateTaskStatus('${task.id}', this.value)">${statusOptions}</select>
            <button class="task-toggle" onclick="toggleTask('${task.id}')">Advance</button>
          </div>
          <div class="task-section">
            <div class="section-title">Checklist</div>
            <div class="checklist-list">${checklistMarkup || '<div class="comment-empty">No checklist yet.</div>'}</div>
          </div>
          <div class="task-section">
            <div class="section-title">Comments</div>
            <div class="comment-list">${commentsMarkup}</div>
            <div class="comment-form">
              <input class="comment-input" id="comment-${task.id}" placeholder="Add a comment" />
              <button class="update-button" onclick="addComment('${task.id}')">Comment</button>
            </div>
          </div>
          <div class="task-section">
            <div class="section-title">Attachments</div>
            <div class="attachment-list">${attachmentsMarkup || '<div class="comment-empty">No attachments yet.</div>'}</div>
            <label class="file-label compact">
              Attach file
              <input type="file" onchange="handleAttachmentUpload('${task.id}', event)" accept="image/*,.pdf,.xlsx,.xls,.doc,.docx" />
            </label>
          </div>
          <div class="task-section">
            <div class="section-title">History</div>
            <div class="task-history">${task.history.length ? task.history.join("<br>") : "No activity yet"}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderEverything() {
  renderDashboard();
  renderPeopleList();
  renderTasks();
  renderActivityTimeline();
  renderCalendar();
}

function sortActivities(activities) {
  return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function renderActivityTimeline() {
  if (!activityTimeline) return;
  const activities = [];
  tasks.forEach((task) => {
    const base = new Date(task.updatedAt || task.createdAt || Date.now());
    activities.push({ text: `Task created: ${task.text}`, timestamp: task.createdAt || base.toISOString(), type: "created" });
    if (task.history?.length) {
      task.history.forEach((entry, index) => {
        activities.push({ text: entry, timestamp: task.updatedAt || task.createdAt || base.toISOString(), type: `history-${index}` });
      });
    }
    task.comments?.forEach((comment) => {
      activities.push({ text: `Comment added on ${task.text}: ${comment.message}`, timestamp: comment.timestamp || base.toISOString(), type: "comment" });
    });
  });

  const latest = sortActivities(activities).slice(0, ACTIVITY_LIMIT);
  activityTimeline.innerHTML = latest.length
    ? latest.map((entry) => `
      <div class="activity-item">
        <div class="activity-time">${formatTimestamp(entry.timestamp)}</div>
        <div>${escapeAttribute(entry.text)}</div>
      </div>
    `).join("")
    : '<div class="comment-empty">No activity yet.</div>';
}

function renderCalendar() {
  if (!calendarGrid || !calendarSummary) return;
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = [];
  dayNames.forEach((name) => cells.push(`<div class="calendar-head">${name}</div>`));

  for (let index = 0; index < startDay; index += 1) {
    cells.push('<div class="calendar-cell muted"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const hasTasks = tasks.some((task) => task.dueDate === dateKey);
    const isSelected = selectedCalendarDate === dateKey;
    cells.push(`
      <button type="button" class="calendar-cell ${hasTasks ? "has-task" : ""} ${isSelected ? "selected" : ""}" onclick="selectCalendarDate('${dateKey}')">
        <span>${day}</span>
      </button>
    `);
  }

  calendarGrid.innerHTML = cells.join("");
  selectedCalendarDate = selectedCalendarDate || `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  updateCalendarSummary();
}

function updateCalendarSummary() {
  if (!calendarSummary) return;
  const selectedTasks = tasks.filter((task) => task.dueDate === selectedCalendarDate);
  calendarSummary.innerHTML = selectedTasks.length
    ? selectedTasks.map((task) => `<div class="calendar-task">${escapeAttribute(task.text)}</div>`).join("")
    : '<div class="comment-empty">No tasks for this day.</div>';
}

window.selectCalendarDate = function (dateKey) {
  selectedCalendarDate = dateKey;
  renderCalendar();
};

function toggleAssistantPanel() {
  if (!aiPanel) return;
  aiPanel.classList.toggle("hidden");
  if (!aiPanel.classList.contains("hidden")) {
    renderAssistantContent();
  }
}

function renderAssistantContent() {
  const assistantOutput = document.getElementById("assistant-output");
  if (!assistantOutput) return;
  const pendingTasks = tasks.filter((task) => task.status !== "Completed" && task.status !== "Cancelled");
  const summary = pendingTasks.length
    ? `You have ${pendingTasks.length} active tasks. Focus on ${pendingTasks[0]?.text || "your next priority"}.`
    : "All tasks look wrapped up.";
  assistantOutput.innerHTML = `
    <div class="assistant-card">
      <strong>Summary</strong>
      <p>${escapeAttribute(summary)}</p>
    </div>
    <div class="assistant-card">
      <strong>Suggested priority</strong>
      <p>${escapeAttribute(pendingTasks.some((task) => task.priority === "High") ? "High priority work remains."
        : "Medium priority is a safe default for the next task.")}</p>
    </div>
  `;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return isNaN(date) ? value : date.toLocaleDateString();
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return isNaN(date) ? value : date.toLocaleString();
}

function getLabelColor(label) {
  return "#3454D1";
}

function saveTaskToStorage(task) {
  tasks = [task, ...tasks.filter((item) => item.id !== task.id)];
  saveTasksToStorage();
  renderEverything();
}

window.addTask = async function () {
  const textInput = document.getElementById("task-input");
  const assignedInput = document.getElementById("assigned-to");
  const priorityInput = document.getElementById("task-priority");
  const dueDateInput = document.getElementById("task-due-date");
  const dueTimeInput = document.getElementById("task-due-time");
  const labelsInput = document.getElementById("task-labels");
  const descriptionInput = document.getElementById("task-description");
  const checklistInput = document.getElementById("checklist-input");
  const attachmentsInput = document.getElementById("task-attachments");

  const text = textInput?.value.trim() || "";
  if (!text) {
    showToast("Please enter a task first.", "error");
    return;
  }

  const similar = findSimilarTasks(text);
  if (similar && !window.confirm("A similar task already exists. Continue anyway?")) {
    return;
  }

  const rawAssignedTo = assignedInput?.value || "";
  const assignedTo = rawAssignedTo ? addPersonIfMissing(rawAssignedTo) : "Unassigned";
  const labels = (labelsInput?.value || "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  const checklist = (checklistInput?.value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ text: item, done: false }));

  const attachments = [];
  if (attachmentsInput?.files?.length) {
    const filePromises = Array.from(attachmentsInput.files).map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
        reader.readAsDataURL(file);
      });
    });
    const fileResults = await Promise.all(filePromises);
    attachments.push(...fileResults);
  }

  const baseTask = {
    text,
    assignedTo,
    createdBy: currentUser?.displayName || "Guest",
    completed: false,
    status: "Open",
    priority: priorityInput?.value || "Medium",
    dueDate: dueDateInput?.value || "",
    dueTime: dueTimeInput?.value || "",
    labels,
    checklist,
    comments: [],
    attachments,
    history: [`${currentUser?.displayName || "Guest"} created task`],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (currentUser) {
    try {
      const docRef = await addDoc(collection(db, "tasks"), { ...baseTask, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      showToast("Task created successfully.");
      showNotification(NOTIFICATION_TITLE, `New task assigned: ${text}`);
      if (textInput) textInput.value = "";
      if (assignedInput) assignedInput.value = "";
      if (priorityInput) priorityInput.value = "Medium";
      if (dueDateInput) dueDateInput.value = "";
      if (dueTimeInput) dueTimeInput.value = "";
      if (labelsInput) labelsInput.value = "";
      if (descriptionInput) descriptionInput.value = "";
      if (checklistInput) checklistInput.value = "";
      if (attachmentsInput) attachmentsInput.value = "";
      return;
    } catch (error) {
      console.error(error);
      showToast("Unable to save task right now.", "error");
      return;
    }
  }

  const newTask = normalizeTask(baseTask, `local-${Date.now()}`);
  tasks = [newTask, ...tasks];
  saveTasksToStorage();
  renderEverything();
  showToast("Task created successfully.");
  if (textInput) textInput.value = "";
  if (assignedInput) assignedInput.value = "";
  if (priorityInput) priorityInput.value = "Medium";
  if (dueDateInput) dueDateInput.value = "";
  if (dueTimeInput) dueTimeInput.value = "";
  if (labelsInput) labelsInput.value = "";
  if (descriptionInput) descriptionInput.value = "";
  if (checklistInput) checklistInput.value = "";
  if (attachmentsInput) attachmentsInput.value = "";
};

window.toggleTask = async function (id) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  const nextStatus = task.status === "Completed" ? "Open" : task.status === "Open" ? "In Progress" : task.status === "In Progress" ? "Completed" : task.status === "Blocked" ? "In Progress" : "Completed";
  await updateTaskStatus(id, nextStatus);
};

window.updateTaskStatus = async function (id, nextStatus) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  const updatedTask = { ...task, status: nextStatus, completed: nextStatus === "Completed", updatedAt: new Date().toISOString() };
  updatedTask.history = [...(task.history || []), `${currentUser?.displayName || "Guest"} changed status to ${nextStatus}`];

  if (currentUser) {
    try {
      await updateDoc(doc(db, "tasks", id), {
        status: nextStatus,
        completed: nextStatus === "Completed",
        updatedAt: serverTimestamp(),
        history: arrayUnion(`${currentUser.displayName || "Guest"} changed status to ${nextStatus}`)
      });
      showToast(`Status updated to ${nextStatus}.`);
      showNotification(NOTIFICATION_TITLE, `Status updated to ${nextStatus}`);
      return;
    } catch (error) {
      console.error(error);
      showToast("Could not update status.", "error");
      return;
    }
  }

  tasks = tasks.map((entry) => (entry.id === id ? updatedTask : entry));
  saveTasksToStorage();
  renderEverything();
  showToast(`Status updated to ${nextStatus}.`);
};

window.deleteTask = function (id) {
  pendingDeleteId = id;
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.classList.remove("hidden");
  }
};

window.cancelDelete = function () {
  pendingDeleteId = null;
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
};

window.confirmDelete = async function () {
  if (!pendingDeleteId) return;
  const task = tasks.find((entry) => entry.id === pendingDeleteId);

  if (currentUser) {
    try {
      await deleteDoc(doc(db, "tasks", pendingDeleteId));
      showToast("Task deleted successfully.");
    } catch (error) {
      console.error(error);
      showToast("Could not delete task.", "error");
    }
  } else {
    tasks = tasks.filter((entry) => entry.id !== pendingDeleteId);
    saveTasksToStorage();
    renderEverything();
    showToast("Task deleted successfully.");
  }

  pendingDeleteId = null;
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
  if (task) {
    const history = [...(task.history || []), `${currentUser?.displayName || "Guest"} deleted task`];
    if (currentUser) {
      await updateDoc(doc(db, "tasks", pendingDeleteId), { history }).catch(() => {});
    }
  }
};

window.addComment = async function (id) {
  const input = document.getElementById(`comment-${id}`);
  const message = input?.value.trim();
  if (!message) {
    showToast("Please add a comment first.", "error");
    return;
  }

  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  const comment = {
    user: currentUser?.displayName || "Guest",
    message,
    timestamp: new Date().toISOString()
  };

  const updatedTask = {
    ...task,
    comments: [...task.comments, comment],
    history: [...task.history, `${comment.user} added a comment`],
    updatedAt: new Date().toISOString()
  };

  if (currentUser) {
    try {
      await updateDoc(doc(db, "tasks", id), {
        comments: arrayUnion(comment),
        history: arrayUnion(`${comment.user} added a comment`),
        updatedAt: serverTimestamp()
      });
      showToast("Comment added.");
      showNotification(NOTIFICATION_TITLE, `Comment added to ${task.text}`);
      input.value = "";
      return;
    } catch (error) {
      console.error(error);
      showToast("Unable to add comment.", "error");
      return;
    }
  }

  tasks = tasks.map((entry) => (entry.id === id ? updatedTask : entry));
  saveTasksToStorage();
  renderEverything();
  input.value = "";
  showToast("Comment added.");
};

window.addUpdate = function (id) {
  window.addComment(id);
};

window.toggleChecklistItem = async function (id, index) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  const updatedChecklist = task.checklist.map((item, itemIndex) => (itemIndex === index ? { ...item, done: !item.done } : item));
  const updatedTask = {
    ...task,
    checklist: updatedChecklist,
    updatedAt: new Date().toISOString()
  };

  if (currentUser) {
    try {
      await updateDoc(doc(db, "tasks", id), { checklist: updatedChecklist, updatedAt: serverTimestamp() });
      showToast("Checklist updated.");
      return;
    } catch (error) {
      console.error(error);
      showToast("Could not update checklist.", "error");
      return;
    }
  }

  tasks = tasks.map((item) => (item.id === id ? updatedTask : item));
  saveTasksToStorage();
  renderEverything();
  showToast("Checklist updated.");
};

window.handleAttachmentUpload = async function (id, event) {
  const files = event.target.files;
  if (!files?.length) return;
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  const fileResults = [];
  for (const file of Array.from(files)) {
    const result = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
      reader.readAsDataURL(file);
    });
    fileResults.push(result);
  }

  const updatedTask = { ...task, attachments: [...task.attachments, ...fileResults], updatedAt: new Date().toISOString() };
  if (currentUser) {
    try {
      await updateDoc(doc(db, "tasks", id), { attachments: [...task.attachments, ...fileResults], updatedAt: serverTimestamp() });
      showToast("Attachment added.");
      return;
    } catch (error) {
      console.error(error);
      showToast("Could not add attachment.", "error");
      return;
    }
  }

  tasks = tasks.map((item) => (item.id === id ? updatedTask : item));
  saveTasksToStorage();
  renderEverything();
  showToast("Attachment added.");
};

window.exportReports = function (format) {
  if (format === "csv") {
    const rows = ["Title,Assigned,Status,Priority,Due Date,Labels"];
    tasks.forEach((task) => rows.push(`"${task.text}","${task.assignedTo}","${task.status}","${task.priority}","${task.dueDate}","${task.labels.join("|")}"`));
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "task-report.csv";
    link.click();
    showToast("CSV report downloaded.");
  } else if (format === "pdf") {
    window.print();
    showToast("Print dialog opened for PDF export.");
  } else {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "task-report.json";
    link.click();
    showToast("Report downloaded.");
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
