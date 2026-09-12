import 'pixi.js/unsafe-eval'
import { Application } from 'pixi.js'
import { App } from './app'
import { MenuScene } from './scenes/MenuScene'
import { loadSettings } from './settings'
import { hex, C } from './theme'

async function boot(): Promise<void> {
  const settings = await loadSettings()
  const pixi = new Application()
  await pixi.init({
    resizeTo: window,
    background: hex(C.cream),
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: 'webgl'
  })
  document.getElementById('boot')?.remove()
  document.body.appendChild(pixi.canvas)

  const app = new App(pixi, settings)
  app.go(new MenuScene(app))

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11') void window.gd?.toggleFullscreen()
  })
}

void boot()
