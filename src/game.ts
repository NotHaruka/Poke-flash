import Phaser from 'phaser';
import { createGameConfig } from './core/Config.js';
import { GLADIATOR_CHARACTERS, WEAPON_PRESETS } from './core/Constants.js';
import { SceneManager } from './core/SceneManager.js';
import { EventBus } from './core/EventBus.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { SaveManager } from './managers/SaveManager.js';
import { AudioManager } from './managers/AudioManager.js';
import { Logger } from './utils/Logger.js';

// Global Phaser Game Instance Reference
let phaserGame: Phaser.Game | null = null;
let selectedGladiatorIndex: number = 0;
let selectedWeaponId: string = 'longsword';
let currentMenuStep: 'main' | 'character' | 'weapon' = 'main';
const logger = new Logger('GameBootstrap');

function setMenuStep(step: 'main' | 'character' | 'weapon'): void {
  currentMenuStep = step;
  logger.info(`Menu step changed to: ${step}`);
  renderMenuOverlay();
}

function selectWeaponClass(id: string): void {
  selectedWeaponId = id;
  logger.info(`Weapon selection changed to: ${id}`);
  renderMenuOverlay();
}

function renderMenuOverlay(): void {
  const overlay = document.getElementById('bb-menu-overlay');
  if (!overlay) return;

  if (currentMenuStep === 'main') {
    overlay.innerHTML = `
      <h1 style="font-family: 'Fraunces', serif; font-size: clamp(24px, 6vw, 38px); font-weight: 700; color: var(--text); margin-bottom: 6px; text-shadow: 0 0 15px rgba(var(--accent-rgb), 0.3);">Blade Bedlam</h1>
      <p style="color: var(--text3); font-size: clamp(11px, 3.5vw, 13px); max-width: 480px; margin-bottom: 20px; line-height: 1.5;">An intense gladiatorial action-adventure runner. Tap the left side of the screen to fly, and the right side (or Shift/X/Space) to execute sweeping blade slashes. Slay gargoyles, wyverns, and phoenices to survive!</p>
      
      <div id="bb-main-menu-actions" style="display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; margin-top: 16px;">
        <button class="btn btn-p" onclick="window.setMenuStep('character')" style="font-size: clamp(14px, 4vw, 16px); font-weight: 700; height: 44px; padding: 0 28px; border-radius: 22px; box-shadow: 0 0 20px rgba(var(--accent-rgb), 0.45); border-color: var(--accent); background: var(--accent); color: var(--bg); cursor: pointer;">
          ENTER THE COLOSSEUM
        </button>
      </div>
    `;
    const actions = document.getElementById('bb-main-menu-actions');
    if (actions && isDevelopmentBuild()) {
      const devBtn = document.createElement('button');
      devBtn.id = 'bb-dev-mode-btn';
      devBtn.className = 'btn';
      devBtn.onclick = () => (window as any).openDeveloperMenu();
      devBtn.style.fontSize = '13px';
      devBtn.style.fontWeight = '700';
      devBtn.style.height = '44px';
      devBtn.style.padding = '0 20px';
      devBtn.style.borderRadius = '22px';
      devBtn.style.borderColor = 'var(--accent)';
      devBtn.style.background = 'var(--accent-dim)';
      devBtn.style.color = 'var(--accent)';
      devBtn.style.boxShadow = '0 0 15px rgba(var(--accent-rgb), 0.15)';
      devBtn.style.cursor = 'pointer';
      devBtn.style.transition = 'all 0.15s';
      devBtn.onmouseenter = () => {
        devBtn.style.background = 'var(--accent-dim)';
        devBtn.style.boxShadow = '0 0 20px rgba(var(--accent-rgb), 0.35)';
      };
      devBtn.onmouseleave = () => {
        devBtn.style.background = 'var(--accent-dim)';
        devBtn.style.boxShadow = '0 0 15px rgba(var(--accent-rgb), 0.15)';
      };
      devBtn.innerHTML = 'DEVELOPER MODE';
      actions.appendChild(devBtn);
    }
  } else if (currentMenuStep === 'character') {
    overlay.innerHTML = `
      <h1 style="font-family: 'Fraunces', serif; font-size: clamp(22px, 5vw, 32px); font-weight: 700; color: var(--text); margin-bottom: 4px; text-shadow: 0 0 15px rgba(var(--accent-rgb), 0.3);">Select Gladiator</h1>
      <p style="color: var(--text3); font-size: clamp(11px, 3.2vw, 13px); max-width: 480px; margin-bottom: 16px;">Gladiators define your passive abilities, starting health, and movement speed.</p>
      
      <div id="bb-character-list" style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 720px; margin-bottom: 20px; width: 100%;">
        ${GLADIATOR_CHARACTERS.map((b, i) => {
          const isSelected = i === selectedGladiatorIndex;
          const border = isSelected ? 'var(--accent)' : 'var(--border)';
          const bg = isSelected ? 'var(--accent-dim)' : 'var(--surface2)';
          return `
            <div class="bb-char-card cursor-pointer" id="bb-card-${b.id}" onclick="window.selectGameBird(${i})"
                 style="border: 1.5px solid ${border}; background: ${bg}; border-radius: var(--rs); padding: 10px; transition: all 0.15s; flex: 1 1 min(100%, 140px); min-width: 130px; text-align: left;">
               <div style="font-weight: 700; font-size: 13px; color: ${isSelected ? 'var(--accent)' : 'var(--text)'}; margin-bottom: 2px;">${b.name}</div>
               <div style="font-size: 10px; color: var(--text2); line-height: 1.4; margin-bottom: 6px;">${b.desc}</div>
               <div style="font-size: 9.5px; font-weight: 600; color: var(--accent); background: var(--accent-dim); padding: 2px 6px; border-radius: 4px; display: inline-block;">
                 Ability: ${b.ability}
               </div>
            </div>
          `;
        }).join('')}
      </div>

      <div style="display: flex; gap: 10px; align-items: center; justify-content: center;">
        <button class="btn" onclick="window.setMenuStep('main')" style="font-size: 13px; font-weight: 700; height: 40px; padding: 0 20px; border-radius: 20px; cursor: pointer; background: var(--surface2); color: var(--text); border: 1px solid var(--border);">
          BACK
        </button>
        <button class="btn btn-p" onclick="window.setMenuStep('weapon')" style="font-size: 13px; font-weight: 700; height: 40px; padding: 0 24px; border-radius: 20px; cursor: pointer; border-color: var(--accent); background: var(--accent); color: var(--bg);">
          SELECT WEAPON
        </button>
      </div>
    `;
  } else if (currentMenuStep === 'weapon') {
    const activeWeapon = WEAPON_PRESETS.find(w => w.id === selectedWeaponId) || WEAPON_PRESETS[0];
    overlay.innerHTML = `
      <h1 style="font-family: 'Fraunces', serif; font-size: clamp(22px, 5vw, 32px); font-weight: 700; color: var(--text); margin-bottom: 4px; text-shadow: 0 0 15px rgba(var(--accent-rgb), 0.3);">Select Weapon</h1>
      <p style="color: var(--text3); font-size: clamp(11px, 3.2vw, 13px); max-width: 480px; margin-bottom: 16px;">Weapons define your swing speed, reach, physical damage, and special Weapon Art.</p>
      
      <div id="bb-weapon-list" style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; max-width: 720px; margin-bottom: 16px; width: 100%;">
        ${WEAPON_PRESETS.map((w) => {
          const isSelected = w.id === selectedWeaponId;
          const border = isSelected ? 'var(--accent)' : 'var(--border)';
          const bg = isSelected ? 'var(--accent-dim)' : 'var(--surface2)';
          return `
            <div class="bb-weapon-card cursor-pointer" id="bb-weapon-card-${w.id}" onclick="window.selectWeaponClass('${w.id}')"
                 style="border: 1.5px solid ${border}; background: ${bg}; border-radius: var(--rs); padding: 8px 12px; transition: all 0.15s; flex: 1 1 min(100%, 130px); min-width: 120px; text-align: left; display: flex; align-items: center; gap: 8px;">
               <div style="color: ${isSelected ? 'var(--accent)' : 'var(--text2)'};">${w.icon}</div>
               <div>
                 <div style="font-weight: 700; font-size: 12px; color: var(--text);">${w.name}</div>
                 <div style="font-size: 9.5px; color: var(--text3);">${w.weaponArt}</div>
               </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Selected Weapon Info Panel -->
      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--rs); padding: 12px 14px; max-width: 580px; width: 100%; margin-bottom: 16px; text-align: left; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
          <div style="font-family: 'Fraunces', serif; font-size: 15px; font-weight: 700; color: var(--accent); display: flex; align-items: center; gap: 6px;">
            <span>${activeWeapon.icon}</span>
            <span>${activeWeapon.name}</span>
          </div>
          <div style="font-size: 10px; font-weight: 600; color: var(--accent); background: var(--accent-dim); padding: 2px 6px; border-radius: 4px;">
            Art: ${activeWeapon.weaponArt}
          </div>
        </div>
        <div style="font-size: 11px; color: var(--text2); line-height: 1.4;">
          ${activeWeapon.desc}
        </div>
        <div style="display: flex; gap: 12px; margin-top: 2px; flex-wrap: wrap;">
          <div style="font-size: 10px; color: var(--text3);">
            <strong style="color: #fca5a5;">Base Damage:</strong> <span style="color: #ef4444; font-weight: 700;">${activeWeapon.baseDamage}</span>
          </div>
          <div style="font-size: 10px; color: var(--text3);">
            <strong style="color: #cbd5e1;">Weight:</strong> <span style="color: #94a3b8; font-weight: 700;">${activeWeapon.weight.toFixed(2)}</span>
          </div>
          <div style="font-size: 10px; color: var(--text3);">
            <strong style="color: #93c5fd;">Reach:</strong> <span style="color: #3b82f6; font-weight: 700;">${activeWeapon.reach}px</span>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 10px; align-items: center; justify-content: center;">
        <button class="btn" onclick="window.setMenuStep('character')" style="font-size: 13px; font-weight: 700; height: 40px; padding: 0 20px; border-radius: 20px; cursor: pointer;">
          BACK
        </button>
        <button class="btn btn-p" onclick="window.startGame()" style="font-size: 14px; font-weight: 700; height: 40px; padding: 0 24px; border-radius: 20px; cursor: pointer; border-color: #cda250; background: #cda250; color: #000; box-shadow: 0 0 15px rgba(205, 162, 80, 0.35);">
          ENTER THE ARENA
        </button>
      </div>
    `;
  }
}

/**
 * Initializes the game panel container, builds character choices inside the HTML,
 * and boots up the Phaser 3 canvas engine instance.
 */
function initGame(): void {
  // Check if any other custom classic game is active, and reset/relaunch it
  const registry = (window as any).GameRegistry?.getInstance?.();
  const activeId = registry?.getActiveGameId?.();
  if (activeId && activeId !== 'blade_bedlam') {
    registry.launchGame(activeId, 'game-canvas', () => {
      if (window.setPanel) window.setPanel('flash-games');
    }).catch((err: any) => console.error('Failed to reset active game:', err));
    return;
  }

  logger.info('Initializing Blade Bedlam game entry point...');
  document.body.classList.remove('bb-gameplay-active');

  // 1. If phaserGame already exists, we do NOT need to destroy the whole WebGL context!
  // Instead, we reuse the existing engine and transition cleanly back to MainMenuScene.
  if (phaserGame) {
    logger.info('Phaser game instance already exists. Reusing it and returning to MainMenuScene...');
    document.body.classList.remove('bb-gameplay-active');
    
    try {
      // Wake up the Phaser main loop so transitions and updates can run
      phaserGame.loop.wake();
      SceneManager.getInstance().resumeActiveScenes();
      SceneManager.getInstance().transitionToScene('MainMenuScene');
    } catch (e) {
      logger.warn('Failed to transition to MainMenuScene on reset:', e);
    }

    // Refresh gladiator list and reset all HTML overlays
    resetOverlaysAndCards();
    selectGameBird(0);
    return;
  }

  // Clear EventBus and SceneManager to prevent event leaks/stale states on initial bootup
  try {
    SceneManager.getInstance().destroy();
    EventBus.getInstance().destroy();
  } catch (e) {
    logger.warn('Failed to cleanly destroy SceneManager or EventBus:', e);
  }

  // 2. Now get or recreate the canvas element
  const canvas = resetGameCanvas();
  if (!canvas) {
    logger.error('Target HTML game canvas container not found!');
    return;
  }

  // 3. Render character selection cards and reset overlays
  resetOverlaysAndCards();

  // 4. Instantiate Phaser 3 configuration and create engine
  try {
    const config = createGameConfig(canvas);
    phaserGame = new Phaser.Game(config);
    SceneManager.getInstance().setGameInstance(phaserGame);
    logger.info('Phaser 3 Engine instance created and bound successfully.');
  } catch (e) {
    logger.error('Failed to initialize Phaser 3 instance:', e);
  }

  // 5. Highlight the first gladiator card by default
  selectGameBird(0);

  // Set up ResizeObserver to handle robust scaling of Phaser when the container resizes
  const container = document.getElementById('game-canvas-container');
  if (container) {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (phaserGame && phaserGame.scale) {
          phaserGame.scale.refresh();
        }
      }
    });
    resizeObserver.observe(container);
    (window as any).gameResizeObserver = resizeObserver;
  }

  // Trigger a resize event to ensure Phaser layout scales perfectly to fill the container
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    if (phaserGame) {
      phaserGame.scale.refresh();
    }
  }, 100);
}

/**
 * Helper utility to reset all HTML menu and gameplay HUD elements, and render the character list.
 */
function resetOverlaysAndCards(): void {
  // Reset step
  currentMenuStep = 'main';

  // Reset overlays
  const menuOverlay = document.getElementById('bb-menu-overlay');
  if (menuOverlay) menuOverlay.style.display = 'flex';

  renderMenuOverlay();

  const pauseOverlay = document.getElementById('bb-pause-overlay');
  if (pauseOverlay) pauseOverlay.style.display = 'none';

  const floatPauseBtn = document.getElementById('bb-floating-pause-btn');
  if (floatPauseBtn) floatPauseBtn.style.display = 'none';

  const gameOverOverlay = document.getElementById('bb-gameover-overlay');
  if (gameOverOverlay) gameOverOverlay.style.display = 'none';

  const devMenu = document.getElementById('bb-developer-menu');
  if (devMenu) devMenu.style.display = 'none';

  const gameplayHud = document.getElementById('bb-gameplay-hud');
  if (gameplayHud) gameplayHud.style.display = 'none';

  const weaponArtHud = document.getElementById('bb-weapon-art-hud');
  if (weaponArtHud) weaponArtHud.style.display = 'none';

  const devSandboxPanel = document.getElementById('bb-dev-sandbox-panel');
  if (devSandboxPanel) devSandboxPanel.style.display = 'none';

  const bossHud = document.getElementById('bb-boss-hud');
  if (bossHud) bossHud.style.display = 'none';

  const upgradeOverlay = document.getElementById('bb-upgrade-overlay');
  if (upgradeOverlay) upgradeOverlay.style.display = 'none';

  const bossIntro = document.getElementById('bb-boss-intro');
  if (bossIntro) bossIntro.style.display = 'none';

  const scoreVal = document.getElementById('bb-score-val');
  if (scoreVal) scoreVal.textContent = '0';

  // Stop touch/pointer event bubble propagation on overlays to prevent Phaser from capturing and blocking clicks on mobile
  const overlays = [
    'bb-menu-overlay',
    'bb-pause-overlay',
    'bb-gameover-overlay',
    'bb-developer-menu',
    'bb-upgrade-overlay',
    'bb-merchant-overlay'
  ];

  overlays.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const stopProp = (e: Event) => {
        e.stopPropagation();
      };
      el.addEventListener('touchstart', stopProp, { passive: true });
      el.addEventListener('touchmove', stopProp, { passive: true });
      el.addEventListener('touchend', stopProp, { passive: true });
      el.addEventListener('pointerdown', stopProp);
      el.addEventListener('pointerup', stopProp);
      el.addEventListener('mousedown', stopProp);
      el.addEventListener('mouseup', stopProp);
    }
  });
}

/**
 * Triggers the start of an active gameplay run with the chosen gladiator,
 * hiding all overlays and launching Phaser's GameScene.
 */
function startGame(): void {
  logger.info(`Starting game run with gladiator index: ${selectedGladiatorIndex}, Weapon: ${selectedWeaponId}`);
  document.body.classList.add('bb-gameplay-active');

  const floatPauseBtn = document.getElementById('bb-floating-pause-btn');
  if (floatPauseBtn) floatPauseBtn.style.display = 'flex';

  // Hide UI overlays
  const menuOverlay = document.getElementById('bb-menu-overlay');
  if (menuOverlay) menuOverlay.style.display = 'none';

  const pauseOverlay = document.getElementById('bb-pause-overlay');
  if (pauseOverlay) pauseOverlay.style.display = 'none';

  const gameOverOverlay = document.getElementById('bb-gameover-overlay');
  if (gameOverOverlay) gameOverOverlay.style.display = 'none';

  if (phaserGame) {
    phaserGame.loop.wake();
    SceneManager.getInstance().resumeActiveScenes();
  }

  // Switch scene in Phaser via SceneManager
  SceneManager.getInstance().transitionToScene('GameScene', {
    gladiatorIndex: selectedGladiatorIndex,
    weaponClass: selectedWeaponId
  });

  // Ensure Phaser scales to the full screen viewport
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    if (phaserGame && phaserGame.scale) {
      phaserGame.scale.refresh();
    }
  }, 100);
}

/**
 * Utility to replace the game canvas element with a fresh, clean element,
 * clearing any attached WebGL / 2D contexts or stale state.
 */
function resetGameCanvas(): HTMLCanvasElement | null {
  const container = document.getElementById('game-canvas-container');
  if (!container) return null;

  let canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (canvas) {
    canvas.remove();
  }

  canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.background = '#090b15';

  container.insertBefore(canvas, container.firstChild);
  return canvas;
}

/**
 * Fully tears down and destroys the Phaser 3 WebGL engine, releasing WebGL context
 * and unbinding global event listeners so other 2D mini-games function properly.
 */
function destroyPhaserGame(): void {
  logger.info('Destroying Phaser game instance and resetting game canvas...');
  document.body.classList.remove('bb-gameplay-active');

  if (phaserGame) {
    try {
      SceneManager.getInstance().destroy();
      EventBus.getInstance().destroy();
      phaserGame.destroy(true, false);
    } catch (e) {
      logger.warn('Error destroying Phaser game instance:', e);
    }
    phaserGame = null;
  }

  if ((window as any).gameResizeObserver) {
    try {
      (window as any).gameResizeObserver.disconnect();
    } catch (e) {}
    (window as any).gameResizeObserver = null;
  }

  pauseGame();
  resetGameCanvas();
}

/**
 * Cleanly pauses and tears down the active game engine when navigating away from the game panel.
 */
function pauseGame(): void {
  logger.info('Pausing game / cleaning up active arena state...');
  document.body.classList.remove('bb-gameplay-active');
  
  if (phaserGame) {
    try {
      SceneManager.getInstance().pauseActiveScenes();
      phaserGame.loop.sleep();
      logger.info('Phaser 3 game instance slept and paused cleanly.');
    } catch (e) {
      logger.warn('Failed to sleep Phaser game loop or pause scenes:', e);
    }
  }

  // Hide all game-related overlays and HUD elements to completely restore FlashTrainer UI
  const overlaysToHide = [
    'bb-menu-overlay',
    'bb-pause-overlay',
    'bb-gameover-overlay',
    'bb-developer-menu',
    'bb-gameplay-hud',
    'bb-weapon-art-hud',
    'bb-dev-sandbox-panel',
    'bb-boss-hud',
    'bb-upgrade-overlay',
    'bb-boss-intro',
    'bb-post-wave-overlay',
    'bb-merchant-overlay',
    'bb-mobile-controls'
  ];
  overlaysToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

/**
 * Selects a gladiator from the deck, styling chosen cards and updating selected index.
 */
function selectGameBird(index: number): void {
  selectedGladiatorIndex = index;
  logger.info(`Gladiator chosen: ${GLADIATOR_CHARACTERS[index].name}`);
  renderMenuOverlay();
}

/**
 * Exposed utility bound on global window object for sound toggle button events.
 */
function toggleGameSound(el: HTMLButtonElement): void {
  const settings = SettingsManager.getInstance();
  const currentSoundState = settings.getSettings().soundEnabled;
  const isMuted = !currentSoundState;

  settings.updateSetting('soundEnabled', isMuted);
  AudioManager.getInstance().mute(!isMuted);
  AudioManager.getInstance().syncVolumes();

  if (isMuted) {
    el.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
      <span>Sound: On</span>
    `;
    logger.info('Sound enabled');
  } else {
    el.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
      <span>Sound: Muted</span>
    `;
    logger.info('Sound muted');
  }
}

/**
 * Checks if the current build/environment is a development/testing environment.
 */
function isDevelopmentBuild(): boolean {
  try {
    const isViteDev = (import.meta as any).env?.DEV;
    return !!(
      isViteDev || 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' || 
      window.location.hostname.includes('-dev-')
    );
  } catch (e) {
    return !!(
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' || 
      window.location.hostname.includes('-dev-')
    );
  }
}

/**
 * Transitions to the developer menu overlay, hiding the main menu overlay.
 */
function openDeveloperMenu(): void {
  logger.info('Opening Developer Menu...');
  const menuOverlay = document.getElementById('bb-menu-overlay');
  if (menuOverlay) menuOverlay.style.display = 'none';

  const devMenu = document.getElementById('bb-developer-menu');
  if (devMenu) devMenu.style.display = 'flex';
}

/**
 * Closes the developer menu overlay, restoring the main menu overlay.
 */
function closeDeveloperMenu(): void {
  logger.info('Closing Developer Menu...');
  const devMenu = document.getElementById('bb-developer-menu');
  if (devMenu) devMenu.style.display = 'none';

  const menuOverlay = document.getElementById('bb-menu-overlay');
  if (menuOverlay) menuOverlay.style.display = 'flex';
}

/**
 * Launches the Sandbox Arena directly.
 */
function startSandbox(): void {
  logger.info('Launching Sandbox Arena...');
  document.body.classList.add('bb-gameplay-active');
  
  // Hide overlays
  const devMenu = document.getElementById('bb-developer-menu');
  if (devMenu) devMenu.style.display = 'none';

  const menuOverlay = document.getElementById('bb-menu-overlay');
  if (menuOverlay) menuOverlay.style.display = 'none';

  const gameplayHud = document.getElementById('bb-gameplay-hud');
  if (gameplayHud) gameplayHud.style.display = 'none';

  if (phaserGame) {
    phaserGame.loop.wake();
    SceneManager.getInstance().resumeActiveScenes();
  }

  // Switch scene in Phaser via SceneManager
  SceneManager.getInstance().transitionToScene('DeveloperSandboxScene', {
    gladiatorIndex: selectedGladiatorIndex,
    weaponClass: selectedWeaponId
  });

  // Ensure Phaser scales to the full screen viewport
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    if (phaserGame && phaserGame.scale) {
      phaserGame.scale.refresh();
    }
  }, 100);
}

// Bind closures onto window for DOM elements / onclick bindings
Object.assign(window, {
  initGame,
  startGame,
  pauseGame,
  destroyPhaserGame,
  resetGameCanvas,
  selectGameBird,
  toggleGameSound,
  isDevelopmentBuild,
  openDeveloperMenu,
  closeDeveloperMenu,
  startSandbox,
  setMenuStep,
  selectWeaponClass,
  renderMenuOverlay
});


// ─── ES module exports (auto-generated) ───
export { closeDeveloperMenu, currentMenuStep, destroyPhaserGame, initGame, isDevelopmentBuild, logger, openDeveloperMenu, pauseGame, phaserGame, renderMenuOverlay, resetGameCanvas, resetOverlaysAndCards, selectGameBird, selectWeaponClass, selectedGladiatorIndex, selectedWeaponId, setMenuStep, startGame, startSandbox, toggleGameSound };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { closeDeveloperMenu, destroyPhaserGame, initGame, isDevelopmentBuild, openDeveloperMenu, pauseGame, renderMenuOverlay, resetGameCanvas, resetOverlaysAndCards, selectGameBird, selectWeaponClass, setMenuStep, startGame, startSandbox, toggleGameSound });
