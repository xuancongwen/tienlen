import type { GdApi } from './index'

declare global {
  interface Window {
    /** Bridge to Electron's main process (undefined when the renderer runs in a plain browser). */
    gd?: GdApi
  }
}

export {}
