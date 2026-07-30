import { renderCardsList } from './deck-manager.js';
import { app, auth, db, handleFirestoreError, OperationType } from './firebase.js';
import { S } from './main.js';
import { renderSidebar, updateStats } from './sidebar.js';
import { persist } from './storage.js';
import { notes, renderNoteTabs, renderStudy, setNotes } from './study.js';
import { toast, uid } from './utils.js';



import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  writeBatch, 
  deleteDoc, 
  getDoc,
  runTransaction,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';

// Required emails for login (configured via .env.local VITE_ALLOWED_EMAIL)
const ALLOWED_EMAILS = (import.meta.env.VITE_ALLOWED_EMAIL || "")
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

console.log("[Firebase Auth] Initialized. Allowed developer emails:", ALLOWED_EMAILS);

// Active unsubscribe functions for cleanup
let unsubscribeDecks: (() => void) | null = null;
let unsubscribeNotes: (() => void) | null = null;
let unsubscribeUser: (() => void) | null = null;
const cardSubscriptions = new Map<string, () => void>();

export interface Review {
  quality: number;
  reviewedAt: number;
  deviceId: string;
}

export interface DerivedCardState {
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: Date | null;
  mistakes: number;
}

/**
 * Pure and deterministic SM-2 algorithm replayer.
 * Replays all review documents for a card to produce current state.
 */
function computeCardState(reviews: Review[], cardCreatedAt: number): DerivedCardState {
  let easeFactor = 2.5;
  let interval = 1;
  let repetitions = 0;
  let mistakes = 0;
  let lastReviewedAt = cardCreatedAt || Date.now();

  // Ensure absolute determinism by sorting chronologically
  const sortedReviews = [...reviews].sort((a, b) => a.reviewedAt - b.reviewedAt);

  for (const review of sortedReviews) {
    const q = review.quality; // q is 0, 1, 2, or 3

    // SM-2 easiness factor update (matching srs.ts)
    const newEf = Math.max(1.3, easeFactor + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02)));
    easeFactor = Math.round(newEf * 100) / 100;

    if (q === 0) {
      // Again — reset interval and increment mistakes count
      interval = 1;
      repetitions = 0;
      mistakes++;
    } else if (q === 1) {
      // Hard — small increase, ease factor decreases
      interval = Math.max(1, Math.round(interval * 1.2));
      repetitions = 0;
    } else if (q === 2) {
      // Good — normal SM-2
      interval = interval <= 1 ? 3 : Math.round(interval * easeFactor);
      repetitions++;
    } else { // q === 3 (Easy)
      // Easy — big jump, ease factor increases and gets easy boost
      interval = Math.round(interval * easeFactor * 1.3);
      easeFactor = Math.min(3.0, easeFactor + 0.15);
      repetitions++;
    }
    interval = interval || 1;
    lastReviewedAt = review.reviewedAt;
  }

  let nextReviewDate: Date | null = cardCreatedAt ? new Date(cardCreatedAt) : null;
  if (sortedReviews.length > 0) {
    const lastReviewedDate = new Date(lastReviewedAt);
    lastReviewedDate.setHours(23, 59, 59, 999);
    nextReviewDate = new Date(lastReviewedDate.getTime() + (interval - 1) * 24 * 60 * 60 * 1000);
  }

  return {
    interval,
    easeFactor,
    repetitions,
    nextReviewDate,
    mistakes
  };
}

/**
 * Generates an appropriate device ID for the current client, persisted in localStorage.
 */
function getDeviceId(): string {
  let id = localStorage.getItem('ftp_device_id');
  if (!id) {
    id = 'device_' + uid();
    localStorage.setItem('ftp_device_id', id);
  }
  return id;
}

/**
 * Formats a local card object for Firestore Card schema compliance (size == 4 required keys: front, back, createdAt, updatedAt)
 * along with our updated schema optional fields (tags, difficulty, srsState).
 */
function formatCardForFirestore(card: any) {
  return {
    front: (typeof card.q === 'string' ? card.q : (card.front || '')).substring(0, 5000),
    back: (typeof card.a === 'string' ? card.a : (card.back || '')).substring(0, 5000),
    createdAt: typeof card.createdAt === 'number' ? Math.round(card.createdAt) : (Math.round(Number(card.createdAt)) || Date.now()),
    updatedAt: Date.now(),
    tags: Array.isArray(card.tags) ? card.tags : [],
    difficulty: typeof card.difficulty === 'string' ? card.difficulty : 'none',
    srsState: {
      interval: (typeof card.interval === 'number' && !isNaN(card.interval)) ? Math.max(1, Math.round(card.interval)) : 1,
      easeFactor: (typeof card.ease === 'number' && !isNaN(card.ease)) ? card.ease : 2.5,
      repetitions: (typeof card.repetitions === 'number' && !isNaN(card.repetitions)) ? Math.max(0, Math.round(card.repetitions)) : 0,
      nextReviewDate: (typeof card.due === 'number' && !isNaN(card.due)) ? Math.round(card.due) : Date.now(),
      mistakes: (typeof card.mistakes === 'number' && !isNaN(card.mistakes)) ? Math.max(0, Math.round(card.mistakes)) : 0
    }
  };
}

/**
 * Initializes the Firebase Sync engine.
 */
function initFirebaseSync(): void {
  injectAuthStyles();
  
  // Wire up the logout function to the global window object
  (window as any).firebaseLogout = async () => {
    toast("Logging out...");
    try {
      await signOut(auth);
      toast("✓ Logged out!");
    } catch (err: any) {
      toast("Error logging out: " + err.message);
    }
  };

  (window as any).leaveGuestMode = () => {
    localStorage.removeItem('guest_mode');
    showAuthOverlay();
    updateSyncStatusUI(false, "Offline");
    updateAccountUI(null);
    toast("Guest mode closed. Please sign in.");
  };

  onAuthStateChanged(auth, async (user) => {
    console.log("[Firebase Auth] Auth state changed. User:", user ? { email: user.email, emailVerified: user.emailVerified, uid: user.uid } : null);
    if (user) {
      const userEmail = user.email ? user.email.toLowerCase() : "";
      console.log("[Firebase Auth] Checking access for:", userEmail, "Allowed:", ALLOWED_EMAILS);
      if (!userEmail || !ALLOWED_EMAILS.includes(userEmail)) {
        console.warn("[Firebase Auth] Access denied. Email is not in allowed developer list.");
        await signOut(auth);
        showAuthOverlay(`
          <div style="font-weight: 600; margin-bottom: 6px; color: #FF8B8B; font-size: 14px;">🚫 Access Denied</div>
          <p style="margin: 0 0 10px 0; font-size: 11px; color: #E2E2E2; line-height: 1.4;">
            Your authenticated email is <strong>${userEmail}</strong>, which is not authorized to access this developer applet.
          </p>
          <div style="background: #121220; padding: 10px; border-radius: 6px; font-size: 11px; text-align: left; color: #A0A0C0; line-height: 1.5; border: 1px solid #2D2D44;">
            <strong>Authorized Emails:</strong><br>
            ${ALLOWED_EMAILS.map(email => `• ${email}`).join('<br>')}
          </div>
        `);
        updateAccountUI(null);
        return;
      }

      // User authenticated! Hide login overlay
      localStorage.removeItem('guest_mode');
      hideAuthOverlay();
      updateSyncStatusUI(true, "Sync Active");
      updateAccountUI(user);
      
      try {
        console.log("[Firebase Auth] Starting local data check and migration...");
        await checkAndMigrateLocalData(user.uid);
        console.log("[Firebase Auth] Starting real-time sync...");
        startRealtimeSync(user.uid);
      } catch (err: any) {
        console.error("Migration/Sync initialization error: ", err);
        const errDetails = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
        toast(`Initialization error: ${err.message || err}`);
        console.error("[Firebase Auth] Detailed error trace:", errDetails);
        updateSyncStatusUI(false, "Sync Error");
      }
    } else {
      const isGuest = localStorage.getItem('guest_mode') === 'true';
      if (isGuest) {
        hideAuthOverlay();
        updateSyncStatusUI(false, "Guest Mode");
        stopRealtimeSync();
        updateAccountUI(null);
      } else {
        showAuthOverlay();
        updateSyncStatusUI(false, "Offline");
        stopRealtimeSync();
        updateAccountUI(null);
      }
    }
  });
}

