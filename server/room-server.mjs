import dgram from 'node:dgram';
import crypto from 'node:crypto';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { PokerGame, GameAborted } from '../src/game.js';
import { pickBotProfiles } from '../src/ai.js';
import { SPEEDS } from '../src/speed.js';
import { PLAYER_REACTIONS } from '../src/reactions.js';

export const DISCOVERY_PORT = Number(process.env.POKEKE_DISCOVERY_PORT) || 41234;

const HUMAN_AVATARS = ['🧑', '👩', '👨', '🧔', '👱', '🧓'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function sanitizeName(name, fallback = 'Jogador') {
  const clean = String(name || '')
    .replace(/[<>&\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 18);
  return clean || fallback;
}

export function localAddresses() {
  const result = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) {
        result.push({ name, address: net.address });
      }
    }
  }
  return result;
}

function localBroadcasts() {
  const targets = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal || !net.netmask) continue;
      const ipParts = net.address.split('.').map(Number);
      const maskParts = net.netmask.split('.').map(Number);
      if (ipParts.length !== 4 || maskParts.length !== 4) continue;
      const broadcast = ipParts
        .map((part, index) => (part | (~maskParts[index] & 255)) & 255)
        .join('.');
      targets.add(broadcast);
    }
  }
  return [...targets];
}

/** Broadcast a discovery probe and collect room replies for a short window. */
export async function discoverRooms({ timeoutMs = 1400 } = {}) {
  return new Promise((resolve) => {
    const rooms = new Map();
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4' });
    } catch {
      resolve([]);
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve([...rooms.values()]);
    };

    socket.on('message', (message, rinfo) => {
      try {
        const data = JSON.parse(message.toString('utf8'));
        if (data.app !== 'pokeke' || data.t !== 'room' || !data.port) return;
        const key = `${rinfo.address}:${data.port}:${data.roomId}`;
        rooms.set(key, { ...data, address: rinfo.address, key });
      } catch {
        /* ignore malformed packets */
      }
    });
    socket.on('error', finish);

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        /* ignore */
      }
      const payload = Buffer.from(JSON.stringify({ app: 'pokeke', t: 'discover', v: 1 }), 'utf8');
      const targets = new Set(['255.255.255.255', '127.0.0.1', ...localBroadcasts()]);
      for (const target of targets) {
        socket.send(payload, DISCOVERY_PORT, target, () => {});
      }
      setTimeout(finish, timeoutMs);
    });
  });
}

export class RoomManager {
  constructor(options = {}) {
    this.speeds = options.speeds || SPEEDS;
    this.httpServer = null;
    this.wss = null;
    this.room = null;
    this.udp = null;
    this.connections = new Set();
  }

