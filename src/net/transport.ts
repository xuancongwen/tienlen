import type { ClientMessage, ServerMessage } from './protocol'

/** What a host needs from the network: a set of client connections. */
export interface HostTransport {
  onConnect(cb: (clientId: string) => void): void
  onDisconnect(cb: (clientId: string) => void): void
  onMessage(cb: (clientId: string, msg: ClientMessage) => void): void
  send(clientId: string, msg: ServerMessage): void
  close(): void
  /** Whether this transport is the one that reaches `clientId` (used when transports are combined). */
  owns?(clientId: string): boolean
}

/** What a client needs: one connection to the host. */
export interface ClientTransport {
  onMessage(cb: (msg: ServerMessage) => void): void
  onClose(cb: (reason: string) => void): void
  send(msg: ClientMessage): void
  close(): void
}

type Listener<T extends unknown[]> = (...args: T) => void

export class Emitter<T extends unknown[]> {
  private listeners: Listener<T>[] = []
  add(cb: Listener<T>): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }
  emit(...args: T): void {
    for (const l of [...this.listeners]) l(...args)
  }
  clear(): void {
    this.listeners = []
  }
}

/**
 * In-process transport: the host and one or more clients live in the same
 * JavaScript context. Used for solo play and for the host's own seat in a
 * network game. Messages are delivered asynchronously (microtask) so the
 * ordering semantics match a real socket.
 */
export class LocalHub implements HostTransport {
  private connect = new Emitter<[string]>()
  private disconnect = new Emitter<[string]>()
  private message = new Emitter<[string, ClientMessage]>()
  private clients = new Map<string, LocalClient>()

  onConnect(cb: (clientId: string) => void): void {
    this.connect.add(cb)
  }
  onDisconnect(cb: (clientId: string) => void): void {
    this.disconnect.add(cb)
  }
  onMessage(cb: (clientId: string, msg: ClientMessage) => void): void {
    this.message.add(cb)
  }
  send(clientId: string, msg: ServerMessage): void {
    const c = this.clients.get(clientId)
    if (c) queueMicrotask(() => c.deliver(msg))
  }
  close(): void {
    for (const id of [...this.clients.keys()]) this.drop(id, 'host closed')
  }

  owns(clientId: string): boolean {
    return this.clients.has(clientId)
  }

  /** Create a client attached to this hub. */
  attach(clientId: string): LocalClient {
    const client = new LocalClient(this, clientId)
    this.clients.set(clientId, client)
    queueMicrotask(() => this.connect.emit(clientId))
    return client
  }

  /** @internal */
  receive(clientId: string, msg: ClientMessage): void {
    queueMicrotask(() => this.message.emit(clientId, msg))
  }

  /** @internal */
  drop(clientId: string, reason: string): void {
    const c = this.clients.get(clientId)
    if (!c) return
    this.clients.delete(clientId)
    c.closed(reason)
    this.disconnect.emit(clientId)
  }
}

export class LocalClient implements ClientTransport {
  private message = new Emitter<[ServerMessage]>()
  private close_ = new Emitter<[string]>()

  constructor(
    private hub: LocalHub,
    public readonly id: string
  ) {}

  onMessage(cb: (msg: ServerMessage) => void): void {
    this.message.add(cb)
  }
  onClose(cb: (reason: string) => void): void {
    this.close_.add(cb)
  }
  send(msg: ClientMessage): void {
    this.hub.receive(this.id, msg)
  }
  close(): void {
    this.hub.drop(this.id, 'client closed')
  }
  /** @internal */
  deliver(msg: ServerMessage): void {
    this.message.emit(msg)
  }
  /** @internal */
  closed(reason: string): void {
    this.close_.emit(reason)
  }
}

/**
 * Bridge-backed transports: the actual sockets (LAN WebSocket, Steam P2P)
 * live in Electron's main process; the renderer talks to them through a small
 * event API exposed on `window.gd.net`. These classes adapt that API to the
 * HostTransport / ClientTransport interfaces so the game code doesn't care.
 */
export interface NetBridge {
  /** Send a raw string to a specific peer (host side). */
  sendToPeer(peerId: string, data: string): void
  /** Send a raw string to the host (client side). */
  sendToHost(data: string): void
  onPeerConnect(cb: (peerId: string) => void): () => void
  onPeerDisconnect(cb: (peerId: string) => void): () => void
  onPeerMessage(cb: (peerId: string, data: string) => void): () => void
  onHostMessage(cb: (data: string) => void): () => void
  onHostClosed(cb: (reason: string) => void): () => void
}

export class BridgeHostTransport implements HostTransport {
  private unsub: (() => void)[] = []
  constructor(private bridge: NetBridge) {}
  onConnect(cb: (clientId: string) => void): void {
    this.unsub.push(this.bridge.onPeerConnect(cb))
  }
  onDisconnect(cb: (clientId: string) => void): void {
    this.unsub.push(this.bridge.onPeerDisconnect(cb))
  }
  onMessage(cb: (clientId: string, msg: ClientMessage) => void): void {
    this.unsub.push(
      this.bridge.onPeerMessage((peerId, data) => {
        try {
          cb(peerId, JSON.parse(data) as ClientMessage)
        } catch {
          /* ignore garbage */
        }
      })
    )
  }
  send(clientId: string, msg: ServerMessage): void {
    this.bridge.sendToPeer(clientId, JSON.stringify(msg))
  }
  close(): void {
    for (const u of this.unsub) u()
    this.unsub = []
  }
}

export class BridgeClientTransport implements ClientTransport {
  private unsub: (() => void)[] = []
  constructor(private bridge: NetBridge) {}
  onMessage(cb: (msg: ServerMessage) => void): void {
    this.unsub.push(
      this.bridge.onHostMessage((data) => {
        try {
          cb(JSON.parse(data) as ServerMessage)
        } catch {
          /* ignore */
        }
      })
    )
  }
  onClose(cb: (reason: string) => void): void {
    this.unsub.push(this.bridge.onHostClosed(cb))
  }
  send(msg: ClientMessage): void {
    this.bridge.sendToHost(JSON.stringify(msg))
  }
  close(): void {
    for (const u of this.unsub) u()
    this.unsub = []
  }
}

/** A host transport that fans out over several underlying transports (e.g. local + LAN). */
export class CompositeHostTransport implements HostTransport {
  constructor(private parts: HostTransport[]) {}
  onConnect(cb: (clientId: string) => void): void {
    for (const p of this.parts) p.onConnect(cb)
  }
  onDisconnect(cb: (clientId: string) => void): void {
    for (const p of this.parts) p.onDisconnect(cb)
  }
  onMessage(cb: (clientId: string, msg: ClientMessage) => void): void {
    for (const p of this.parts) p.onMessage(cb)
  }
  send(clientId: string, msg: ServerMessage): void {
    // Parts that can tell us they own the id get first refusal (the in-process hub);
    // everything else goes to the bridge transports, which forward unknown ids to the network.
    const owner = this.parts.find((p) => p.owns?.(clientId))
    if (owner) {
      owner.send(clientId, msg)
      return
    }
    for (const p of this.parts) if (!p.owns) p.send(clientId, msg)
  }
  close(): void {
    for (const p of this.parts) p.close()
  }
}