/**
 * Updates the sidebar Account UI with the current authenticated user's details.
 */
function updateAccountUI(user: any): void {
  const accountSec = document.getElementById('sidebar-account-section');
  const accountAvatar = document.getElementById('account-avatar');
  const accountEmail = document.getElementById('account-email');
  const logoutBtn = document.getElementById('btn-sidebar-logout');
  
  if (user && user.email) {
    if (accountSec) {
      accountSec.classList.remove('hidden');
    }
    if (accountAvatar) {
      accountAvatar.textContent = user.email.charAt(0).toUpperCase();
      accountAvatar.style.background = 'var(--accent)';
      accountAvatar.style.color = '#000';
    }
    if (accountEmail) {
      accountEmail.textContent = user.email;
      accountEmail.title = user.email;
    }
    if (logoutBtn) {
      logoutBtn.textContent = 'Log out';
      logoutBtn.style.color = 'var(--red)';
      logoutBtn.style.borderColor = 'var(--border)';
      logoutBtn.onmouseover = () => {
        logoutBtn.style.background = 'var(--red-dim)';
        logoutBtn.style.borderColor = 'var(--red)';
      };
      logoutBtn.onmouseout = () => {
        logoutBtn.style.background = 'none';
        logoutBtn.style.borderColor = 'var(--border)';
      };
      logoutBtn.onclick = () => { (window as any).firebaseLogout?.(); };
    }
  } else {
    const isGuest = localStorage.getItem('guest_mode') === 'true';
    if (isGuest) {
      if (accountSec) {
        accountSec.classList.remove('hidden');
      }
      if (accountAvatar) {
        accountAvatar.textContent = 'G';
        accountAvatar.style.background = '#e2e8f0';
        accountAvatar.style.color = '#1e293b';
      }
      if (accountEmail) {
        accountEmail.textContent = 'Guest Mode (Local)';
        accountEmail.title = 'You are currently studying offline in guest mode';
      }
      if (logoutBtn) {
        logoutBtn.textContent = 'Sign In';
        logoutBtn.style.color = 'var(--accent)';
        logoutBtn.style.borderColor = 'var(--accent-dim)';
        logoutBtn.onmouseover = () => {
          logoutBtn.style.background = 'var(--accent-dim)';
          logoutBtn.style.borderColor = 'var(--accent)';
        };
        logoutBtn.onmouseout = () => {
          logoutBtn.style.background = 'none';
          logoutBtn.style.borderColor = 'var(--accent-dim)';
        };
        logoutBtn.onclick = () => { (window as any).leaveGuestMode?.(); };
      }
    } else {
      if (accountSec) {
        accountSec.classList.add('hidden');
      }
    }
  }
}

