import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../server/http.mjs';
import { RoomManager, discoverRooms } from '../server/room-server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

class TestClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.messages = [];
    this.waiters = [];
    this.listeners = [];
    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString('utf8'));
      this.messages.push(message);
      for (const listener of [...this.listeners]) listener(message);
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(message)) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          clearTimeout(waiter.timer);
          waiter.resolve(message);
        }
      }
    });
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  onMessage(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  /** Wait for a matching message at or after `fromIndex` (defaults to now). */
  waitFor(predicate, { timeout = 12000, fromIndex = 0 } = {}) {
    for (let index = fromIndex; index < this.messages.length; index += 1) {
      if (predicate(this.messages[index])) return Promise.resolve(this.messages[index]);
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`timed out waiting for a message (${this.messages.length} received)`));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
    throw error;
  }
}

await test('local room: discovery, join, game and rematch', async () => {
  const server = await createStaticServer({ root, port: 0 });
  const manager = new RoomManager({
    speeds: {
      calm: { botDelayMin: 0, botDelayMax: 0, pauseScale: 0 },
      normal: { botDelayMin: 0, botDelayMax: 0, pauseScale: 0 },
      fast: { botDelayMin: 0, botDelayMax: 0, pauseScale: 0 },
    },
  });
  manager.attach(server);

  const info = manager.create({
    hostName: 'Host',
    capacity: 4,
    smallBlind: 5,
    bigBlind: 10,
    stack: 100,
    difficulty: 'easy',
    speed: 'calm',
    variant: 'joker',
  });

  let host = null;
  let guest = null;

  try {
    const rooms = await discoverRooms({ timeoutMs: 900 });
    assert.ok(
      rooms.some((room) => room.roomId === info.roomId),
      'the room did not appear in local discovery',
    );
    console.log(`     room discovered at ${rooms[0].address}:${rooms[0].port}`);

    const url = `ws://127.0.0.1:${info.port}/ws`;
    host = new TestClient(url);
    guest = new TestClient(url);
    await Promise.all([host.open(), guest.open()]);

    host.send({ t: 'join', name: 'Host', adminToken: info.adminToken });
    guest.send({ t: 'join', name: 'Guest' });

    const hostJoined = await host.waitFor((message) => message.t === 'joined');
    const guestJoined = await guest.waitFor((message) => message.t === 'joined');
    assert.equal(hostJoined.admin, true);
    assert.equal(guestJoined.admin, false);
    assert.notEqual(hostJoined.playerId, guestJoined.playerId);

    const lobby = await host.waitFor(
      (message) => message.t === 'lobby' && message.lobby.players.length === 2,
      { timeout: 5000 },
    );
    assert.equal(lobby.lobby.capacity, 4);
    assert.equal(lobby.lobby.bots, 2);
    assert.equal(lobby.lobby.config.variant, 'joker');

    const hostId = hostJoined.playerId;
    const guestId = guestJoined.playerId;

    const autoPlay = (client, playerId) =>
      client.onMessage((message) => {
        if (message.t !== 'event' || message.type !== 'human-turn') return;
        if (message.playerId !== playerId) return;
        const state = message.state;
        if (!state || !state.options) return;
        const options = state.options;
        if (options.canRaise) {
          client.send({ t: 'action', action: { type: 'raise', amount: options.maxRaiseTo } });
        } else if (options.canCheck) {
          client.send({ t: 'action', action: { type: 'check' } });
        } else {
          client.send({ t: 'action', action: { type: 'call' } });
        }
      });

    const stopHostAutoPlay = autoPlay(host, hostId);
    const stopGuestAutoPlay = autoPlay(guest, guestId);

    const hostStartFrom = host.messages.length;
    const guestStartFrom = guest.messages.length;
    host.send({ t: 'start' });

    const hostStart = await host.waitFor(
      (message) => message.t === 'event' && message.type === 'game-start',
      { fromIndex: hostStartFrom },
    );
    const guestStart = await guest.waitFor(
      (message) => message.t === 'event' && message.type === 'game-start',
      { fromIndex: guestStartFrom },
    );
    assert.ok(hostStart.state && guestStart.state);
    assert.equal(hostStart.state.variant, 'joker');
    assert.equal(hostStart.config.variant, 'joker');
    assert.equal(hostStart.state.players[0].id, hostId, 'the host should be seated at the bottom');
    assert.equal(guestStart.state.players[0].id, guestId, 'the guest should be seated at the bottom');
    assert.ok(hostStart.state.players.find((player) => player.id === hostId).isMe);
    assert.ok(guestStart.state.players.find((player) => player.id === guestId).isMe);

    const cursorFrom = host.messages.length;
    guest.send({ t: 'cursor', x: 0.25, y: 0.75 });
    const cursor = await host.waitFor(
      (message) => message.t === 'cursor' && message.playerId === guestId,
      { fromIndex: cursorFrom },
    );
    assert.equal(cursor.x, 0.25);
    assert.equal(cursor.y, 0.75);

    const chipFrom = guest.messages.length;
    host.send({
      t: 'chip',
      chip: {
        x: 0.5,
        y: 0.5,
        size: 0.03,
        color: 'gold',
        vx: 0.1,
        vy: -0.1,
        angle: 1,
        spin: 2,
      },
    });
    const chip = await guest.waitFor(
      (message) => message.t === 'chip',
      { fromIndex: chipFrom },
    );
    assert.equal(chip.chip.color, 'gold');
    assert.equal(chip.chip.x, 0.5);

    const hostDeal = await host.waitFor(
      (message) => message.t === 'event' && message.type === 'deal',
      { fromIndex: 0 },
    );
    const guestDeal = await guest.waitFor(
      (message) => message.t === 'event' && message.type === 'deal',
      { fromIndex: 0 },
    );

    const hostMe = hostDeal.state.players.find((player) => player.id === hostId);
    const guestInHostView = hostDeal.state.players.find((player) => player.id === guestId);
    const guestMe = guestDeal.state.players.find((player) => player.id === guestId);
    const hostInGuestView = guestDeal.state.players.find((player) => player.id === hostId);

    assert.equal(hostMe.hole.length, 2);
    assert.equal(guestMe.hole.length, 2);
    assert.equal(guestInHostView.hole.filter(Boolean).length, 0, 'guest cards leaked');
    assert.equal(hostInGuestView.hole.filter(Boolean).length, 0, 'host cards leaked');
    assert.equal(hostInGuestView.hole.length, 2);

    const reactionFrom = host.messages.length;
    guest.send({ t: 'reaction', text: '😂' });
    const reaction = await host.waitFor(
      (message) => message.t === 'event' && message.type === 'reaction' && message.playerId === guestId,
      { fromIndex: reactionFrom, timeout: 8000 },
    );
    assert.equal(reaction.text, '😂');
    assert.ok(reaction.state.players.some((player) => player.id === guestId));

    const hostOver = await host.waitFor(
      (message) => message.t === 'event' && message.type === 'game-over',
      { fromIndex: 0, timeout: 30000 },
    );
    const guestOver = await guest.waitFor(
      (message) => message.t === 'event' && message.type === 'game-over',
      { fromIndex: 0, timeout: 30000 },
    );

    assert.ok(hostOver.summary && guestOver.summary);
    const finalStacks = hostOver.state.players.reduce((sum, player) => sum + player.stack, 0);
    assert.equal(finalStacks, 4 * 100, 'chips were lost at the end of the game');

    const lobbyAfter = await host.waitFor(
      (message) => message.t === 'lobby' && message.lobby.status === 'lobby',
      { fromIndex: host.messages.indexOf(hostOver) + 1 },
    );
    assert.equal(lobbyAfter.lobby.players.length, 2);

    // Rematch with the same room. Pause both humans so the rejoin test has a
    // deterministic window before the hand can finish.
    stopHostAutoPlay();
    stopGuestAutoPlay();
    const rematchFrom = host.messages.length;
    host.send({ t: 'start' });
    const hostStart2 = await host.waitFor(
      (message) => message.t === 'event' && message.type === 'game-start',
      { fromIndex: rematchFrom },
    );
    assert.equal(hostStart2.state.players[0].id, hostId);
    await host.waitFor(
      (message) => message.t === 'event' && message.type === 'deal',
      { fromIndex: rematchFrom },
    );

    // A guest leaving mid-game turns the seat into a bot and warns the table.
    const leftFrom = host.messages.length;
    guest.close();
    const left = await host.waitFor(
      (message) => message.t === 'event' && message.type === 'player-left',
      { fromIndex: leftFrom, timeout: 15000 },
    );
    assert.equal(left.playerId, guestId);
    assert.ok(
      left.state.players.some((player) => player.id === guestId && player.isHuman === false),
      'the seat did not become a bot after the disconnect',
    );

    // The reserved seat can be reclaimed with the rejoin token.
    const rejoinClient = new TestClient(url);
    await rejoinClient.open();
    const rejoinedFrom = rejoinClient.messages.length;
    rejoinClient.send({
      t: 'rejoin',
      playerId: guestId,
      token: guestJoined.reconnectToken,
      name: 'Guest',
    });
    const rejoined = await rejoinClient.waitFor((message) => message.t === 'rejoined', {
      fromIndex: rejoinedFrom,
    });
    assert.equal(rejoined.playerId, guestId);
    assert.equal(rejoined.status, 'playing');
    assert.equal(rejoined.admin, false);
    assert.equal(rejoined.state.players[0].id, guestId, 'the reconnected player should be seated at the bottom');
    assert.equal(rejoined.state.players[0].hole.filter(Boolean).length, 2);
    assert.equal(rejoined.state.players[0].isMe, true);

    const joinedEvent = await host.waitFor(
      (message) => message.t === 'event' && message.type === 'player-joined',
      { fromIndex: leftFrom + 1, timeout: 15000 },
    );
    assert.equal(joinedEvent.playerId, guestId);

    rejoinClient.close();
    host.close();
  } finally {
    host?.close();
    guest?.close();
    manager.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

console.log('\nNetwork tests passed.');
