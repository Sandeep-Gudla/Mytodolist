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

const taskList = document.getElementById("task-list");
const menuDropdown = document.getElementById("menu-dropdown");
const menuUser = document.getElementById("menu-user");
const menuSignIn = document.getElementById("menu-signin");
const menuSignOut = document.getElementById("menu-signout");
const assignedToInput = document.getElementById("assigned-to");
const peopleSuggestions = document.getElementById("people-suggestions");
const PEOPLE_STORAGE_KEY = "my-task-app-people";

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
  } catch (error) {
    console.error(error);
    alert("Login failed");
  }
};

window.signOutUser = async function () {
  window.closeMenu();
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
  }
};

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function titleCaseName(value) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

function addPersonIfMissing(rawName) {
  const normalized = normalizeName(rawName);
  if (!normalized) {
    return "";
  }

  const existing = people.find(
    (entry) => normalizeName(entry.name) === normalized
  );

  if (existing) {
    return existing.name;
  }

  const titleName = titleCaseName(rawName);
  const newPerson = {
    id: crypto.randomUUID(),
    name: titleName
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

function renderPeopleList() {
  const list = document.getElementById("people-list");
  if (!list) return;

  if (!people.length) {
    list.innerHTML = '<div class="people-empty">No people yet. Add one above.</div>';
    return;
  }

  list.innerHTML = people
    .map((person) => `
      <div class="person-item">
        <span>${escapeAttribute(person.name)}</span>
        <div class="person-actions">
          <button type="button" class="person-action edit" onclick="editPerson('${person.id}')">Edit</button>
          <button type="button" class="person-action delete" onclick="deletePerson('${person.id}')">Delete</button>
        </div>
      </div>
    `)
    .join("");
}

function updateAssignmentSuggestions() {
  if (!assignedToInput || !peopleSuggestions) return;

  const query = assignedToInput.value.trim().toLowerCase();

  if (!query) {
    peopleSuggestions.innerHTML = "";
    peopleSuggestions.classList.add("hidden");
    return;
  }

  const matches = people.filter((person) =>
    normalizeName(person.name).includes(query)
  );

  if (!matches.length) {
    peopleSuggestions.innerHTML = "";
    peopleSuggestions.classList.add("hidden");
    return;
  }

  peopleSuggestions.innerHTML = matches
    .map((person) => `
      <button type="button" class="suggestion-item" data-name="${escapeAttribute(person.name)}">
        ${escapeAttribute(person.name)}
      </button>
    `)
    .join("");
  peopleSuggestions.classList.remove("hidden");
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
    (person) =>
      person.id !== editingPersonId &&
      normalizeName(person.name) === normalizeName(personName)
  );

  if (duplicate) {
    setPeopleMessage("That person already exists.", true);
    return;
  }

  if (editingPersonId) {
    people = people.map((person) =>
      person.id === editingPersonId
        ? { ...person, name: personName }
        : person
    );
    setPeopleMessage(`${personName} updated successfully.`);
  } else {
    people.push({
      id: crypto.randomUUID(),
      name: personName
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

// Detect logged-in user
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    if (menuUser) {
      menuUser.textContent = user.displayName || "Signed in";
    }
    if (menuSignIn) {
      menuSignIn.classList.add("hidden");
    }
    if (menuSignOut) {
      menuSignOut.classList.remove("hidden");
    }
    loadTasks();
  } else {
    currentUser = null;
    if (menuUser) {
      menuUser.textContent = "Not signed in";
    }
    if (menuSignIn) {
      menuSignIn.classList.remove("hidden");
    }
    if (menuSignOut) {
      menuSignOut.classList.add("hidden");
    }
    taskList.innerHTML = "";
  }

  loadPeopleFromStorage();
});

// Add Task
window.addTask = async function () {
  if (!currentUser) {
    alert("Please login first");
    return;
  }

  const text = document.getElementById("task-input").value.trim();
  const rawAssignedTo = document.getElementById("assigned-to").value;
  const trimmedAssignedTo = rawAssignedTo.trim();

  if (!text) {
    alert("Please enter a task");
    return;
  }

  const assignedTo = trimmedAssignedTo
    ? addPersonIfMissing(trimmedAssignedTo)
    : "";

  try {
    await addDoc(collection(db, "tasks"), {
      text: text,
      assignedTo: assignedTo || "Unassigned",
      completed: false,
      createdBy: currentUser.displayName,
      createdAt: serverTimestamp(),
      updates: [],
      history: [`${currentUser.displayName} created task`]
    });

    document.getElementById("task-input").value = "";
    document.getElementById("assigned-to").value = "";
  } catch (error) {
    console.error(error);
  }
};

// Load Tasks (Real-time)
function loadTasks() {
  onSnapshot(collection(db, "tasks"), (snapshot) => {
    taskList.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const task = docSnap.data();
      const id = docSnap.id;

      const div = document.createElement("div");
      div.className = `task-item ${task.completed ? "completed" : ""}`;

      div.innerHTML = `
        <div class="task-card-top">
          <div class="task-title">${task.text}</div>
          <button class="task-delete" onclick="deleteTask('${id}')" aria-label="Delete task">
            🗑️
          </button>
        </div>

        <div class="task-meta">
          <div><span>Assigned:</span> <strong>${task.assignedTo}</strong></div>
          <div><span>Created by:</span> <strong>${task.createdBy}</strong></div>
        </div>

        <div class="task-actions">
          <button class="task-toggle" onclick="toggleTask('${id}', ${task.completed})">
            ${task.completed ? "Undo" : "Done"}
          </button>
        </div>

        <div class="update-row">
          <input class="update-input" id="update-${id}" placeholder="Add update" />
          <button class="update-button" onclick="addUpdate('${id}')">Update</button>
        </div>

        <div class="task-section">
          <div class="section-title">Updates</div>
          ${(task.updates || []).map(update => `
            <div class="update-item">
              <strong>${update.user}</strong>
              <span>${update.message}</span>
            </div>
          `).join("")}
        </div>

        <div class="task-section">
          <div class="section-title">History</div>
          <div class="task-history">
            ${(task.history || []).join("<br>")}
          </div>
        </div>
      `;

      taskList.appendChild(div);
    });
  });
}

