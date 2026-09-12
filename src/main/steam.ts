/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserWindow, ipcMain } from 'electron'

/**
 * Steam integration through steamworks.js (https://github.com/ceifa/steamworks.js).
 *
 * Everything here is optional: if the native module is missing, Steam isn't
 * running, or init fails (no steam_appid.txt next to the executable during
 * development), `available` reports false and the rest of the game works
 * without it.
 *
 * Multiplayer model: a Steam lobby carries membership + metadata, and game
 * traffic goes over Steam P2P (ISteamNetworking). The lobby owner runs the
 * authoritative GameHost in their renderer; every other member sends to the
 * owner. Peers are identified to the renderer as "steam:<steamId64>".
 *
 * NOTE: steamworks.js is a native module and cannot be exercised in an
 * automated sandbox. The calls below follow the 0.4.x API; if you upgrade,
 * diff against node_modules/steamworks.js/client.d.ts.
 */

const APP_ID = Number(process.env['STEAM_APP_ID'] ?? 480) // 480 = Spacewar test app; set your own.

let steamworks: any = null
let client: any = null
let currentLobby: any = null
let ownerId: bigint | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let members = new Set<string>()
const handles: any[] = []

function idStr(id64: bigint): string {
  return `steam:${id64.toString()}`
}
function idFromStr(s: string): bigint {
  return BigInt(s.replace(/^steam:/, ''))
}

/** Called before the window is created so the Steam overlay can attach. */
export function steamEarlyInit(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    steamworks = require('steamworks.js')
    client = steamworks.init(APP_ID)
    steamworks.electronEnableSteamOverlay?.()
  } catch (err) {
    steamworks = null
    client = null
    console.log('[steam] not available:', (err as Error).message)
  }
}

export function steamAvailable(): boolean {
  return !!client
}

function emit(getWin: () => BrowserWindow | null, channel: string, ...args: unknown[]): void {
  const w = getWin()
  if (w && !w.isDestroyed()) w.webContents.send(channel, ...args)
}

function myId(): bigint {
  return client.localplayer.getSteamId().steamId64 as bigint
}

function isOwner(): boolean {
  return ownerId !== null && ownerId === myId()
}

function lobbyMembers(): bigint[] {
  if (!currentLobby) return []
  return (currentLobby.getMembers() as any[]).map((m) => m.steamId64 as bigint)
}

