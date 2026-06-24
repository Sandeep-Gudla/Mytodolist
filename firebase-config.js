import { initializeApp }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { getAuth }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { getFirestore }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAOGUqj2aksk_esRovpg8TzwqtfZSC8Ae8",
  authDomain: "task-manager-84c3d.firebaseapp.com",
  projectId: "task-manager-84c3d",
  storageBucket: "task-manager-84c3d.firebasestorage.app",
  messagingSenderId: "155388137187",
  appId: "1:155388137187:web:fa41aca99c1ce805c13fd6",
  measurementId: "G-TL9B0HS7CH"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);