function inspectDeckPayload(deckDocRef: any, deckPayload: any) {
  console.log("========== DECK PAYLOAD ==========");
  console.log("Document Path:", deckDocRef.path);
  console.log("Document ID:", deckDocRef.id);
  console.log(JSON.stringify(deckPayload, null, 2));

  console.log("========== FIELD TYPES ==========");
  for (const [key, value] of Object.entries(deckPayload)) {
    console.log(`${key}:`, value, "| typeof:", typeof value);
  }

  console.log("createdAt integer:", Number.isInteger(deckPayload.createdAt));
  console.log("updatedAt integer:", Number.isInteger(deckPayload.updatedAt));
  console.log("ownerId equals current user:", deckPayload.ownerId === auth.currentUser?.uid);

  if ("folderId" in deckPayload) {
    console.log("folderId:", deckPayload.folderId);
    console.log("folderId typeof:", typeof deckPayload.folderId);
  }

  console.log("========== VALIDATION RULES FOR isValidDeck ==========");

  // 1. Keys check: hasAll(['name', 'description', 'createdAt', 'updatedAt', 'ownerId'])
  const requiredKeys = ['name', 'description', 'createdAt', 'updatedAt', 'ownerId'];
  const actualKeys = Object.keys(deckPayload);
  const hasAllRequired = requiredKeys.every(k => actualKeys.includes(k));
  console.log("Validation rule: keys hasAll(['name', 'description', 'createdAt', 'updatedAt', 'ownerId'])");
  console.log("  Expected: true");
  console.log("  Actual:", hasAllRequired);
  console.log("  RESULT:", hasAllRequired ? "PASS" : "FAIL");

  // 2. name is string
  const nameIsString = typeof deckPayload.name === 'string';
  console.log("Validation rule: name is string");
  console.log("  Expected: string");
  console.log("  Actual:", typeof deckPayload.name);
  console.log("  RESULT:", nameIsString ? "PASS" : "FAIL");

  // 3. name size <= 200
  const nameSizePass = nameIsString && deckPayload.name.length <= 200;
  console.log("Validation rule: name.size() <= 200");
  console.log("  Expected: length <= 200");
  console.log("  Actual:", nameIsString ? deckPayload.name.length : "N/A");
  console.log("  RESULT:", nameSizePass ? "PASS" : "FAIL");

  // 4. description is string
  const descIsString = typeof deckPayload.description === 'string';
  console.log("Validation rule: description is string");
  console.log("  Expected: string");
  console.log("  Actual:", typeof deckPayload.description);
  console.log("  RESULT:", descIsString ? "PASS" : "FAIL");

  // 5. description size <= 2000
  const descSizePass = descIsString && deckPayload.description.length <= 2000;
  console.log("Validation rule: description.size() <= 2000");
  console.log("  Expected: length <= 2000");
  console.log("  Actual:", descIsString ? deckPayload.description.length : "N/A");
  console.log("  RESULT:", descSizePass ? "PASS" : "FAIL");

  // 6. ownerId == request.auth.uid
  const currentUid = auth.currentUser?.uid;
  const ownerIdMatches = deckPayload.ownerId === currentUid;
  console.log("Validation rule: ownerId == request.auth.uid");
  console.log("  Expected:", currentUid);
  console.log("  Actual:", deckPayload.ownerId);
  console.log("  RESULT:", ownerIdMatches ? "PASS" : "FAIL");

  // 7. createdAt is int
  const createdAtIsInt = Number.isInteger(deckPayload.createdAt);
  console.log("Validation rule: createdAt is int");
  console.log("  Expected: integer");
  console.log("  Actual value:", deckPayload.createdAt, "| Type:", typeof deckPayload.createdAt);
  console.log("  RESULT:", createdAtIsInt ? "PASS" : "FAIL");

  // 8. updatedAt is int
  const updatedAtIsInt = Number.isInteger(deckPayload.updatedAt);
  console.log("Validation rule: updatedAt is int");
  console.log("  Expected: integer");
  console.log("  Actual value:", deckPayload.updatedAt, "| Type:", typeof deckPayload.updatedAt);
  console.log("  RESULT:", updatedAtIsInt ? "PASS" : "FAIL");

  // 9. folderId check: (!data.keys().contains('folderId') || data.folderId is string || data.folderId == null)
  const hasFolderId = 'folderId' in deckPayload;
  const folderIdValid = !hasFolderId || typeof deckPayload.folderId === 'string' || deckPayload.folderId === null;
  console.log("Validation rule: (!data.keys().contains('folderId') || data.folderId is string || data.folderId == null)");
  console.log("  Expected: true");
  console.log("  Actual:", folderIdValid, hasFolderId ? `(folderId value: ${deckPayload.folderId}, type: ${typeof deckPayload.folderId})` : "(no folderId present)");
  console.log("  RESULT:", folderIdValid ? "PASS" : "FAIL");

  console.log("========== HIDDEN RUNTIME PROBLEMS INSPECTION ==========");
  for (const [k, v] of Object.entries(deckPayload)) {
    if (v === undefined) {
      console.warn(`Problem found: Property "${k}" is undefined`);
    }
    if (v === null) {
      console.log(`Property "${k}" is null`);
    }
    if (typeof v === 'number' && isNaN(v)) {
      console.warn(`Problem found: Property "${k}" is NaN`);
    }
    if (typeof v === 'number' && !isFinite(v)) {
      console.warn(`Problem found: Property "${k}" is Infinity or -Infinity`);
    }
    if (v instanceof Date) {
      console.warn(`Problem found: Property "${k}" is a Date object (should be serializable/int)`);
    }
    if (typeof v === 'object' && v !== null && 'seconds' in v && 'nanoseconds' in v) {
      console.warn(`Problem found: Property "${k}" resembles a Firestore Timestamp object`);
    }
    if (typeof v === 'number' && !Number.isInteger(v)) {
      console.warn(`Problem found: Property "${k}" is a floating-point number (value: ${v})`);
    }
    if (typeof v === 'symbol') {
      console.warn(`Problem found: Property "${k}" is a Symbol`);
    }
    if (typeof v === 'bigint') {
      console.warn(`Problem found: Property "${k}" is a BigInt`);
    }
  }

  // Inherited properties check
  const inheritedProps: string[] = [];
  for (const key in deckPayload) {
    if (!Object.prototype.hasOwnProperty.call(deckPayload, key)) {
      inheritedProps.push(key);
    }
  }
  if (inheritedProps.length > 0) {
    console.warn("Problem found: Inherited properties detected:", inheritedProps);
  } else {
    console.log("No inherited properties detected on deckPayload.");
  }

  console.log("========== Object.keys() ==========");
  console.log(actualKeys);

  console.log("========== PATH VALIDITY CHECK ==========");
  const pathRegex = /^decks\/[^/]+$/;
  const isMatch = pathRegex.test(deckDocRef.path);
  console.log(`Document path matches "decks/{deckId}" pattern? ${isMatch ? "YES" : "NO"} (Path is "${deckDocRef.path}")`);
}

/**
 * Check if Firebase is empty for this user, and if so, upload current local storage state.
 */
async function checkAndMigrateLocalData(uid: string): Promise<void> {
  console.log("[Migration Debug] Querying decks where ownerId == ", uid);
  const decksRef = collection(db, 'decks');
  const q = query(decksRef, where('ownerId', '==', uid));
  let snap;
  try {
    snap = await getDocs(q);
    console.log("[Migration Debug] Decks query succeeded. Empty:", snap.empty);
  } catch (getDocsErr: any) {
    console.error("[Migration Debug] Decks query failed with error:", getDocsErr);
    throw getDocsErr;
  }

  if (snap.empty) {
    // Firebase database is empty for this user, perform one-time migration of local storage
    const deckKeys = Object.keys(S.decks);
    const noteKeys = Object.keys(notes);

    if (deckKeys.length > 0 || noteKeys.length > 0) {
      console.log("Migrating local storage to Firestore...");
      toast("Syncing existing data to cloud...");

      // 1. Upload User Global Metadata
      const userRef = doc(db, 'users', uid);
      const userPayload = {
        folders: typeof S.folders === 'object' && S.folders !== null && !Array.isArray(S.folders) ? S.folders : {},
        folderOrder: Array.isArray(S.folderOrder) ? S.folderOrder : [],
        deckOrder: Array.isArray(S.deckOrder) ? S.deckOrder : [],
        srsEnabled: S.srsEnabled !== false,
        apiUsage: (typeof S.apiUsage === 'object' && S.apiUsage !== null) ? S.apiUsage : null
      };
      
      try {
        console.log("Writing", userRef.path);
        await setDoc(userRef, userPayload);
        console.log("SUCCESS");
      } catch (e) {
        console.error("FAILED USER", e);
        throw e;
      }

      // 2. Upload Notes
      for (const noteId of noteKeys) {
        const localNote = notes[noteId];
        const noteDocRef = doc(db, 'notes', noteId);
        const notePayload = {
          title: typeof localNote.title === 'string' ? localNote.title : "",
          content: typeof localNote.content === 'string' ? localNote.content : "",
          updatedAt: typeof localNote.updatedAt === 'number' ? Math.round(localNote.updatedAt) : Date.now(),
          ownerId: uid,
          pin: !!(localNote.pin || localNote.pinned),
          color: typeof localNote.color === 'string' ? localNote.color : "default",
          tags: Array.isArray(localNote.tags) ? localNote.tags : []
        };
        try {
          console.log("Writing", noteDocRef.path);
          await setDoc(noteDocRef, notePayload);
          console.log("SUCCESS");
        } catch (e) {
          console.error("FAILED NOTE", e);
          throw e;
        }
      }

      // 3. Upload Decks & Cards
      for (const deckId of deckKeys) {
        const localDeck = S.decks[deckId];
        const deckDocRef = doc(db, 'decks', deckId);
        
        const deckPayload: any = {
          name: (typeof localDeck.name === 'string' ? localDeck.name : "Untitled").substring(0, 200),
          description: (typeof localDeck.description === 'string' ? localDeck.description : "").substring(0, 2000),
          ownerId: uid,
          createdAt: typeof localDeck.createdAt === 'number' ? Math.round(localDeck.createdAt) : Date.now(),
          updatedAt: Date.now()
        };
        if (typeof localDeck.folderId === 'string' && localDeck.folderId.trim() !== '') {
          deckPayload.folderId = localDeck.folderId;
        }
        
        try {
          console.log("Writing", deckDocRef.path);
          inspectDeckPayload(deckDocRef, deckPayload);
          await setDoc(deckDocRef, deckPayload);
          console.log("SUCCESS");
        } catch (e) {
          console.error("FAILED DECK", e);
          throw e;
        }

        const cards = localDeck.cards || [];
        for (const card of cards) {
          if (!card.id) card.id = 'c_' + uid + '_' + Math.random().toString(36).substring(2, 10);
          const cardDocRef = doc(db, 'decks', deckId, 'cards', card.id);
          const cardPayload = formatCardForFirestore(card);
          
          try {
            console.log("Writing", cardDocRef.path);
            await setDoc(cardDocRef, cardPayload);
            console.log("SUCCESS");
          } catch (e) {
            console.error("FAILED CARD", e);
            throw e;
          }
        }
      }

      console.log("[Migration Debug] Migration completed successfully using individual setDoc calls.");
      toast("Cloud Sync established!");
    }
  }
}

