import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  signInAnonymously, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, onValue, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-database.js';

const config = window.FFB_FIREBASE_CONFIG || window.firebaseConfig || {};
let app;
let auth;
let db;

export function isFirebaseConfigured() {
  return Boolean(config.apiKey && config.authDomain && config.databaseURL && config.projectId && config.appId && !String(config.apiKey).includes('YOUR_'));
}

export function initializeFirebase() {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured yet. Edit public/js/firebase-config.js using your Firebase web app settings.');
  app = getApps().length ? getApps()[0] : initializeApp(config);
  auth = getAuth(app);
  db = getDatabase(app);
  return { app, auth, db };
}

export function getAuthInstance() { return auth; }
export function getDatabaseInstance() { return db; }
export const authState = callback => onAuthStateChanged(auth, callback);
export const hostSignIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const hostSignInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const participantSignIn = () => signInAnonymously(auth);
export const signOutUser = () => signOut(auth);

export async function readQuestionBank(uid) {
  const snapshot = await get(ref(db, `questionBank/${uid}/sets`));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function writeQuestionBank(uid, sets) {
  await set(ref(db, `questionBank/${uid}/sets`), sets);
  await set(ref(db, `questionBank/${uid}/updatedAt`), serverTimestamp());
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => chars[byte % chars.length]).join('');
}

export async function createRoom(roomId, hostUid) {
  const root = `rooms/${roomId}`;
  await set(ref(db, `${root}/meta`), {
    hostUid,
    status: 'active',
    createdAt: serverTimestamp()
  });
  await set(ref(db, `${root}/hostState`), {
    setId: null,
    questionIndex: null,
    revealedIndexes: []
  });
  await set(ref(db, `${root}/publicDisplay`), {
    visible: false,
    setId: null,
    setName: null,
    questionNumber: null,
    question: null,
    answerCount: 10,
    answers: [],
    updatedAt: Date.now()
  });
}

export async function closeRoom(roomId) {
  await update(ref(db, `rooms/${roomId}/meta`), { status: 'closed', closedAt: serverTimestamp() });
  await set(ref(db, `rooms/${roomId}/publicDisplay`), {
    visible: false, setId: null, setName: null, questionNumber: null,
    question: null, answerCount: 10, answers: [], updatedAt: Date.now(), closed: true
  });
}

export async function getRoomMeta(roomId) {
  const snapshot = await get(ref(db, `rooms/${roomId}/meta`));
  return snapshot.exists() ? snapshot.val() : null;
}

export function watchRoomDisplay(roomId, callback, onError) {
  return onValue(ref(db, `rooms/${roomId}/publicDisplay`), snapshot => callback(snapshot.exists() ? snapshot.val() : null), onError);
}
export function watchRoomMeta(roomId, callback, onError) {
  return onValue(ref(db, `rooms/${roomId}/meta`), snapshot => callback(snapshot.exists() ? snapshot.val() : null), onError);
}
export async function writeRoomState(roomId, hostState, publicDisplay) {
  await Promise.all([
    set(ref(db, `rooms/${roomId}/hostState`), hostState),
    set(ref(db, `rooms/${roomId}/publicDisplay`), publicDisplay)
  ]);
}
export async function writePublicDisplay(roomId, publicDisplay) {
  await set(ref(db, `rooms/${roomId}/publicDisplay`), publicDisplay);
}

export async function joinRoom(roomId) {
  const user = auth.currentUser;

  if (!user || !user.isAnonymous) {
    throw new Error("Participant authentication required.");
  }

  const meta = await getRoomMeta(roomId);

  if (!meta || meta.status !== "active") {
    throw new Error("This game room is unavailable.");
  }

  await set(
    ref(db, `rooms/${roomId}/participants/${user.uid}`),
    {
      joinedAt: serverTimestamp()
    }
  );

  return meta;
}
