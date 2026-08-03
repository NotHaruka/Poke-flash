import Phaser from 'phaser';
import { Logger } from '../utils/Logger.js';

export interface GameInputState {
  moveX: number;
  moveY: number;
  isSprinting: boolean;
  isDodgePressed: boolean;
  isAttackPressed: boolean;
  pointerX: number;
  pointerY: number;
  isDodgeBuffered: boolean;
  isAttackBuffered: boolean;
}

export class InputManager {
  private scene: Phaser.Scene;
  private logger: Logger;

  // Keys
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;

  private state: GameInputState;
  private wasPointerDown: boolean = false;

  // Buffer countdown timers (in milliseconds)
  private dodgeBufferTime: number = 0;
  private attackBufferTime: number = 0;
  private readonly bufferWindow: number = 220; // ms window for buffering inputs

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.logger = new Logger('InputManager');
    this.state = this.createEmptyState();
    this.setupKeys();
  }

  private createEmptyState(): GameInputState {
    return {
      moveX: 0,
      moveY: 0,
      isSprinting: false,
      isDodgePressed: false,
      isAttackPressed: false,
      pointerX: 0,
      pointerY: 0,
      isDodgeBuffered: false,
      isAttackBuffered: false
    };
  }

  private setupKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) {
      this.logger.warn('Keyboard input not available in this scene context');
      return;
    }

    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyShift = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyX = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyF = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);

    this.logger.info('Keyboard inputs registered successfully (WASD, SHIFT, SPACE, X, F)');
  }

  /**
   * Polls input devices and updates the unified input state with buffering.
   * Call this at the start of your Scene update loop.
   */
  public update(delta: number): Readonly<GameInputState> {
    const pointer = this.scene.input.activePointer;
    const mobileInput = (window as any).mobileTouchInput;
    
    // Ignore keyboard input if typing in an HTML input field
    const activeElem = document.activeElement;
    if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
      this.state.moveX = 0;
      this.state.moveY = 0;
      this.state.isSprinting = false;
      this.state.isDodgePressed = false;
      this.state.isAttackPressed = false;
      return this.state;
    }

    // Decay buffer timers over delta time
    if (this.dodgeBufferTime > 0) this.dodgeBufferTime -= delta;
    if (this.attackBufferTime > 0) this.attackBufferTime -= delta;

    // Calc Movement
    let mx = 0;
    let my = 0;

    if (this.keyW?.isDown) my -= 1;
    if (this.keyS?.isDown) my += 1;
    if (this.keyA?.isDown) mx -= 1;
    if (this.keyD?.isDown) mx += 1;

    // Normalize diagonal movement vector
    if (mx !== 0 && my !== 0) {
      const len = Math.sqrt(mx * mx + my * my);
      mx /= len;
      my /= len;
    }

    // Override with mobile movement if active
    if (mobileInput && (mobileInput.moveX !== 0 || mobileInput.moveY !== 0)) {
      mx = mobileInput.moveX;
      my = mobileInput.moveY;
    }

    // Check pointer just down state frame-by-frame
    const isPointerJustDown = pointer.isDown && !this.wasPointerDown;
    this.wasPointerDown = pointer.isDown;

    const isSpaceJustPressed = this.keySpace ? Phaser.Input.Keyboard.JustDown(this.keySpace) : false;
    const isXJustPressed = this.keyX ? Phaser.Input.Keyboard.JustDown(this.keyX) : false;
    const isFJustPressed = this.keyF ? Phaser.Input.Keyboard.JustDown(this.keyF) : false;
    const isShiftJustPressed = this.keyShift ? Phaser.Input.Keyboard.JustDown(this.keyShift) : false;

    // Dodge is mapped to SPACEBAR or SHIFT or Mobile Dodge button
    let isDodgeJustPressed = isSpaceJustPressed || isShiftJustPressed;
    if (mobileInput && mobileInput.isDodgePressed) {
      isDodgeJustPressed = true;
      mobileInput.isDodgePressed = false; // consume trigger immediately
    }

    // Attack is mapped to Pointer Click, X, or F
    let isAttackJustPressed = isPointerJustDown || isXJustPressed || isFJustPressed;
    if (mobileInput && mobileInput.isAttackJustPressed) {
      isAttackJustPressed = true;
      mobileInput.isAttackJustPressed = false; // consume trigger immediately
    }

    if (isDodgeJustPressed) {
      this.dodgeBufferTime = this.bufferWindow;
    }
    if (isAttackJustPressed) {
      this.attackBufferTime = this.bufferWindow;
    }

    let pX = pointer.worldX;
    let pY = pointer.worldY;

    // Intelligent auto-aim for touch devices
    const isTouchActive = mobileInput && (
      mobileInput.moveX !== 0 || 
      mobileInput.moveY !== 0 || 
      mobileInput.isAttackPressed || 
      mobileInput.isDodgePressed || 
      (mobileInput.aimX !== undefined && (mobileInput.aimX !== 0 || mobileInput.aimY !== 0))
    );
    if (isTouchActive) {
      const gameScene = this.scene as any;
      if (gameScene && gameScene.player) {
        const playerX = gameScene.player.x;
        const playerY = gameScene.player.y;

        // If Right Joystick is active, control sword rotation directly
        if (mobileInput.aimX !== undefined && mobileInput.aimY !== undefined && (mobileInput.aimX !== 0 || mobileInput.aimY !== 0)) {
          pX = playerX + mobileInput.aimX * 150;
          pY = playerY + mobileInput.aimY * 150;
        } else {
          if (mobileInput.moveX !== 0 || mobileInput.moveY !== 0) {
            // Aim in direction of movement
            pX = playerX + mobileInput.moveX * 100;
            pY = playerY + mobileInput.moveY * 100;
          } else if (gameScene.player.gameObject) {
            // Keep current facing direction
            const rotation = gameScene.player.gameObject.rotation;
            pX = playerX + Math.cos(rotation) * 100;
            pY = playerY + Math.sin(rotation) * 100;
          }
        }
      }
    }

    this.state.moveX = mx;
    this.state.moveY = my;
    this.state.isSprinting = this.keyShift?.isDown || false;
    this.state.isDodgePressed = isDodgeJustPressed;
    this.state.isAttackPressed = pointer.isDown || (mobileInput?.isAttackPressed || false);
    this.state.pointerX = pX;
    this.state.pointerY = pY;
    this.state.isDodgeBuffered = this.dodgeBufferTime > 0;
    this.state.isAttackBuffered = this.attackBufferTime > 0;

    return this.state;
  }

  /**
   * Clear the buffered dodge roll input.
   */
  public consumeDodge(): void {
    this.dodgeBufferTime = 0;
    this.state.isDodgeBuffered = false;
  }

  /**
   * Clear the buffered weapon strike input.
   */
  public consumeAttack(): void {
    this.attackBufferTime = 0;
    this.state.isAttackBuffered = false;
  }

  public destroy(): void {
    // Phaser cleans up keys, but let's clear local refs
    this.state = this.createEmptyState();
    this.logger.debug('InputManager destroyed');
  }
}