/**
 * Starts the dynamic real-time Firestore listeners.
 */
function startRealtimeSync(uid: string): void {
  stopRealtimeSync();

  // 1. Sync User metadata
  const userRef = doc(db, 'users', uid);
  unsubscribeUser = onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      let changed = false;

      if (data.folders && JSON.stringify(data.folders) !== JSON.stringify(S.folders)) {
        S.folders = data.folders;
        changed = true;
      }
      if (data.folderOrder && JSON.stringify(data.folderOrder) !== JSON.stringify(S.folderOrder)) {
        S.folderOrder = data.folderOrder;
        changed = true;
      }
      if (data.deckOrder && JSON.stringify(data.deckOrder) !== JSON.stringify(S.deckOrder)) {
        S.deckOrder = data.deckOrder;
        changed = true;
      }
      if (data.srsEnabled !== undefined && data.srsEnabled !== S.srsEnabled) {
        S.srsEnabled = data.srsEnabled;
        changed = true;
      }

      if (changed) {
        persistLocalAndRefresh();
      }
    }
  }, (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`));

  // 2. Sync Decks and Cards
  const decksRef = collection(db, 'decks');
  const decksQuery = query(decksRef, where('ownerId', '==', uid));
  
  unsubscribeDecks = onSnapshot(decksQuery, (snap) => {
    const serverDeckIds = new Set<string>();

    snap.docs.forEach((docSnap) => {
      const deckId = docSnap.id;
      const data = docSnap.data();
      serverDeckIds.add(deckId);

      if (!S.decks[deckId]) {
        S.decks[deckId] = { name: data.name, cards: [], ai: false, createdAt: data.createdAt };
        if (data.folderId) S.decks[deckId].folderId = data.folderId;
      } else {
        if (S.decks[deckId].name !== data.name) {
          S.decks[deckId].name = data.name;
        }
        if (data.folderId !== S.decks[deckId].folderId) {
          if (data.folderId) {
            S.decks[deckId].folderId = data.folderId;
          } else {
            delete S.decks[deckId].folderId;
          }
        }
      }

      // Initialize real-time sub-listener for cards in this deck
      if (!cardSubscriptions.has(deckId)) {
        const cardsQuery = collection(db, 'decks', deckId, 'cards');
        const unsubCards = onSnapshot(cardsQuery, (cardsSnap) => {
          const cards: any[] = [];
          
          cardsSnap.docs.forEach((cardDoc) => {
            const cardData = cardDoc.data();
            cards.push({
              id: cardDoc.id,
              q: cardData.front,
              a: cardData.back,
              createdAt: cardData.createdAt,
              updatedAt: cardData.updatedAt,
              tags: cardData.tags || [],
              difficulty: cardData.difficulty || 'none',
              ease: cardData.srsState?.easeFactor ?? 2.5,
              interval: cardData.srsState?.interval ?? 1,
              due: cardData.srsState?.nextReviewDate ?? Date.now(),
              mistakes: cardData.srsState?.mistakes ?? (cardData.srsState?.repetitions === 0 && cardData.srsState?.interval === 1 ? 1 : 0)
            });
          });

          // Sort chronologically by createdAt to maintain UI order
          cards.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          
          let changed = false;
          const currentCards = S.decks[deckId].cards || [];
          const localCardIds = new Set(currentCards.map((c: any) => c.id));
          
          // Merge server cards, update existing, or append new
          cards.forEach(serverCard => {
             const existingIdx = currentCards.findIndex((c: any) => c.id === serverCard.id);
             if (existingIdx >= 0) {
                 if (JSON.stringify(currentCards[existingIdx]) !== JSON.stringify(serverCard)) {
                     currentCards[existingIdx] = serverCard;
                     changed = true;
                 }
             } else {
                 currentCards.push(serverCard);
                 changed = true;
             }
          });
          
          if (changed) {
            S.decks[deckId].cards = currentCards;
            persistLocalAndRefresh();
          }
        }, (err) => handleFirestoreError(err, OperationType.LIST, `decks/${deckId}/cards`));
        
        cardSubscriptions.set(deckId, unsubCards);
      }
    });

    // Removed aggressive blind deletion that was wiping out offline-created local decks
    // Object.keys(S.decks).forEach((deckId) => {
    //   if (!serverDeckIds.has(deckId)) {
    //     delete S.decks[deckId];
    //     const unsub = cardSubscriptions.get(deckId);
    //     if (unsub) unsub();
    //     cardSubscriptions.delete(deckId);
    //   }
    // });

    persistLocalAndRefresh();
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'decks'));

  // 3. Sync Notes
  const notesRef = collection(db, 'notes');
  const notesQuery = query(notesRef, where('ownerId', '==', uid));

  unsubscribeNotes = onSnapshot(notesQuery, (snap) => {
    const serverNotes: any = {};
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      serverNotes[docSnap.id] = {
        title: data.title || "",
        content: data.content || "",
        updatedAt: data.updatedAt || Date.now(),
        pin: data.pin || false,
        color: data.color || "default",
        tags: data.tags || []
      };
    });

    // Merge server notes instead of replacing (prevents offline data wipe)
    let changed = false;
    Object.keys(serverNotes).forEach(noteId => {
      if (JSON.stringify(notes[noteId]) !== JSON.stringify(serverNotes[noteId])) {
        notes[noteId] = serverNotes[noteId];
        changed = true;
      }
    });
    
    if (changed) {
      setNotes(notes);
      persistLocalAndRefresh();
    }
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'notes'));
}

/**
 * Stops all real-time Firestore synchronization.
 */
function stopRealtimeSync(): void {
  if (unsubscribeDecks) unsubscribeDecks();
  if (unsubscribeNotes) unsubscribeNotes();
  if (unsubscribeUser) unsubscribeUser();
  cardSubscriptions.forEach(unsub => unsub());
  cardSubscriptions.clear();
}

/**
 * Persists updated state to localforage and triggers full app UI refresh.
 */
function persistLocalAndRefresh(): void {
  persist();
  (window as any).renderSidebar?.();
  (window as any).updateStats?.();
  (window as any).renderCardsList?.();
  (window as any).renderNoteTabs?.();
  (window as any).renderStudy?.();
}

/**
 * Sync helper functions invoked on local mutation events.
 */
async function syncCreateDeck(deckId: string, name: string, folderId?: string): Promise<void> {
  if (!auth.currentUser) return;
  const deckRef = doc(db, 'decks', deckId);
  const data: any = {
    name,
    description: "",
    ownerId: auth.currentUser.uid,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  if (folderId) data.folderId = folderId;
  await setDoc(deckRef, data).catch((err) => handleFirestoreError(err, OperationType.CREATE, `decks/${deckId}`));
  
  await syncUserMetadata();
}

async function syncMoveDeckToFolder(deckId: string, folderId: string | null): Promise<void> {
  if (!auth.currentUser) return;
  const deckRef = doc(db, 'decks', deckId);
  const data: any = { updatedAt: Date.now() };
  if (folderId) {
    data.folderId = folderId;
  } else {
    data.folderId = null;
  }
  await updateDoc(deckRef, data).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `decks/${deckId}`));
}

async function syncDeleteDeck(deckId: string): Promise<void> {
  if (!auth.currentUser) return;
  const deckRef = doc(db, 'decks', deckId);
  await deleteDoc(deckRef).catch((err) => handleFirestoreError(err, OperationType.DELETE, `decks/${deckId}`));
  
  await syncUserMetadata();
}

async function syncRenameDeck(deckId: string, name: string): Promise<void> {
  if (!auth.currentUser) return;
  const deckRef = doc(db, 'decks', deckId);
  await updateDoc(deckRef, {
    name,
    updatedAt: Date.now()
  }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `decks/${deckId}`));
}

async function syncAddCard(deckId: string, card: any): Promise<void> {
  if (!auth.currentUser) return;
  if (!card.id) card.id = 'c_' + uid();
  const cardRef = doc(db, 'decks', deckId, 'cards', card.id);
  await setDoc(cardRef, formatCardForFirestore(card))
    .catch((err) => handleFirestoreError(err, OperationType.CREATE, `decks/${deckId}/cards/${card.id}`));
}

async function syncUpdateCard(deckId: string, card: any): Promise<void> {
  if (!auth.currentUser) return;
  if (!card.id) return;
  const cardRef = doc(db, 'decks', deckId, 'cards', card.id);
  await setDoc(cardRef, formatCardForFirestore(card))
    .catch((err) => handleFirestoreError(err, OperationType.UPDATE, `decks/${deckId}/cards/${card.id}`));
}

async function syncDeleteCard(deckId: string, cardId: string): Promise<void> {
  if (!auth.currentUser) return;
  const cardRef = doc(db, 'decks', deckId, 'cards', cardId);
  await deleteDoc(cardRef).catch((err) => handleFirestoreError(err, OperationType.DELETE, `decks/${deckId}/cards/${cardId}`));
}

async function syncSaveNote(noteId: string, note: any): Promise<void> {
  if (!auth.currentUser) return;
  const noteRef = doc(db, 'notes', noteId);
  await setDoc(noteRef, {
    title: note.title || "",
    content: note.content || "",
    updatedAt: Date.now(),
    ownerId: auth.currentUser.uid,
    pin: note.pin || false,
    color: note.color || "default",
    tags: note.tags || []
  }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `notes/${noteId}`));
}

async function syncDeleteNote(noteId: string): Promise<void> {
  if (!auth.currentUser) return;
  const noteRef = doc(db, 'notes', noteId);
  await deleteDoc(noteRef).catch((err) => handleFirestoreError(err, OperationType.DELETE, `notes/${noteId}`));
}

async function syncUserMetadata(): Promise<void> {
  if (!auth.currentUser) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  await setDoc(userRef, {
    folders: S.folders || {},
    folderOrder: S.folderOrder || [],
    deckOrder: S.deckOrder || [],
    srsEnabled: S.srsEnabled !== false,
    apiUsage: S.apiUsage || null
  }).catch((err) => handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}`));
}

