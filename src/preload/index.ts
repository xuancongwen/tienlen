import { contextBridge, ipcRenderer } from 'electron'

type Handler = (...args: unknown[]) => void

function on(channel: string, cb: Handler): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  platform: process.platform,
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:toggleFullscreen'),
  settings: {
    load: (): Promise<unknown> => ipcRenderer.invoke('settings:load'),
    save: (data: unknown): Promise<boolean> => ipcRenderer.invoke('settings:save', data)
  },
  lan: {
    host: (port = 0): Promise<{ port: number; addresses: string[] }> => ipcRenderer.invoke('lan:host', port),
    stop: (): Promise<void> => ipcRenderer.invoke('lan:stop'),
    connect: (url: string): Promise<void> => ipcRenderer.invoke('lan:connect', url),
    disconnect: (): Promise<void> => ipcRenderer.invoke('lan:disconnect'),
    addresses: (): Promise<string[]> => ipcRenderer.invoke('lan:addresses'),
    sendToPeer: (peerId: string, data: string): void => void ipcRenderer.invoke('lan:sendToPeer', peerId, data),
    sendToHost: (data: string): void => void ipcRenderer.invoke('lan:sendToHost', data),
    on: (event: 'peerConnect' | 'peerDisconnect' | 'peerMessage' | 'hostMessage' | 'hostClosed', cb: Handler): (() => void) => on(`lan:${event}`, cb)
  },
  steam: {
    available: (): Promise<boolean> => ipcRenderer.invoke('steam:available'),
    me: (): Promise<{ id: string; name: string } | null> => ipcRenderer.invoke('steam:me'),
    createLobby: (kind: 'public' | 'friends' | 'private', maxMembers = 4): Promise<SteamLobbyInfo> => ipcRenderer.invoke('steam:createLobby', kind, maxMembers),
    joinLobby: (lobbyId: string): Promise<SteamLobbyInfo> => ipcRenderer.invoke('steam:joinLobby', lobbyId),
    leaveLobby: (): Promise<void> => ipcRenderer.invoke('steam:leaveLobby'),
    lobbyInfo: (): Promise<SteamLobbyInfo> => ipcRenderer.invoke('steam:lobbyInfo'),
    listLobbies: (): Promise<{ lobbyId: string; name: string; members: number; limit: number }[]> => ipcRenderer.invoke('steam:listLobbies'),
    inviteDialog: (): Promise<void> => ipcRenderer.invoke('steam:inviteDialog'),
    sendToPeer: (peerId: string, data: string): void => void ipcRenderer.invoke('steam:sendToPeer', peerId, data),
    sendToHost: (data: string): void => void ipcRenderer.invoke('steam:sendToHost', data),
    on: (
      event: 'peerConnect' | 'peerDisconnect' | 'peerMessage' | 'hostMessage' | 'hostClosed' | 'lobbyMembers' | 'joinRequested',
      cb: Handler
    ): (() => void) => on(`steam:${event}`, cb)
  }
}

export interface SteamLobbyInfo {
  lobbyId: string
  ownerId: string
  members: string[]
  isOwner: boolean
}

export type GdApi = typeof api

contextBridge.exposeInMainWorld('gd', api)
