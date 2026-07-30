import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { MainMenuScene } from '../scenes/MainMenuScene.js';
import { GameScene } from '../scenes/GameScene.js';
import { ColosseumOutpostScene } from '../scenes/ColosseumOutpostScene.js';
import { DeveloperSandboxScene } from '../scenes/DeveloperSandboxScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './Constants.js';

function getRenderType(): number {
  try {
    const canvas = document.createElement('canvas');
    const isWebGLSupported = !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    return isWebGLSupported ? Phaser.WEBGL : Phaser.CANVAS;
  } catch (e) {
    return Phaser.CANVAS;
  }
}

/**
 * Generates the central configuration object to instantiate a Phaser 3 Game.
 */
export function createGameConfig(canvasElement: HTMLCanvasElement): Phaser.Types.Core.GameConfig {
  return {
    type: getRenderType(),
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    canvas: canvasElement,
    parent: canvasElement.parentElement || undefined,
    scene: [BootScene, PreloadScene, MainMenuScene, GameScene, ColosseumOutpostScene, DeveloperSandboxScene],
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false
      }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: {
      pixelArt: false,
      antialias: true,
      roundPixels: true
    },
    audio: {
      disableWebAudio: false
    }
  };
}