/**
 * Submits a new SRS review document to the append-only reviews subcollection,
 * then queries all reviews for the card, recomputes SM-2 state, and caches it
 * as denormalized srsState on the card document.
 */
async function submitReview(deckId: string, cardId: string, quality: number): Promise<void> {
  if (!auth.currentUser) return;

  const reviewsRef = collection(db, 'decks', deckId, 'cards', cardId, 'reviews');
  const reviewDoc = {
    quality: Math.min(5, Math.max(0, Math.floor(quality))),
    reviewedAt: Date.now(),
    deviceId: getDeviceId()
  };

  // 1. Add review in subcollection
  await addDoc(reviewsRef, reviewDoc)
    .catch((err) => handleFirestoreError(err, OperationType.CREATE, `decks/${deckId}/cards/${cardId}/reviews`));

  // 2. Fetch all reviews for this card to perform replay
  const snap = await getDocs(reviewsRef)
    .catch((err) => handleFirestoreError(err, OperationType.LIST, `decks/${deckId}/cards/${cardId}/reviews`));

  const allReviews: Review[] = [];
  if (snap) {
    snap.forEach(docSnap => {
      const data = docSnap.data();
      allReviews.push({
        quality: data.quality,
        reviewedAt: data.reviewedAt,
        deviceId: data.deviceId
      });
    });
  }

  // 3. Get original card creation timestamp
  const cardDocRef = doc(db, 'decks', deckId, 'cards', cardId);
  const cardSnap = await getDoc(cardDocRef)
    .catch((err) => handleFirestoreError(err, OperationType.GET, `decks/${deckId}/cards/${cardId}`));

  const createdAt = (cardSnap && cardSnap.exists()) ? (cardSnap.data().createdAt || Date.now()) : Date.now();

  // 4. Replay state
  const derived = computeCardState(allReviews, createdAt);

  // 5. Update parent card denormalized fields
  await updateDoc(cardDocRef, {
    srsState: {
      interval: derived.interval,
      easeFactor: derived.easeFactor,
      repetitions: derived.repetitions,
      nextReviewDate: derived.nextReviewDate ? derived.nextReviewDate.getTime() : Date.now(),
      mistakes: derived.mistakes
    },
    updatedAt: Date.now()
  }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `decks/${deckId}/cards/${cardId}`));
}

