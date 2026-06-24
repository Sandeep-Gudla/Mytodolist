import { auth, db } from "./firebase-config.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;

const taskList = document.getElementById("task-list");
const loginBtn = document.getElementById("login-btn");
const userName = document.getElementById("user-name");

// Login with Google
loginBtn.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    alert("Login failed");
  }
});

// Detect logged-in user
onAuthStateChanged(auth, (user) => {

  if (user) {

    currentUser = user;

    userName.textContent =
      `Logged in as ${user.displayName}`;

    loadTasks();
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

        <div style="width:100%">

          <strong>${task.text}</strong>

          <br><br>

          Assigned To:
          <b>${task.assignedTo}</b>

          <br>

          Created By:
          <b>${task.createdBy}</b>

          <br><br>

          <button onclick="toggleTask('${id}', ${task.completed})">
            ${task.completed ? "Undo" : "Done"}
          </button>

          <br><br>

          <input
            id="update-${id}"
            placeholder="Add update"
          />

          <button onclick="addUpdate('${id}')">
            Update
          </button>

          <hr>

          <h4>Updates</h4>

          ${(task.updates || []).map(update => `
            <div style="
              background:#f5f5f5;
              padding:6px;
              margin-bottom:5px;
              border-radius:5px;
            ">
              <b>${update.user}</b>:
              ${update.message}
            </div>
          `).join("")}

          <h4>History</h4>

          <small>
            ${(task.history || []).join("<br>")}
          </small>

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