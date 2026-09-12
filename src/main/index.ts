import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { registerLanIpc, shutdownLan } from './lan'
import { loadSettings, saveSettings } from './settings'
import { registerSteamIpc, shutdownSteam, steamEarlyInit } from './steam'

// Steam must be initialised before the window exists so the overlay can hook the renderer.
steamEarlyInit()

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Tiến lên',
    backgroundColor: '#f6ecdc',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerLanIpc(() => win)
  registerSteamIpc(() => win)
}

ipcMain.handle('app:quit', () => app.quit())
ipcMain.handle('app:toggleFullscreen', () => {
  if (!win) return false
  win.setFullScreen(!win.isFullScreen())
  return win.isFullScreen()
})
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('settings:load', () => loadSettings())
ipcMain.handle('settings:save', (_e, data: unknown) => saveSettings(data))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shutdownLan()
  shutdownSteam()
  if (process.platform !== 'darwin') app.quit()
})
