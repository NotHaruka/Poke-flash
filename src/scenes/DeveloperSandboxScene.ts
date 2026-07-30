import { GameScene } from './GameScene.js';
import { Logger } from '../utils/Logger.js';

export class DeveloperSandboxScene extends GameScene {
  constructor() {
    super({ key: 'DeveloperSandboxScene' });
    this.logger = new Logger('DeveloperSandboxScene');
  }

  public init(data?: { gladiatorIndex?: number }): void {
    this.isSandboxMode = true;
    super.init(data);
  }
}
