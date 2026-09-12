import { BrowserWindow, ipcMain } from 'electron'
import { networkInterfaces } from 'os'
import { WebSocket, WebSocketServer } from 'ws'

/**
 * LAN multiplayer: a plain WebSocket server in the main process. The renderer
 * (which runs the authoritative GameHost) sees peers as ids "lan:<n>" and
 * exchanges raw JSON strings with them through IPC events.
 */

let server: WebSocketServer | null = null
let peers = new Map<string, WebSocket>()
let nextPeer = 1
let client: WebSocket | null = null

function emit(getWin: () => BrowserWindow | null, channel: string, ...args: unknown[]): void {
  const w = getWin()
  if (w && !w.isDestroyed()) w.webContents.send(channel, ...args)
}

export function localAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address)
    }
  }
  return out
}

export function registerLanIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('lan:host', async (_e, port: number) => {
    await stopServer()
    return new Promise<{ port: number; addresses: string[] }>((resolve, reject) => {
      const s = new WebSocketServer({ port: port || 0 })
      s.on('error', (err) => reject(err))
      s.on('listening', () => {
        server = s
        const addr = s.address()
        const boundPort = typeof addr === 'object' && addr ? addr.port : port
        resolve({ port: boundPort, addresses: localAddresses() })
      })
      s.on('connection', (ws) => {
        const id = `lan:${nextPeer++}`
        peers.set(id, ws)
        emit(getWin, 'lan:peerConnect', id)
        ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => emit(getWin, 'lan:peerMessage', id, data.toString()))
        ws.on('close', () => {
          peers.delete(id)
          emit(getWin, 'lan:peerDisconnect', id)
        })
        ws.on('error', () => ws.close())
      })
    })
  })

  ipcMain.handle('lan:stop', async () => stopServer())

  ipcMain.handle('lan:sendToPeer', (_e, peerId: string, data: string) => {
    const ws = peers.get(peerId)
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data)
  })

  ipcMain.handle('lan:connect', (_e, url: string) => {
    disconnectClient()
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error('connection timed out'))
      }, 8000)
      ws.on('open', () => {
        clearTimeout(timer)
        client = ws
        resolve()
      })
      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => emit(getWin, 'lan:hostMessage', data.toString()))
      ws.on('close', () => {
        if (client === ws) client = null
        emit(getWin, 'lan:hostClosed', 'connection closed')
      })
      ws.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  })

  ipcMain.handle('lan:disconnect', () => disconnectClient())

  ipcMain.handle('lan:sendToHost', (_e, data: string) => {
    if (client && client.readyState === WebSocket.OPEN) client.send(data)
  })

  ipcMain.handle('lan:addresses', () => localAddresses())
}

function disconnectClient(): void {
  if (client) {
    client.close()
    client = null
  }
}

async function stopServer(): Promise<void> {
  for (const ws of peers.values()) ws.close()
  peers = new Map()
  if (server) {
    const s = server
    server = null
    await new Promise<void>((r) => s.close(() => r()))
  }
}

export function shutdownLan(): void {
  disconnectClient()
  void stopServer()
}