async function syncUndoLastReview(deckId: string, cardId: string): Promise<void> {
  if (!auth.currentUser) return;
  const reviewsRef = collection(db, 'decks', deckId, 'cards', cardId, 'reviews');
  // find the most recent review
  const q = query(reviewsRef, orderBy('reviewedAt', 'desc'), limit(1));
  const snap = await getDocs(q).catch((err) => handleFirestoreError(err, OperationType.LIST, `decks/${deckId}/cards/${cardId}/reviews`));
  if (snap && !snap.empty) {
    const docRef = doc(db, 'decks', deckId, 'cards', cardId, 'reviews', snap.docs[0].id);
    await deleteDoc(docRef).catch((err) => handleFirestoreError(err, OperationType.DELETE, `decks/${deckId}/cards/${cardId}/reviews/${snap.docs[0].id}`));
  }
  
  // Re-fetch all reviews to replay state accurately after deletion
  const snapAll = await getDocs(reviewsRef).catch((err) => handleFirestoreError(err, OperationType.LIST, `decks/${deckId}/cards/${cardId}/reviews`));
  const allReviews: Review[] = [];
  if (snapAll) {
    snapAll.forEach(docSnap => {
      if (snap && !snap.empty && docSnap.id === snap.docs[0].id) return; // double check exclusion
      const data = docSnap.data();
      allReviews.push({
        quality: data.quality,
        reviewedAt: data.reviewedAt,
        deviceId: data.deviceId
      });
    });
  }

  // Get original card creation timestamp
  const cardDocRef = doc(db, 'decks', deckId, 'cards', cardId);
  const cardSnap = await getDoc(cardDocRef).catch((err) => handleFirestoreError(err, OperationType.GET, `decks/${deckId}/cards/${cardId}`));
  const createdAt = (cardSnap && cardSnap.exists()) ? (cardSnap.data().createdAt || Date.now()) : Date.now();

  // Replay state
  const derived = computeCardState(allReviews, createdAt);

  // Update parent card denormalized fields
  await updateDoc(cardDocRef, {
    srsState: {
      interval: derived.interval,
      easeFactor: derived.easeFactor,
      repetitions: derived.repetitions,
      nextReviewDate: derived.nextReviewDate ? derived.nextReviewDate.getTime() : Date.now(),
      mistakes: derived.mistakes
    },
    updatedAt: Date.now()
  }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `decks/${deckId}/cards/${cardId}`));
}

