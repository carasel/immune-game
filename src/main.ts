import Phaser from 'phaser'
import { WORLD } from './content/levels'
import { LevelScene } from './render/LevelScene'
import { MenuScene } from './render/MenuScene'
import { palette } from './render/palette'

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: palette.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // The menu runs first and starts a level when you pick one. The HUD is
  // started by LevelScene, once the world it describes exists.
  scene: [MenuScene, LevelScene],
})