function startPolling(getWin: () => BrowserWindow | null): void {
  stopPolling()
  pollTimer = setInterval(() => {
    try {
      let size = client.networking.isP2PPacketAvailable() as number
      let guard = 0
      while (size > 0 && guard++ < 200) {
        const packet = client.networking.readP2PPacket(size)
        const from = packet.steamId.steamId64 as bigint
        const data = Buffer.from(packet.data).toString('utf8')
        if (isOwner()) emit(getWin, 'steam:peerMessage', idStr(from), data)
        else if (ownerId !== null && from === ownerId) emit(getWin, 'steam:hostMessage', data)
        size = client.networking.isP2PPacketAvailable()
      }
    } catch (err) {
      console.log('[steam] poll error', err)
    }
  }, 25)
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function sendTo(id64: bigint, data: string): boolean {
  const SendType = client.networking.SendType
  const reliable = SendType ? SendType.Reliable : 2
  return client.networking.sendP2PPacket(id64, reliable, Buffer.from(data, 'utf8')) as boolean
}

function refreshMembers(getWin: () => BrowserWindow | null): void {
  if (!currentLobby) return
  const now = new Set(lobbyMembers().map(idStr))
  const me = idStr(myId())
  if (isOwner()) {
    for (const id of now) {
      if (id !== me && !members.has(id)) emit(getWin, 'steam:peerConnect', id)
    }
    for (const id of members) {
      if (!now.has(id)) emit(getWin, 'steam:peerDisconnect', id)
    }
  } else {
    const owner = currentLobby.getOwner().steamId64 as bigint
    if (ownerId !== null && owner !== ownerId) {
      // Host migration is not supported: the game ends if the owner leaves.
      emit(getWin, 'steam:hostClosed', 'the host left the lobby')
    }
  }
  members = now
  emit(getWin, 'steam:lobbyMembers', [...now])
}

function lobbyInfo(): { lobbyId: string; ownerId: string; members: string[]; isOwner: boolean } {
  return {
    lobbyId: currentLobby ? (currentLobby.id as bigint).toString() : '',
    ownerId: ownerId === null ? '' : idStr(ownerId),
    members: lobbyMembers().map(idStr),
    isOwner: isOwner()
  }
}

async function leaveLobby(): Promise<void> {
  stopPolling()
  if (currentLobby) {
    try {
      currentLobby.leave()
    } catch {
      /* ignore */
    }
  }
  currentLobby = null
  ownerId = null
  members = new Set()
}

export function registerSteamIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('steam:available', () => steamAvailable())

  ipcMain.handle('steam:me', () => {
    if (!client) return null
    return { id: idStr(myId()), name: client.localplayer.getName() as string }
  })

  ipcMain.handle('steam:createLobby', async (_e, kind: 'public' | 'friends' | 'private', maxMembers: number) => {
    if (!client) throw new Error('Steam is not available')
    await leaveLobby()
    const LobbyType = client.matchmaking.LobbyType
    const type = kind === 'public' ? LobbyType.Public : kind === 'friends' ? LobbyType.FriendsOnly : LobbyType.Private
    currentLobby = await client.matchmaking.createLobby(type, maxMembers)
    ownerId = myId()
    currentLobby.setData('game', 'tienlen')
    currentLobby.setData('name', `${client.localplayer.getName()}'s table`)
    members = new Set()
    startPolling(getWin)
    return lobbyInfo()
  })

  ipcMain.handle('steam:joinLobby', async (_e, lobbyId: string) => {
    if (!client) throw new Error('Steam is not available')
    await leaveLobby()
    currentLobby = await client.matchmaking.joinLobby(BigInt(lobbyId))
    ownerId = currentLobby.getOwner().steamId64 as bigint
    members = new Set(lobbyMembers().map(idStr))
    startPolling(getWin)
    // Open the P2P session with the host by sending a first packet.
    sendTo(ownerId!, JSON.stringify({ t: 'ping' }))
    return lobbyInfo()
  })

  ipcMain.handle('steam:leaveLobby', () => leaveLobby())

  ipcMain.handle('steam:lobbyInfo', () => lobbyInfo())

  ipcMain.handle('steam:listLobbies', async () => {
    if (!client) return []
    const lobbies = (await client.matchmaking.getLobbies()) as any[]
    return lobbies
      .filter((l) => l.getData('game') === 'tienlen')
      .map((l) => ({ lobbyId: (l.id as bigint).toString(), name: l.getData('name') as string, members: l.getMemberCount() as number, limit: l.getMemberLimit() as number }))
  })

  ipcMain.handle('steam:inviteDialog', () => {
    if (!client || !currentLobby) return
    client.overlay.activateInviteDialog(currentLobby.id)
  })

  ipcMain.handle('steam:sendToPeer', (_e, peerId: string, data: string) => {
    if (!client) return
    sendTo(idFromStr(peerId), data)
  })

  ipcMain.handle('steam:sendToHost', (_e, data: string) => {
    if (!client || ownerId === null) return
    sendTo(ownerId, data)
  })

  if (!client) return

  const CB = client.callback.SteamCallback
  const on = (name: string, fn: (d: any) => void): void => {
    if (CB && CB[name] !== undefined) handles.push(client.callback.register(CB[name], fn))
  }
  // Accept every P2P session from a lobby member.
  on('P2PSessionRequest', (d: any) => {
    const remote = d.remote as bigint
    if (lobbyMembers().includes(remote)) client.networking.acceptP2PSession(remote)
  })
  on('LobbyChatUpdate', () => refreshMembers(getWin))
  on('LobbyDataUpdate', () => refreshMembers(getWin))
  // Friend clicked "Join game" in Steam.
  on('GameLobbyJoinRequested', (d: any) => emit(getWin, 'steam:joinRequested', (d.lobbySteamId as bigint).toString()))
}

export function shutdownSteam(): void {
  void leaveLobby()
  for (const h of handles) {
    try {
      h.disconnect?.()
    } catch {
      /* ignore */
    }
  }
}