  attach(httpServer) {
    this.httpServer = httpServer;
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.keepAlive = setInterval(() => {
      if (!this.wss) return;
      for (const ws of this.wss.clients) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {
          /* ignore */
        }
      }
    }, 30000);
  }

  get port() {
    return this.httpServer ? this.httpServer.address().port : 0;
  }

  create(config = {}) {
    this.closeRoom(false);

    const id = crypto.randomBytes(4).toString('hex');
    const hostName = sanitizeName(config.hostName, 'Anfitrião');
    const room = {
      id,
      name: sanitizeName(config.roomName, `${hostName} · Mesa`),
      hostName,
      capacity: clamp(Number(config.capacity) || 4, 2, 6),
      config: {
        smallBlind: clamp(Number(config.smallBlind) || 10, 1, 10000),
        bigBlind: clamp(Number(config.bigBlind) || 20, 2, 20000),
        stack: clamp(Number(config.stack) || 2000, 100, 1000000),
        difficulty: ['easy', 'normal', 'hard'].includes(config.difficulty)
          ? config.difficulty
          : 'normal',
        speed: SPEEDS[config.speed] ? config.speed : 'calm',
      },
      adminToken: crypto.randomBytes(16).toString('hex'),
      clients: new Map(),
      disconnected: new Map(),
      status: 'lobby',
      game: null,
      gameSeq: 0,
      running: false,
    };

    this.room = room;
    this.startDiscovery(room);

    return {
      roomId: room.id,
      roomName: room.name,
      port: this.port,
      wsPath: '/ws',
      adminToken: room.adminToken,
      addresses: localAddresses(),
    };
  }

  closeRoom(notify = true) {
    const room = this.room;
    this.stopDiscovery();
    this.room = null;
    if (!room) return;
    room.status = 'lobby';
    if (room.game) room.game.abort();
    for (const client of room.disconnected.values()) {
      if (client.reconnectTimer) clearTimeout(client.reconnectTimer);
    }
    room.disconnected.clear();
    if (notify) {
      for (const ws of room.clients.keys()) {
        this.send(ws, { t: 'room-closed', message: 'O anfitrião encerrou a sala.' });
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    }
    room.clients.clear();
  }

  /** Lobby data for the host UI before any socket client is connected. */
  getLobby() {
    return this.room ? this.lobbyInfo(this.room) : null;
  }

  // ---------------------------------------------------------------- sockets

  onConnection(ws) {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('error', () => {});
    ws.on('message', (data) => this.onMessage(ws, data));
    ws.on('close', () => this.onClose(ws));

    if (!this.room) {
      this.send(ws, { t: 'error', message: 'Sala encerrada.' });
      ws.close();
    }
  }

  onMessage(ws, data) {
    let message;
    try {
      message = JSON.parse(data.toString('utf8'));
    } catch {
      return;
    }
    const room = this.room;
    if (!room || !message || typeof message.t !== 'string') return;

    if (message.t === 'join') {
      this.handleJoin(ws, message, room);
      return;
    }

    if (message.t === 'rejoin') {
      this.handleRejoin(ws, message, room);
      return;
    }

    const client = room.clients.get(ws);
    if (!client) {
      this.send(ws, { t: 'error', message: 'Entre na sala primeiro.' });
      return;
    }

    if (message.t === 'action') {
      if (!room.game || room.status !== 'playing') return;
      const action = message.action;
      if (!action || !['fold', 'check', 'call', 'raise', 'allin'].includes(action.type)) return;
      if (action.type === 'raise' || action.type === 'allin') {
        action.amount = Number(action.amount) || 0;
      }
      room.game.submitAction(client.id, action);
      return;
    }

    if (message.t === 'reaction') {
      if (!room.game || room.status !== 'playing') return;
      const text = String(message.text || '').trim();
      if (!PLAYER_REACTIONS.includes(text)) return;
      room.game.react(client.id, text);
      return;
    }

    if (message.t === 'start') {
      if (!client.isHost) {
        this.send(ws, { t: 'error', message: 'Apenas o anfitrião pode iniciar.' });
        return;
      }
      this.startGame(room);
      return;
    }

    if (message.t === 'leave') {
      this.leave(ws);
    }
  }

  handleJoin(ws, message, room) {
    if (room.clients.has(ws)) return;
    if (room.status === 'playing') {
      this.send(ws, { t: 'error', message: 'Esta partida já começou. Tente novamente depois.' });
      ws.close();
      return;
    }
    if (room.clients.size >= room.capacity) {
      this.send(ws, { t: 'error', message: 'A mesa está cheia.' });
      ws.close();
      return;
    }

    const isHost = !!message.adminToken && message.adminToken === room.adminToken;
    if (isHost && [...room.clients.values()].some((client) => client.isHost)) {
      this.send(ws, { t: 'error', message: 'Já existe um anfitrião conectado.' });
      ws.close();
      return;
    }

    const client = {
      id: `u_${crypto.randomBytes(4).toString('hex')}`,
      name: sanitizeName(message.name, isHost ? 'Anfitrião' : 'Jogador'),
      isHost,
      avatar: HUMAN_AVATARS[room.clients.size % HUMAN_AVATARS.length],
      reconnectToken: crypto.randomBytes(12).toString('hex'),
      reconnectTimer: null,
      connected: true,
      ws,
    };
    room.clients.set(ws, client);

    this.send(ws, {
      t: 'joined',
      playerId: client.id,
      roomId: room.id,
      admin: client.isHost,
      reconnectToken: client.reconnectToken,
      lobby: this.lobbyInfo(room),
    });
    this.broadcastLobby();
  }

  handleRejoin(ws, message, room) {
    const playerId = String(message.playerId || '');
    const token = String(message.token || '');

    const alreadyConnected = [...room.clients.values()].find((client) => client.id === playerId);
    if (alreadyConnected) {
      this.send(ws, {
        t: 'error',
        code: 'already-connected',
        message: 'Esta vaga já está conectada. Tentando novamente…',
      });
      ws.close();
      return;
    }

    const client = room.disconnected.get(playerId);
    if (!client || !token || client.reconnectToken !== token) {
      this.send(ws, {
        t: 'error',
        code: 'rejoin-failed',
        message: 'Sua vaga não está mais disponível. Entre novamente na sala.',
      });
      ws.close();
      return;
    }

    if (client.reconnectTimer) {
      clearTimeout(client.reconnectTimer);
      client.reconnectTimer = null;
    }
    room.disconnected.delete(playerId);
    client.ws = ws;
    client.connected = true;
    room.clients.set(ws, client);

    if (room.status === 'playing' && room.game) {
      room.game.reconnectPlayer(playerId);
    }

    const payload = {
      t: 'rejoined',
      playerId,
      roomId: room.id,
      admin: client.isHost,
      lobby: this.lobbyInfo(room),
    };
    if (room.status === 'playing' && room.game) {
      payload.status = 'playing';
      payload.state = room.game.snapshot(playerId);
      payload.config = {
        smallBlind: room.config.smallBlind,
        bigBlind: room.config.bigBlind,
        gameSeq: room.gameSeq,
      };
    }
    this.send(ws, payload);
    this.broadcastLobby();
  }

  leave(ws) {
    const room = this.room;
    if (!room) return;
    const client = room.clients.get(ws);
    if (!client) {
      ws.close();
      return;
    }
    room.clients.delete(ws);
    if (client.isHost) {
      this.closeRoom(true);
      return;
    }
    if (room.status === 'playing' && room.game) {
      room.game.replaceWithBot(client.id);
    }
    this.send(ws, { t: 'left' });
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    this.broadcastLobby();
  }

  onClose(ws) {
    const room = this.room;
    if (!room) return;
    const client = room.clients.get(ws);
    if (!client) return;
    room.clients.delete(ws);

    // During a hand we reserve the seat for a while so a network hiccup can
    // reconnect. The bot keeps the seat warm until then.
    if (room.status === 'playing' && room.game) {
      client.connected = false;
      client.ws = null;
      room.disconnected.set(client.id, client);
      room.game.replaceWithBot(client.id);
      client.reconnectTimer = setTimeout(() => {
        if (this.room !== room) return;
        if (room.disconnected.get(client.id) === client) {
          room.disconnected.delete(client.id);
          this.broadcastLobby();
        }
      }, 90000);
      this.broadcastLobby();
      return;
    }

    if (client.isHost) {
      this.closeRoom(true);
      return;
    }
    this.broadcastLobby();
  }

  send(ws, payload) {
    if (!ws || ws.readyState !== 1) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------- game flow

  lobbyInfo(room) {
    return {
      roomId: room.id,
      name: room.name,
      hostName: room.hostName,
      capacity: room.capacity,
      status: room.status,
      port: this.port,
      addresses: localAddresses(),
      players: [...room.clients.values()].map((client) => ({
        id: client.id,
        name: client.name,
        avatar: client.avatar,
        isHost: client.isHost,
      })),
      bots: Math.max(0, room.capacity - room.clients.size),
      config: room.config,
    };
  }

  broadcastLobby() {
    if (!this.room) return;
    const lobby = this.lobbyInfo(this.room);
    for (const ws of this.room.clients.keys()) {
      this.send(ws, { t: 'lobby', lobby });
    }
  }

  startGame(room) {
    if (!room || room.running || room.status === 'playing' || room.clients.size === 0) return;

    const humans = [...room.clients.values()];
    const botsNeeded = Math.max(0, room.capacity - humans.length);
    const bots = pickBotProfiles(botsNeeded);
    const players = [
      ...humans.map((client) => ({
        id: client.id,
        name: client.name,
        avatar: client.avatar,
        isHuman: true,
        stack: room.config.stack,
      })),
      ...bots.map((profile, index) => ({
        id: `b_${index}_${crypto.randomBytes(2).toString('hex')}`,
        name: profile.name,
        avatar: profile.avatar,
        stack: room.config.stack,
        strategy: profile,
      })),
    ];

    const speed = this.speeds[room.config.speed] || this.speeds.calm || SPEEDS.calm;
    const game = new PokerGame({
      players,
      smallBlind: room.config.smallBlind,
      bigBlind: room.config.bigBlind,
      difficulty: room.config.difficulty,
      botDelayMin: speed.botDelayMin,
      botDelayMax: speed.botDelayMax,
      pauseScale: speed.pauseScale,
      viewerId: null,
      onEvent: (event) => this.broadcastGameEvent(room, event),
    });

    room.game = game;
    room.gameSeq += 1;
    room.status = 'playing';
    room.running = true;

    this.broadcastLobby();
    for (const [ws, client] of room.clients) {
      this.send(ws, {
        t: 'event',
        type: 'game-start',
        state: game.snapshot(client.id),
        config: {
          smallBlind: room.config.smallBlind,
          bigBlind: room.config.bigBlind,
          gameSeq: room.gameSeq,
        },
      });
    }

    this.runGame(room, game);
  }

  async runGame(room, game) {
    try {
      while (room.running && !game.aborted) {
        const result = await game.playHand();
        if (game.aborted || !room.running) return;
        if (result.gameOver) {
          this.endGame(room, game);
          return;
        }
        await sleep(420 * game.pauseScale);
      }
    } catch (error) {
      if (!(error instanceof GameAborted)) {
        console.error('[pokeke] erro na partida:', error);
      }
    } finally {
      room.running = false;
    }
  }

  broadcastGameEvent(room, event) {
    if (room !== this.room || !room.game) return;
    for (const [ws, client] of room.clients) {
      const payload = {
        t: 'event',
        type: event.type,
        state: room.game.snapshot(client.id),
      };
      if (event.playerId !== undefined) payload.playerId = event.playerId;
      if (event.action !== undefined) payload.action = event.action;
      if (event.amount !== undefined) payload.amount = event.amount;
      if (event.results !== undefined) payload.results = event.results;
      if (event.text !== undefined) payload.text = event.text;
      this.send(ws, payload);
    }
  }

  endGame(room, game) {
    room.status = 'lobby';
    room.running = false;
    for (const client of room.disconnected.values()) {
      if (client.reconnectTimer) clearTimeout(client.reconnectTimer);
    }
    room.disconnected.clear();
    for (const [ws, client] of room.clients) {
      const state = game.snapshot(client.id);
      const me = state.players.find((player) => player.isMe);
      this.send(ws, {
        t: 'event',
        type: 'game-over',
        state,
        results: game.results,
        summary: {
          stack: me ? me.stack : 0,
          handNumber: game.handNumber,
          gameSeq: room.gameSeq,
        },
      });
    }
    this.broadcastLobby();
  }

  // -------------------------------------------------------------- discovery

  startDiscovery(room) {
    this.stopDiscovery();
    try {
      const socket = dgram.createSocket({ type: 'udp4' });
      socket.on('error', (error) => {
        console.warn('[pokeke] descoberta local indisponível:', error.message);
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        if (this.udp === socket) this.udp = null;
      });
      socket.on('message', (message, rinfo) => {
        if (!this.room) return;
        try {
          const data = JSON.parse(message.toString('utf8'));
          if (data.app !== 'pokeke' || data.t !== 'discover') return;
          const reply = {
            app: 'pokeke',
            t: 'room',
            roomId: this.room.id,
            name: this.room.name,
            host: this.room.hostName,
            players: this.room.clients.size,
            capacity: this.room.capacity,
            status: this.room.status,
            port: this.port,
          };
          socket.send(JSON.stringify(reply), rinfo.port, rinfo.address, () => {});
        } catch {
          /* ignore malformed probes */
        }
      });
      socket.bind(DISCOVERY_PORT, () => {
        try {
          socket.setBroadcast(true);
        } catch {
          /* ignore */
        }
      });
      this.udp = socket;
    } catch (error) {
      console.warn('[pokeke] não foi possível anunciar a sala:', error.message);
    }
  }

  stopDiscovery() {
    if (!this.udp) return;
    const socket = this.udp;
    this.udp = null;
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  }

  shutdown() {
    this.closeRoom(false);
    if (this.wss) {
      try {
        this.wss.close();
      } catch {
        /* ignore */
      }
      this.wss = null;
    }
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
  }
}