async function syncAddCardsBatch(deckId: string, cards: any[]): Promise<void> {
  if (!auth.currentUser) return;
  const batchLimit = 400;
  let currentBatch = writeBatch(db);
  let opCount = 0;
  const commits: Promise<void>[] = [];

  for (const card of cards) {
    if (!card.id) card.id = 'c_' + uid();
    const cardDocRef = doc(db, 'decks', deckId, 'cards', card.id);
    currentBatch.set(cardDocRef, formatCardForFirestore(card));
    opCount++;

    if (opCount >= batchLimit) {
      commits.push(currentBatch.commit().catch(e => console.error("FAILED BATCH COMMIT", e)));
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    commits.push(currentBatch.commit().catch(e => console.error("FAILED BATCH COMMIT", e)));
  }

  // We await Promise.allSettled here so the function signature remains Promise<void>
  // But if offline, this will hang until online. That's fine because all batches are queued!
  await Promise.allSettled(commits);
}

async function forceSyncLocalToCloud(): Promise<void> {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const deckKeys = Object.keys(S.decks);
  const noteKeys = Object.keys(notes);

  console.log("Forcing local storage sync to Firestore...");
  toast("Syncing restored data to cloud...");

  // 1. Upload User Global Metadata
  const userRef = doc(db, 'users', uid);
  const userPayload = {
    folders: S.folders || {},
    folderOrder: S.folderOrder || [],
    deckOrder: S.deckOrder || [],
    srsEnabled: S.srsEnabled !== false,
    apiUsage: S.apiUsage || null
  };
  try {
    console.log("Writing", userRef.path);
    await setDoc(userRef, userPayload);
    console.log("SUCCESS");
  } catch (e) {
    console.error("FAILED USER", e);
    throw e;
  }

  // 2. Upload Decks & Cards
  for (const deckId of deckKeys) {
    const localDeck = S.decks[deckId];
    const deckDocRef = doc(db, 'decks', deckId);
    
    const deckPayload: any = {
      name: localDeck.name,
      description: localDeck.description || "",
      ownerId: uid,
      createdAt: localDeck.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    if (localDeck.folderId) deckPayload.folderId = localDeck.folderId;
    
    try {
      console.log("Writing", deckDocRef.path);
      inspectDeckPayload(deckDocRef, deckPayload);
      await setDoc(deckDocRef, deckPayload);
      console.log("SUCCESS");
    } catch (e) {
      console.error("FAILED DECK", e);
      throw e;
    }

    // Upload cards in subcollection
    const cards = localDeck.cards || [];
    for (const card of cards) {
      if (!card.id) card.id = 'c_' + uid + '_' + Math.random().toString(36).substring(2, 10);
      const cardDocRef = doc(db, 'decks', deckId, 'cards', card.id);
      const cardPayload = formatCardForFirestore(card);
      
      try {
        console.log("Writing", cardDocRef.path);
        await setDoc(cardDocRef, cardPayload);
        console.log("SUCCESS");
      } catch (e) {
        console.error("FAILED CARD", e);
        throw e;
      }
    }
  }

  // 3. Upload Notes
  for (const noteId of noteKeys) {
    const localNote = notes[noteId];
    const noteDocRef = doc(db, 'notes', noteId);
    const notePayload = {
      title: localNote.title || "",
      content: localNote.content || "",
      updatedAt: localNote.updatedAt || Date.now(),
      ownerId: uid,
      pin: localNote.pin || false,
      color: localNote.color || "default",
      tags: localNote.tags || []
    };
    
    try {
      console.log("Writing", noteDocRef.path);
      await setDoc(noteDocRef, notePayload);
      console.log("SUCCESS");
    } catch (e) {
      console.error("FAILED NOTE", e);
      throw e;
    }
  }

  console.log("Force sync complete!");
  toast("Cloud sync updated!");
}

/**
 * Fetches cards due today or earlier in a deck using denormalized indices.
 */
async function getCardsDueToday(deckId: string): Promise<any[]> {
  const cardsRef = collection(db, 'decks', deckId, 'cards');
  const tonight = new Date();
  tonight.setHours(23, 59, 59, 999);
  
  // Query cards directly by nextReviewDate <= midnight tonight
  const q = query(cardsRef, where('srsState.nextReviewDate', '<=', tonight.getTime()));
  const snap = await getDocs(q)
    .catch((err) => handleFirestoreError(err, OperationType.LIST, `decks/${deckId}/cards`));

  const dueCards: any[] = [];
  if (snap) {
    snap.forEach(docSnap => {
      dueCards.push({ id: docSnap.id, ...docSnap.data() });
    });
  }
  return dueCards;
}

/**
 * Sync UI updates.
 */
function updateSyncStatusUI(active: boolean, text: string) {
  const dot = document.getElementById('offline-dot');
  const txt = document.getElementById('offline-status-txt');
  if (dot) {
    dot.className = active ? 'offline-dot' : 'offline-dot partial';
    if (active) {
      dot.style.background = 'var(--accent)';
    } else {
      dot.style.background = 'var(--text3)';
    }
  }
  if (txt) {
    txt.textContent = text;
  }
}

function formatFriendlyAuthError(errorText: string | null): string {
  if (!errorText) return "";
  
  const currentDomain = window.location.hostname;
  const projectId = auth.app.options.projectId || "flashtrainer";
  
  if (errorText.includes("auth/operation-not-allowed")) {
    return `
      <div style="font-weight: 600; margin-bottom: 6px; color: #FF8B8B; font-size: 13px;">🔒 Email Provider Disabled</div>
      <p style="margin: 0 0 10px 0; font-size: 11px; color: #E2E2E2; line-height: 1.4;">Email/Password registration is disabled in your Firebase Console. To enable it:</p>
      <ol style="margin: 0; padding-left: 18px; font-size: 11px; text-align: left; color: #A0A0C0; line-height: 1.5;">
        <li>Go to <a href="https://console.firebase.google.com/project/${projectId}/authentication/providers" target="_blank" style="color: #a8ff78; text-decoration: underline; font-weight: bold;">Firebase Console → Authentication → Providers</a></li>
        <li>Click <strong>Add new provider</strong> and select <strong>Email/Password</strong>.</li>
        <li>Toggle <strong>Enable</strong> and click <strong>Save</strong>.</li>
      </ol>
    `;
  }
  
  if (errorText.includes("auth/unauthorized-domain")) {
    return `
      <div style="font-weight: 600; margin-bottom: 6px; color: #FF8B8B; font-size: 13px;">🌐 Unauthorized Domain</div>
      <p style="margin: 0 0 10px 0; font-size: 11px; color: #E2E2E2; line-height: 1.4;">Firebase authentication is not yet configured to trust this web domain. To authorize it:</p>
      <ol style="margin: 0; padding-left: 18px; font-size: 11px; text-align: left; color: #A0A0C0; line-height: 1.5;">
        <li>Go to <a href="https://console.firebase.google.com/project/${projectId}/authentication/settings" target="_blank" style="color: #a8ff78; text-decoration: underline; font-weight: bold;">Firebase Console → Authentication → Settings</a></li>
        <li>Select the <strong>Authorized domains</strong> tab.</li>
        <li>Click <strong>Add domain</strong> and enter:<br><code style="background: #121220; padding: 2px 6px; border-radius: 4px; color: #fff; font-family: monospace; font-size: 10px; display: inline-block;">${currentDomain}</code></li>
      </ol>
    `;
  }
  
  return `<div style="word-break: break-all;">${errorText}</div>`;
}

/**
 * Creates and displays the Auth/Lock overlay.
 */
function showAuthOverlay(errorText: string | null = null, verificationOnly: boolean = false): void {
  let overlay = document.getElementById('firebase-auth-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'firebase-auth-overlay';
    overlay.className = 'firebase-auth-overlay-style';
    overlay.innerHTML = `
      <div class="auth-card">
        <h2>🔐 FlashTrainer Sync</h2>
        <p class="auth-subtitle">Enter credentials to synchronize across all your devices.</p>
        
        <div id="auth-error-msg" class="auth-error" style="display:none"></div>
        
        <div id="auth-fields">
          <div class="auth-input-group">
            <label>Email Address</label>
            <input type="email" id="auth-email" placeholder="e.g. ${ALLOWED_EMAILS[0] || 'email@gmail.com'}" value="${ALLOWED_EMAILS[0] || ''}">
            <div style="font-size:11px;color:var(--text3);margin-top:4px">App locked to authorized developer emails.</div>
          </div>
          
          <div class="auth-input-group">
            <label>Password</label>
            <input type="password" id="auth-password" placeholder="••••••••">
          </div>
          
          <div class="auth-actions">
            <button id="btn-auth-login" class="auth-btn primary">Log In</button>
            <button id="btn-auth-register" class="auth-btn secondary">Register</button>
          </div>
          
          <div style="margin-top: 15px; border-top: 1px solid var(--border, #3f3f46); padding-top: 15px; text-align: center;">
            <p style="font-size: 11px; color: var(--text3, #a1a1aa); margin-bottom: 8px;">Or sign in seamlessly with Google:</p>
            <button id="btn-auth-google" class="auth-btn" style="width:100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: #ffffff; color: #1f2937; border: 1px solid #e5e7eb;">
              <svg width="18" height="18" viewBox="0 0 18 18" style="flex-shrink:0;"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.798 5.956-2.18l-2.908-2.259c-.784.53-1.783.84-3.048.84-2.34 0-4.329-1.58-5.037-3.708H.957v2.332C2.438 17.02 5.482 18 9 18z" fill="#34A853"/><path d="M3.992 10.694c-.138-.53-.216-1.084-.216-1.694 0-.61.078-1.164.216-1.694V4.674H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.026l3.035-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438.98.957 2.674l3.035 2.332c.708-2.128 2.697-3.426 5.008-3.426z" fill="#EA4335"/></svg>
              Sign In with Google
            </button>
            <button id="btn-auth-guest" class="auth-btn secondary" style="width:100%; margin-top: 8px;">Continue as Guest (Local Only)</button>
          </div>
        </div>
		
        <div id="verification-notice" class="verification-notice-style" style="display:none">
          <p>📧 <strong>Verification Required:</strong> We've sent a verification email to your inbox. Please check your spam folder too.</p>
          <div class="auth-actions" style="margin-top:14px">
            <button id="btn-auth-verify-done" class="auth-btn primary">I've verified my email</button>
            <button id="btn-auth-resend-email" class="auth-btn secondary">Resend Email</button>
          </div>
          <button id="btn-auth-back-to-login" class="auth-btn secondary" style="width:100%;margin-top:10px">← Back to Log In</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    wireAuthEvents();
  }

  const errEl = document.getElementById('auth-error-msg');
  if (errEl) {
    if (errorText) {
      errEl.innerHTML = formatFriendlyAuthError(errorText);
      errEl.style.display = 'block';
    } else {
      errEl.style.display = 'none';
    }
  }

  const fields = document.getElementById('auth-fields');
  const verifyNotice = document.getElementById('verification-notice');
  if (fields && verifyNotice) {
    if (verificationOnly) {
      fields.style.display = 'none';
      verifyNotice.style.display = 'block';
    } else {
      fields.style.display = 'block';
      verifyNotice.style.display = 'none';
    }
  }
}

function hideAuthOverlay(): void {
  const overlay = document.getElementById('firebase-auth-overlay');
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Event handlers for Auth modal.
 */
function wireAuthEvents(): void {
  const btnLogin = document.getElementById('btn-auth-login');
  const btnRegister = document.getElementById('btn-auth-register');
  const btnVerifyDone = document.getElementById('btn-auth-verify-done');
  const btnResend = document.getElementById('btn-auth-resend-email');
  const btnBack = document.getElementById('btn-auth-back-to-login');
  const btnGoogle = document.getElementById('btn-auth-google');
  const btnGuest = document.getElementById('btn-auth-guest');

  btnGuest?.addEventListener('click', () => {
    localStorage.setItem('guest_mode', 'true');
    hideAuthOverlay();
    updateSyncStatusUI(false, "Guest Mode");
    updateAccountUI(null);
    toast("Playing as Guest. Data will only be saved locally.");
  });

  btnGoogle?.addEventListener('click', async () => {
    toast("Opening Google Sign-In...");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      showAuthOverlay(err.message);
    }
  });

  btnLogin?.addEventListener('click', async () => {
    const email = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('auth-password') as HTMLInputElement).value;
    if (!email || !password) {
      showAuthOverlay("Please fill in both email and password.");
      return;
    }
    toast("Logging in...");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast("✓ Logged in!");
    } catch (err: any) {
      showAuthOverlay(err.message);
    }
  });

  btnRegister?.addEventListener('click', async () => {
    const email = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('auth-password') as HTMLInputElement).value;
    if (!email || !password) {
      showAuthOverlay("Please fill in both email and password.");
      return;
    }
    if (password.length < 6) {
      showAuthOverlay("Password should be at least 6 characters.");
      return;
    }
    toast("Registering account...");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      toast("✓ Account registered and logged in!");
    } catch (err: any) {
      showAuthOverlay(err.message);
    }
  });

  btnVerifyDone?.addEventListener('click', async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        hideAuthOverlay();
        toast("✓ Sync active!");
        try {
          await checkAndMigrateLocalData(auth.currentUser.uid);
          startRealtimeSync(auth.currentUser.uid);
        } catch (err) {
          console.error(err);
        }
      } else {
        toast("❌ Email not verified yet. Please check your inbox!");
      }
    }
  });

  btnResend?.addEventListener('click', async () => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        toast("✓ Verification email resent!");
      } catch (err: any) {
        toast("Error resending: " + err.message);
      }
    }
  });

  btnBack?.addEventListener('click', async () => {
    await signOut(auth);
    showAuthOverlay();
  });
}

/**
 * Dynamically injects style rules for the authentication overlay.
 */
function injectAuthStyles(): void {
  if (document.getElementById('firebase-auth-styles')) return;
  const style = document.createElement('style');
  style.id = 'firebase-auth-styles';
  style.textContent = `
    .firebase-auth-overlay-style {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(10, 10, 18, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: 'Inter', sans-serif;
      color: #E2E2E2;
    }
    .auth-card {
      background: #1C1C2E;
      border: 1px solid #2D2D44;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      animation: authFadeIn 0.3s ease-out;
    }
    @keyframes authFadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .auth-card h2 {
      font-family: 'Fraunces', serif;
      font-size: 24px;
      margin-bottom: 8px;
      color: #FFF;
      text-align: center;
    }
    .auth-subtitle {
      font-size: 13px;
      color: #A0A0C0;
      margin-bottom: 24px;
      text-align: center;
    }
    .auth-error {
      background: rgba(255, 107, 107, 0.1);
      border: 1px solid rgba(255, 107, 107, 0.3);
      color: #FF8B8B;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12px;
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .auth-input-group {
      margin-bottom: 18px;
    }
    .auth-input-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #A0A0C0;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .auth-input-group input {
      width: 100%;
      box-sizing: border-box;
      background: #121220;
      border: 1px solid #2D2D44;
      border-radius: 8px;
      color: #FFF;
      padding: 11px 14px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .auth-input-group input:focus {
      border-color: #a8ff78;
    }
    .auth-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .auth-btn {
      flex: 1;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      border: none;
      font-family: inherit;
      transition: all 0.2s;
    }
    .auth-btn.primary {
      background: #a8ff78;
      color: #0A1A06;
    }
    .auth-btn.primary:hover {
      opacity: 0.9;
    }
    .auth-btn.secondary {
      background: #2D2D44;
      color: #E2E2E2;
    }
    .auth-btn.secondary:hover {
      background: #3D3D5C;
    }
    .verification-notice-style {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #2D2D44;
      font-size: 13px;
      color: #E2E2E2;
    }
    .verification-notice-style p {
      margin-bottom: 14px;
      line-height: 1.6;
    }
  `;
  document.head.appendChild(style);
}


// ─── ES module exports (auto-generated) ───
export { ALLOWED_EMAILS, cardSubscriptions, checkAndMigrateLocalData, computeCardState, forceSyncLocalToCloud, formatCardForFirestore, formatFriendlyAuthError, getCardsDueToday, getDeviceId, hideAuthOverlay, initFirebaseSync, startRealtimeSync, stopRealtimeSync, submitReview, syncAddCard, syncAddCardsBatch, syncCreateDeck, syncDeleteCard, syncDeleteDeck, syncDeleteNote, syncMoveDeckToFolder, syncRenameDeck, syncSaveNote, syncUndoLastReview, syncUpdateCard, syncUserMetadata, updateAccountUI, updateSyncStatusUI };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { ALLOWED_EMAILS, cardSubscriptions, checkAndMigrateLocalData, computeCardState, forceSyncLocalToCloud, formatCardForFirestore, formatFriendlyAuthError, getCardsDueToday, getDeviceId, hideAuthOverlay, initFirebaseSync, startRealtimeSync, stopRealtimeSync, submitReview, syncAddCard, syncAddCardsBatch, syncCreateDeck, syncDeleteCard, syncDeleteDeck, syncDeleteNote, syncMoveDeckToFolder, syncRenameDeck, syncSaveNote, syncUndoLastReview, syncUpdateCard, syncUserMetadata, updateAccountUI, updateSyncStatusUI });