// Mark Complete
window.toggleTask = async function (id, current) {
  if (!currentUser) return;

  try {
    await updateDoc(doc(db, "tasks", id), {
      completed: !current,
      history: arrayUnion(`${currentUser.displayName} changed task status`)
    });
  } catch (error) {
    console.error(error);
  }
};

// Delete Task
window.deleteTask = function (id) {
  if (!currentUser) return;

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
  if (!currentUser || !pendingDeleteId) return;

  try {
    await deleteDoc(doc(db, "tasks", pendingDeleteId));
  } catch (error) {
    console.error(error);
  } finally {
    pendingDeleteId = null;
    const modal = document.getElementById("confirm-modal");
    if (modal) {
      modal.classList.add("hidden");
    }
  }
};

// Add Update
window.addUpdate = async function (id) {
  if (!currentUser) return;

  const input = document.getElementById(`update-${id}`);
  const msg = input.value.trim();

  if (!msg) return;

  try {
    await updateDoc(doc(db, "tasks", id), {
      updates: arrayUnion({
        user: currentUser.displayName,
        message: msg,
        timestamp: new Date().toISOString()
      }),
      history: arrayUnion(`${currentUser.displayName} updated task: ${msg}`)
    });

    input.value = "";
  } catch (error) {
    console.error(error);
  }
};

if (assignedToInput) {
  assignedToInput.addEventListener("input", updateAssignmentSuggestions);
  assignedToInput.addEventListener("focus", updateAssignmentSuggestions);
  assignedToInput.addEventListener("blur", () => {
    setTimeout(() => {
      if (peopleSuggestions) {
        peopleSuggestions.classList.add("hidden");
      }
    }, 150);
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