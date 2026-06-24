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

const taskList = document.getElementById("task-list");
const menuDropdown = document.getElementById("menu-dropdown");
const menuUser = document.getElementById("menu-user");
const menuSignIn = document.getElementById("menu-signin");
const menuSignOut = document.getElementById("menu-signout");

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
});

// Add Task
window.addTask = async function () {

  if (!currentUser) {
    alert("Please login first");
    return;
  }

  const text =
    document.getElementById("task-input").value.trim();

  const assignedTo =
    document.getElementById("assigned-to").value.trim();

  if (!text) {
    alert("Please enter a task");
    return;
  }

  try {

    await addDoc(collection(db, "tasks"), {

      text: text,

      assignedTo: assignedTo || "Unassigned",

      completed: false,

      createdBy: currentUser.displayName,

      createdAt: serverTimestamp(),

      updates: [],

      history: [
        `${currentUser.displayName} created task`
      ]

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

      div.className =
        `task-item ${task.completed ? "completed" : ""}`;

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

      history: arrayUnion(
        `${currentUser.displayName} changed task status`
      )

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

  const input =
    document.getElementById(`update-${id}`);

  const msg = input.value.trim();

  if (!msg) return;

  try {

    await updateDoc(doc(db, "tasks", id), {

      updates: arrayUnion({

        user: currentUser.displayName,

        message: msg,

        timestamp: new Date().toISOString()

      }),

      history: arrayUnion(
        `${currentUser.displayName} updated task: ${msg}`
      )

    });

    input.value = "";

  } catch (error) {
    console.error(error);
  }
};