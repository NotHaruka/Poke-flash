import { toast } from './utils.js';



import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import config from '../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
  measurementId: config.measurementId
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID if available
const db = getFirestore(app, config.firestoreDatabaseId || '(default)');

const auth = getAuth(app);

export enum OperationType {
  GET = 'GET',
  LIST = 'LIST',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  WRITE = 'WRITE'
}

function handleFirestoreError(err: any, op: OperationType, path: string): void {
  console.error(`[Firebase Firestore Error] Operation ${op} failed on path: ${path}`, err);
  toast(`Sync Error: ${err.message || err}`);
}


// ─── ES module exports (auto-generated) ───
export { app, auth, db, firebaseConfig, handleFirestoreError };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { handleFirestoreError });
