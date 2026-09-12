import { GameClient } from '@net/client'
import { GameHost } from '@net/host'
import { HOST_CLIENT_ID } from '@net/protocol'
import { BridgeClientTransport, BridgeHostTransport, CompositeHostTransport, LocalHub, type NetBridge } from '@net/transport'
import type { Settings } from './settings'

export type Mode = 'solo' | 'lan-host' | 'lan-join' | 'steam-host' | 'steam-join'

export interface Session {
  mode: Mode
  client: GameClient
  host: GameHost | null
  joinCode: string
  leave(): Promise<void>
}

function requireBridge(): NonNullable<typeof window.gd> {
  if (!window.gd) throw new Error('Networking needs the desktop app')
  return window.gd
}

function lanBridge(): NetBridge {
  const gd = requireBridge()
  return {
    sendToPeer: (id, data) => gd.lan.sendToPeer(id, data),
    sendToHost: (data) => gd.lan.sendToHost(data),
    onPeerConnect: (cb) => gd.lan.on('peerConnect', (id) => cb(id as string)),
    onPeerDisconnect: (cb) => gd.lan.on('peerDisconnect', (id) => cb(id as string)),
    onPeerMessage: (cb) => gd.lan.on('peerMessage', (id, data) => cb(id as string, data as string)),
    onHostMessage: (cb) => gd.lan.on('hostMessage', (data) => cb(data as string)),
    onHostClosed: (cb) => gd.lan.on('hostClosed', (r) => cb(r as string))
  }
}

function steamBridge(): NetBridge {
  const gd = requireBridge()
  return {
    sendToPeer: (id, data) => gd.steam.sendToPeer(id, data),
    sendToHost: (data) => gd.steam.sendToHost(data),
    onPeerConnect: (cb) => gd.steam.on('peerConnect', (id) => cb(id as string)),
    onPeerDisconnect: (cb) => gd.steam.on('peerDisconnect', (id) => cb(id as string)),
    onPeerMessage: (cb) => gd.steam.on('peerMessage', (id, data) => cb(id as string, data as string)),
    onHostMessage: (cb) => gd.steam.on('hostMessage', (data) => cb(data as string)),
    onHostClosed: (cb) => gd.steam.on('hostClosed', (r) => cb(r as string))
  }
}

/** Solo: host and the single human client share the renderer. */
export function createSolo(settings: Settings): Session {
  const hub = new LocalHub()
  // `?seed=123` in the URL makes a solo game reproducible (handy when debugging a deal).
  const seedParam = new URLSearchParams(window.location.search).get('seed')
  const seed = seedParam ? Number(seedParam) >>> 0 : undefined
  const host = new GameHost(hub, { rules: settings.rules, botDelayMs: settings.botDelayMs, defaultBotLevel: settings.botLevel, seed })
  const client = new GameClient(hub.attach(HOST_CLIENT_ID), settings.name)
  return {
    mode: 'solo',
    client,
    host,
    joinCode: '',
    leave: async () => {
      client.leave()
      host.close()
    }
  }
}

/** Host a LAN game: local seat over the hub, remote seats over the WebSocket bridge. */
export async function createLanHost(settings: Settings, port = 0): Promise<Session> {
  const gd = requireBridge()
  const info = await gd.lan.host(port)
  const joinCode = `${info.addresses[0] ?? 'localhost'}:${info.port}`
  const hub = new LocalHub()
  const transport = new CompositeHostTransport([hub, new BridgeHostTransport(lanBridge())])
  const host = new GameHost(transport, { rules: settings.rules, botDelayMs: settings.botDelayMs, defaultBotLevel: settings.botLevel, joinCode })
  const client = new GameClient(hub.attach(HOST_CLIENT_ID), settings.name)
  return {
    mode: 'lan-host',
    client,
    host,
    joinCode,
    leave: async () => {
      client.leave()
      host.close()
      await gd.lan.stop()
    }
  }
}

export async function joinLan(settings: Settings, address: string): Promise<Session> {
  const gd = requireBridge()
  const url = address.startsWith('ws') ? address : `ws://${address}`
  await gd.lan.connect(url)
  const client = new GameClient(new BridgeClientTransport(lanBridge()), settings.name)
  return {
    mode: 'lan-join',
    client,
    host: null,
    joinCode: address,
    leave: async () => {
      client.leave()
      await gd.lan.disconnect()
    }
  }
}

export async function createSteamHost(settings: Settings, kind: 'public' | 'friends' | 'private' = 'friends'): Promise<Session> {
  const gd = requireBridge()
  const me = await gd.steam.me()
  const info = await gd.steam.createLobby(kind, 4)
  const hub = new LocalHub()
  const transport = new CompositeHostTransport([hub, new BridgeHostTransport(steamBridge())])
  const host = new GameHost(transport, { rules: settings.rules, botDelayMs: settings.botDelayMs, defaultBotLevel: settings.botLevel, joinCode: info.lobbyId })
  const client = new GameClient(hub.attach(HOST_CLIENT_ID), me?.name ?? settings.name)
  return {
    mode: 'steam-host',
    client,
    host,
    joinCode: info.lobbyId,
    leave: async () => {
      client.leave()
      host.close()
      await gd.steam.leaveLobby()
    }
  }
}

export async function joinSteam(settings: Settings, lobbyId: string): Promise<Session> {
  const gd = requireBridge()
  const me = await gd.steam.me()
  await gd.steam.joinLobby(lobbyId)
  const client = new GameClient(new BridgeClientTransport(steamBridge()), me?.name ?? settings.name)
  return {
    mode: 'steam-join',
    client,
    host: null,
    joinCode: lobbyId,
    leave: async () => {
      client.leave()
      await gd.steam.leaveLobby()
    }
  }
}
