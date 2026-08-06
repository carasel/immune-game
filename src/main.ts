import Phaser from 'phaser'
import { WORLD } from './content/levels'
import { LevelScene } from './render/LevelScene'
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
  // The HUD scene is started by LevelScene once the world exists.
  scene: [LevelScene],
})
