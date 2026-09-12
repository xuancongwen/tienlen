import { describe, expect, it } from 'vitest'
import { Bot } from '@ai/bot'
import { withRules } from '@engine/rules'
import { GameClient } from '@net/client'
import { GameHost } from '@net/host'
import { HOST_CLIENT_ID } from '@net/protocol'
import { LocalHub } from '@net/transport'

const tick = (ms = 2) => new Promise((r) => setTimeout(r, ms))

describe('host + client over the in-process transport', () => {
  it('seats the host, lets them edit the lobby, and plays a full match with bots', async () => {
    const hub = new LocalHub()
    const host = new GameHost(hub, { botDelayMs: 0, nextHandDelayMs: 1, rules: withRules({ rounds: 2 }), seed: 3 })
    const me = new GameClient(hub.attach(HOST_CLIENT_ID), 'Sam')
    await tick()
    expect(me.seat).toBe(0)
    expect(me.isHost).toBe(true)
    expect(me.lobby!.seats[0].name).toBe('Sam')
    expect(me.lobby!.seats.slice(1).every((s) => s.isBot)).toBe(true)

    me.setSeat(1, { botLevel: 'hard', name: 'Boss' })
    await tick()
    expect(me.lobby!.seats[1].botLevel).toBe('hard')
    expect(me.lobby!.seats[1].name).toBe('Boss')

    me.start()
    await tick()
    expect(me.view).not.toBeNull()
    expect(me.view!.hand).toHaveLength(13)

    // Drive our own seat with a bot brain through the client API.
    const brain = new Bot('normal', 99)
    let guard = 0
    while (me.view!.phase !== 'matchOver' && guard++ < 5000) {
      const v = me.view!
      const waitingOnMe = v.phase === 'playing' && v.turn === 0
      if (waitingOnMe) {
        const a = brain.decide(v)!
        me.act(a)
      }
      await tick(1)
    }
    expect(me.view!.phase).toBe('matchOver')
    expect(me.lastError).toBe('')
    host.close()
  })

  it('a second client takes a bot seat and gets its own view; disconnecting hands the seat to a bot', async () => {
    const hub = new LocalHub()
    const host = new GameHost(hub, { botDelayMs: 5000, seed: 5 })
    const a = new GameClient(hub.attach(HOST_CLIENT_ID), 'Host')
    const b = new GameClient(hub.attach('local:b'), 'Guest')
    await tick()
    expect(b.seat).toBe(1)
    expect(b.isHost).toBe(false)
    b.takeSeat(2)
    await tick()
    expect(b.seat).toBe(2)
    expect(a.lobby!.seats[1].isBot).toBe(true)
    expect(a.lobby!.seats[2].name).toBe('Guest')

    b.setRules(withRules({ rounds: 5 }))
    await tick()
    expect(b.lastError).toMatch(/host/)

    a.start()
    await tick()
    expect(b.view!.seat).toBe(2)
    expect(b.view!.hand).toHaveLength(13)
    expect(b.view!.handCounts).toEqual([13, 13, 13, 13])
    // b cannot act for another seat
    b.act({ type: 'pass', seat: 0 })
    await tick()
    expect(b.lastError).toMatch(/seat/)

    b.leave()
    await tick()
    expect(a.lobby!.seats[2].isBot).toBe(true)
    host.close()
  })
})

describe('table size', () => {
  it('shrinking the table moves a human out of a dropped seat and growing adds bots', async () => {
    const hub = new LocalHub()
    const host = new GameHost(hub, { botDelayMs: 5000 })
    const a = new GameClient(hub.attach(HOST_CLIENT_ID), 'Host')
    const b = new GameClient(hub.attach('local:b'), 'Guest')
    await tick()
    b.takeSeat(3)
    await tick()
    expect(b.seat).toBe(3)
    a.setRules(withRules({ playerCount: 2 }))
    await tick()
    expect(a.lobby!.seats).toHaveLength(2)
    expect(b.seat).toBe(1)
    expect(a.lobby!.seats[1].name).toBe('Guest')
    a.setRules(withRules({ playerCount: 3 }))
    await tick()
    expect(a.lobby!.seats).toHaveLength(3)
    expect(a.lobby!.seats[2].isBot).toBe(true)
    a.start()
    await tick()
    expect(b.view!.handCounts).toEqual([13, 13, 13])
    host.close()
  })
})

describe('composite transport routing', () => {
  it('sends host-seat messages through the local hub and others through the bridge', async () => {
    const { CompositeHostTransport, BridgeHostTransport } = await import('@net/transport')
    const hub = new LocalHub()
    const sent: string[] = []
    const bridge = new BridgeHostTransport({
      sendToPeer: (id) => void sent.push(id),
      sendToHost: () => {},
      onPeerConnect: () => () => {},
      onPeerDisconnect: () => () => {},
      onPeerMessage: () => () => {},
      onHostMessage: () => () => {},
      onHostClosed: () => () => {}
    })
    const transport = new CompositeHostTransport([hub, bridge])
    const host = new GameHost(transport, { botDelayMs: 5000 })
    const me = new GameClient(hub.attach(HOST_CLIENT_ID), 'Host')
    await tick()
    expect(me.seat).toBe(0)
    expect(sent).toHaveLength(0)
    transport.send('lan:7', { t: 'error', message: 'x' })
    expect(sent).toEqual(['lan:7'])
    host.close()
  })
})
