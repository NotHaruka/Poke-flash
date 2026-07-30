import '../src/index.css';
import '../src/styles/global.css';
import { initStorage } from '../src/storage.ts';
import { init } from '../src/init.ts';
import { initFirebaseSync } from '../src/firebase-sync.ts';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initStorage();
    init();
    initFirebaseSync();
  } catch (err) {
    console.error('Failed to initialize FlashTrainer:', err);
  }
});
