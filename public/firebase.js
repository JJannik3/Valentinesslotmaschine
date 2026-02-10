import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getDatabase, ref, get, set, update } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCP8GWqUQUxEZsvcHwRWDwLiOAfg88iGrQ",
  authDomain: "valentinesmaschine.firebaseapp.com",
  databaseURL: "https://valentinesmaschine-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "valentinesmaschine",
  storageBucket: "valentinesmaschine.firebasestorage.app",
  messagingSenderId: "268556828498",
  appId: "1:268556828498:web:72f363567a54c501fdc48b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export async function getOrCreateUser() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          await signInAnonymously(auth);
          return;
        }
        resolve(user);
      } catch (e) {
        reject(e);
      }
    });
  });
}

function gameRef(uid) {
  return ref(db, `games/${uid}`);
}

export async function loadGame(uid) {
  const snap = await get(gameRef(uid));
  return snap.exists() ? snap.val() : null;
}

export async function saveGame(uid, data) {
  await set(gameRef(uid), { ...data, updatedAt: Date.now() });
}

export async function patchGame(uid, partial) {
  await update(gameRef(uid), { ...partial, updatedAt: Date.now() });
}

