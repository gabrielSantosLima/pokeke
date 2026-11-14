import { createDeck, shuffleInPlace, formatChips } from './cards.js';
import { evaluate } from './evaluator.js';
import { decideBotAction } from './ai.js';
import { REACTION_COOLDOWN_MS, pickBotReaction } from './reactions.js';

export class GameAborted extends Error {
  constructor() {
    super('Partida interrompida');
    this.name = 'GameAborted';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

export class PokerGame {
  constructor(options) {
    this.smallBlind = options.smallBlind;
    this.bigBlind = options.bigBlind;
    this.onEvent = options.onEvent || (() => {});
    this.botDelayMin = options.botDelayMin ?? 380;
    this.botDelayMax = options.botDelayMax ?? 850;
    this.difficulty = options.difficulty || 'normal';
    this.pauseScale = options.pauseScale ?? 1;

    this.players = options.players.map((p, index) => ({
      id: p.id || `p${index}`,
      name: p.name,
      avatar: p.avatar,
      isHuman: !!p.isHuman,
      strategy: p.strategy || null,
      stack: p.stack,
      hole: [],
      bet: 0,
      committed: 0,
      folded: false,
      allIn: false,
      out: false,
      acted: false,
      lastAction: null,
      revealed: false,
      handResult: null,
      won: 0,
      isWinner: false,
    }));

    this.dealerIndex = -1;
    this.sbIndex = null;
    this.bbIndex = null;
    this.handNumber = 0;
    this.street = 'preflop';
    this.board = [];
    this.deck = [];
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.raisesThisStreet = 0;
    this.activePlayerId = null;
    this.pendingOptions = null;
    this.log = [];
    this.logId = 0;
    this.results = null;
    this.aborted = false;
    this.lastAction = null;
    this.viewerId = options.viewerId || null;
    this.hadHumans = this.players.some((player) => player.isHuman);
    this.actionResolvers = new Map();
    this.lastReactionAt = new Map();
    this.botReactionHand = new Map();
    this.reactionSeq = 0;
  }

  // ---------------------------------------------------------------- events

  emit(type, extra = {}) {
    this.onEvent({ type, ...extra, state: this.snapshot(this.viewerId) });
  }

  pushLog(text, kind = 'info', extra = {}) {
    this.log.push({
      id: (this.logId += 1),
      text,
      kind,
      street: this.street,
      hand: this.handNumber,
      ...extra,
    });
    if (this.log.length > 320) this.log.shift();
  }

  snapshot(viewerId = this.viewerId) {
    const players = this.players.map((p, index) => {
      const isMe = p.id === viewerId;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHuman: p.isHuman,
        isMe,
        stack: p.stack,
        bet: p.bet,
        committed: p.committed,
        folded: p.folded,
        allIn: p.allIn,
        out: p.out,
        active: p.id === this.activePlayerId,
        lastAction: p.lastAction,
        isDealer: index === this.dealerIndex,
        isSmallBlind: index === this.sbIndex,
        isBigBlind: index === this.bbIndex,
        revealed: p.revealed || isMe,
        hole: p.revealed || isMe ? p.hole.map((c) => ({ ...c })) : p.hole.map(() => null),
        handName: p.handResult ? p.handResult.name : null,
        handDetail: p.handResult ? p.handResult.description : null,
        won: p.won,
        isWinner: p.isWinner,
      };
    });

    // Put the viewer at the bottom seat; keep the table order otherwise.
    if (viewerId) {
      const viewerIndex = players.findIndex((p) => p.id === viewerId);
      if (viewerIndex > 0) {
        const rotated = players.slice(viewerIndex).concat(players.slice(0, viewerIndex));
        players.length = 0;
        players.push(...rotated);
      }
    }

    return {
      handNumber: this.handNumber,
      street: this.street,
      board: this.board.map((c) => ({ ...c })),
      pot: this.players.reduce((sum, p) => sum + p.committed, 0),
      currentBet: this.currentBet,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      dealerId: this.players[this.dealerIndex] ? this.players[this.dealerIndex].id : null,
      activePlayerId: this.activePlayerId,
      options: viewerId && this.activePlayerId !== viewerId ? null : this.pendingOptions,
      results: this.results,
      lastAction: this.lastAction,
      players,
      log: this.log,
    };
  }

  setSpeed({ botDelayMin, botDelayMax, pauseScale } = {}) {
    if (Number.isFinite(botDelayMin)) this.botDelayMin = botDelayMin;
    if (Number.isFinite(botDelayMax)) this.botDelayMax = botDelayMax;
    if (Number.isFinite(pauseScale)) this.pauseScale = pauseScale;
  }

  // -------------------------------------------------------------- helpers

  async pause(ms) {
    if (this.aborted) throw new GameAborted();
    const wait = Math.round(ms * this.pauseScale);
    if (!wait || wait <= 0) return;
    await sleep(wait);
    if (this.aborted) throw new GameAborted();
  }

  throwIfAborted() {
    if (this.aborted) throw new GameAborted();
  }

  abort() {
    this.aborted = true;
    for (const resolve of this.actionResolvers.values()) resolve(null);
    this.actionResolvers.clear();
  }

  nextIndexWithChips(from) {
    const total = this.players.length;
    for (let k = 0; k < total; k += 1) {
      const index = ((from + k) % total + total) % total;
      if (this.players[index].stack > 0) return index;
    }
    return -1;
  }

  nextLiveIndex(from) {
    const total = this.players.length;
    for (let k = 0; k < total; k += 1) {
      const index = ((from + k) % total + total) % total;
      const p = this.players[index];
      if (!p.out && !p.folded) return index;
    }
    return -1;
  }

  firstPostflopIndex() {
    return this.nextLiveIndex(this.dealerIndex + 1);
  }

  livePlayers() {
    return this.players.filter((p) => !p.folded && !p.out);
  }

  countLive() {
    return this.livePlayers().length;
  }

  countCanAct() {
    return this.players.filter((p) => !p.folded && !p.out && !p.allIn).length;
  }

  totalPot() {
    return this.players.reduce((sum, p) => sum + p.committed, 0);
  }

  orderFromDealer() {
    const order = [];
    for (let k = 1; k <= this.players.length; k += 1) {
      const index = (this.dealerIndex + k) % this.players.length;
      if (!this.players[index].out) order.push(index);
    }
    return order;
  }

  seatOrderMap() {
    const order = this.orderFromDealer();
    return new Map(order.map((playerIndex, rank) => [this.players[playerIndex].id, rank]));
  }

  // ---------------------------------------------------------------- chips

  commit(player, amount) {
    const paid = Math.max(0, Math.min(amount, player.stack));
    player.stack -= paid;
    player.bet += paid;
    player.committed += paid;
    if (player.stack === 0 && paid > 0) player.allIn = true;
    return paid;
  }

  postBlind(player, amount, kind) {
    const paid = this.commit(player, amount);
    player.lastAction = kind;
    player.acted = false;
    this.pushLog(
      `${player.name} paga ${kind === 'sb' ? 'small blind' : 'big blind'} ${formatChips(paid)}`,
      'blind',
    );
    return paid;
  }

  // ------------------------------------------------------------ hand setup

  async playHand() {
    if (this.aborted) throw new GameAborted();

    const ready = this.players.filter((p) => p.stack > 0);
    if (ready.length < 2) return { gameOver: true };

    this.handNumber += 1;
    this.board = [];
    this.deck = shuffleInPlace(createDeck());
    this.street = 'preflop';
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.raisesThisStreet = 0;
    this.results = null;
    this.lastAction = null;
    this.pendingOptions = null;
    this.activePlayerId = null;
    this.sbIndex = null;
    this.bbIndex = null;

    for (const p of this.players) {
      p.hole = [];
      p.bet = 0;
      p.committed = 0;
      p.out = p.stack <= 0;
      p.folded = p.out;
      p.allIn = false;
      p.acted = false;
      p.lastAction = null;
      p.revealed = false;
      p.handResult = null;
      p.won = 0;
      p.isWinner = false;
    }

    this.dealerIndex = this.nextIndexWithChips(this.dealerIndex + 1);
    if (this.dealerIndex < 0) return { gameOver: true };

    const aliveCount = this.players.filter((p) => !p.out).length;
    let firstIndex;
    if (aliveCount === 2) {
      this.sbIndex = this.dealerIndex;
      this.bbIndex = this.nextIndexWithChips(this.sbIndex + 1);
      firstIndex = this.sbIndex;
    } else {
      this.sbIndex = this.nextIndexWithChips(this.dealerIndex + 1);
      this.bbIndex = this.nextIndexWithChips(this.sbIndex + 1);
      firstIndex = this.nextIndexWithChips(this.bbIndex + 1);
    }

    const dealer = this.players[this.dealerIndex];
    this.pushLog(`Mão #${this.handNumber} · ${dealer.name} no botão`, 'hand');
    this.emit('hand-start');

    this.postBlind(this.players[this.sbIndex], this.smallBlind, 'sb');
    this.postBlind(this.players[this.bbIndex], this.bigBlind, 'bb');
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;
    this.emit('blinds');

    // Deal two cards to every live player, starting after the dealer.
    const dealOrder = [];
    for (let k = 1; k <= this.players.length; k += 1) {
      const index = (this.dealerIndex + k) % this.players.length;
      if (!this.players[index].out) dealOrder.push(index);
    }
    for (let round = 0; round < 2; round += 1) {
      for (const index of dealOrder) {
        this.players[index].hole.push(this.deck.pop());
      }
    }
    this.emit('deal');
    await this.pause(420);

    await this.bettingRound(firstIndex);

    const plan = [
      ['flop', 3],
      ['turn', 1],
      ['river', 1],
    ];

    for (const [streetName, cardCount] of plan) {
      if (this.countLive() <= 1) break;

      for (const p of this.players) {
        p.bet = 0;
        p.lastAction = null;
        p.acted = false;
      }
      this.currentBet = 0;
      this.minRaise = this.bigBlind;
      this.raisesThisStreet = 0;
      this.deck.pop(); // burn
      for (let k = 0; k < cardCount; k += 1) this.board.push(this.deck.pop());
      this.street = streetName;
      this.emit('street');
      await this.pause(560);

      if (this.countCanAct() >= 2) {
        await this.bettingRound(this.firstPostflopIndex());
      }
    }

    return this.finishHand();
  }

  // -------------------------------------------------------------- actions

  getOptions(player) {
    const toCall = Math.min(Math.max(0, this.currentBet - player.bet), player.stack);
    const maxRaiseTo = player.bet + player.stack;
    const canRaise = !player.allIn && maxRaiseTo > this.currentBet;
    let minRaiseTo = 0;
    if (canRaise) {
      minRaiseTo = Math.min(maxRaiseTo, Math.max(this.currentBet + this.minRaise, this.currentBet + 1));
    }
    return {
      playerId: player.id,
      toCall,
      callAmount: toCall,
      canCheck: toCall === 0,
      canRaise,
      minRaiseTo,
      maxRaiseTo: canRaise ? maxRaiseTo : 0,
      stack: player.stack,
      pot: this.totalPot(),
      currentBet: this.currentBet,
      bigBlind: this.bigBlind,
    };
  }

  buildBotContext(player, options) {
    return {
      hole: player.hole,
      board: this.board,
      street: this.street,
      pot: options.pot,
      toCall: options.toCall,
      stack: player.stack,
      bet: player.bet,
      currentBet: this.currentBet,
      minRaiseTo: options.minRaiseTo,
      maxRaiseTo: options.maxRaiseTo,
      canRaise: options.canRaise,
      canCheck: options.canCheck,
      opponents: Math.max(1, this.countLive() - 1),
      raisesThisStreet: this.raisesThisStreet,
      bigBlind: this.bigBlind,
      difficulty: this.difficulty,
      strategy: player.strategy,
      rng: Math.random,
    };
  }

  async takeTurn(player) {
    this.activePlayerId = player.id;
    const options = this.getOptions(player);
    this.pendingOptions = player.isHuman ? options : null;
    this.emit('turn', { playerId: player.id });

    let action;
    if (player.isHuman) {
      const pending = this.waitForHuman(player.id);
      this.emit('human-turn', { playerId: player.id, options });
      action = await pending;
      this.throwIfAborted();
    } else {
      await this.pause(randBetween(this.botDelayMin, this.botDelayMax));
      action = decideBotAction(this.buildBotContext(player, options));
    }

    this.pendingOptions = null;
    this.activePlayerId = null;

    if (!action) action = options.canCheck ? { type: 'check' } : { type: 'fold' };
    this.applyAction(player, action);
  }

  waitForHuman(playerId) {
    return new Promise((resolve) => {
      this.actionResolvers.set(playerId, resolve);
    });
  }

  submitAction(playerId, maybeAction) {
    let target = playerId;
    let action = maybeAction;
    if (playerId && typeof playerId === 'object') {
      action = playerId;
      target = this.activePlayerId;
    }
    if (!target) return false;
    const resolve = this.actionResolvers.get(target);
    if (!resolve) return false;
    this.actionResolvers.delete(target);
    resolve(action);
    return true;
  }

  emitReaction(playerId, text) {
    const player = this.players.find((p) => p.id === playerId);
    const clean = String(text || '').trim().slice(0, 40);
    if (!player || !clean) return false;
    this.emit('reaction', {
      playerId,
      text: clean,
      reactionId: (this.reactionSeq += 1),
    });
    return true;
  }

  /** Reaction sent by a human player (rate limited). */
  react(playerId, text) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return false;
    const now = Date.now();
    if (now - (this.lastReactionAt.get(playerId) || 0) < REACTION_COOLDOWN_MS) return false;
    this.lastReactionAt.set(playerId, now);
    return this.emitReaction(playerId, text);
  }

  submitReaction(text) {
    return this.react(this.viewerId, text);
  }

  /** One spontaneous bot reaction per hand, with a per-action probability. */
  botReact(player, kind, chance) {
    if (!player || player.isHuman) return false;
    if (this.botReactionHand.get(player.id) === this.handNumber) return false;
    if (Math.random() > chance) return false;
    this.botReactionHand.set(player.id, this.handNumber);
    return this.emitReaction(player.id, pickBotReaction(kind));
  }

  /** A disconnected human regained connection: hand control back to them. */
  reconnectPlayer(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.isHuman) return false;
    player.isHuman = true;
    player.strategy = null;
    player.leaveAfterHand = false;
    this.pushLog(`${player.name} reconectou`, 'info');
    this.emit('player-joined', { playerId });
    return true;
  }

  /** A human left mid-hand: keep the seat but let a bot finish the hand. */
  replaceWithBot(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || !player.isHuman) return false;
    player.isHuman = false;
    player.leaveAfterHand = true;
    if (!player.strategy) {
      player.strategy = { aggression: 0.5, tightness: 0.5, bluff: 0.1, style: 'Ausente' };
    }
    this.pushLog(`${player.name} saiu da mesa`, 'info');
    const pending = this.actionResolvers.get(playerId);
    if (pending) {
      this.actionResolvers.delete(playerId);
      pending({ type: 'fold' });
    }
    this.emit('player-left', { playerId });
    return true;
  }

  applyAction(player, rawAction) {
    const options = this.getOptions(player);
    let type = rawAction.type;
    const toCall = options.toCall;
    let totalBet = player.bet;
    let paid = 0;

    if (type === 'raise' || type === 'allin') {
      let target = type === 'allin' ? options.maxRaiseTo : Math.round(Number(rawAction.amount) || 0);
      target = Math.min(Math.max(target, 0), options.maxRaiseTo);
      if (target <= player.bet) {
        type = toCall > 0 ? 'call' : 'check';
      } else if (target <= this.currentBet) {
        type = 'call';
      } else {
        paid = this.commit(player, target - player.bet);
        const increment = target - this.currentBet;
        if (increment >= this.minRaise) this.minRaise = increment;
        this.currentBet = target;
        this.raisesThisStreet += 1;
        totalBet = player.bet;
        type = player.allIn ? 'allin' : 'raise';
      }
    }

    if (type === 'fold') {
      player.folded = true;
      player.lastAction = 'fold';
    } else if (type === 'check') {
      if (toCall > 0) {
        paid = this.commit(player, toCall);
        type = player.allIn ? 'allin' : 'call';
      }
      player.lastAction = type;
    } else if (type === 'call') {
      paid = this.commit(player, toCall);
      type = player.allIn ? 'allin' : 'call';
      player.lastAction = type;
    } else {
      player.lastAction = type;
    }

    player.acted = true;

    let text;
    if (type === 'fold') text = `${player.name} desiste`;
    else if (type === 'check') text = `${player.name} passa`;
    else if (type === 'call') text = `${player.name} paga ${formatChips(paid)}`;
    else if (type === 'raise') text = `${player.name} sobe para ${formatChips(totalBet)}`;
    else text = `${player.name} vai all-in${totalBet > 0 ? ` (${formatChips(totalBet)})` : ''}`;

    this.pushLog(text, type);
    this.lastAction = { playerId: player.id, type, amount: totalBet || paid };
    this.emit('action', { playerId: player.id, action: type, amount: totalBet || paid });

    if (!player.isHuman) {
      const chances = { fold: 0.3, raise: 0.22, allin: 0.55, call: 0.06, check: 0.05 };
      this.botReact(player, type, chances[type] ?? 0.04);
    }
  }

  async bettingRound(startIndex) {
    const total = this.players.length;
    let index = startIndex;
    let guard = 0;

    while (guard < 500) {
      guard += 1;
      this.throwIfAborted();

      const live = this.livePlayers();
      if (live.length <= 1) break;
      const canAct = live.filter((p) => !p.allIn);
      if (canAct.length === 0) break;
      if (canAct.every((p) => p.acted && p.bet >= this.currentBet)) break;

      const player = this.players[index];
      index = (index + 1) % total;

      if (!player || player.out || player.folded || player.allIn) continue;
      if (player.acted && player.bet >= this.currentBet) continue;

      await this.takeTurn(player);
    }
  }

  // ------------------------------------------------------------- showdown

  buildSidePots(live) {
    const levels = [...new Set(this.players.filter((p) => p.committed > 0).map((p) => p.committed))].sort(
      (a, b) => a - b,
    );
    const pots = [];
    let previous = 0;

    for (const level of levels) {
      let amount = 0;
      for (const p of this.players) {
        amount += Math.max(0, Math.min(p.committed, level) - Math.min(p.committed, previous));
      }
      let eligible = this.players.filter((p) => !p.folded && !p.out && p.committed >= level);
      if (!eligible.length) eligible = live;
      if (amount > 0) pots.push({ amount, eligible, level });
      previous = level;
    }
    return pots;
  }

  awardPot(live, showdown) {
    for (const p of live) {
      if (showdown && !p.handResult) p.handResult = evaluate([...p.hole, ...this.board]);
    }

    const totalPot = this.totalPot();
    const pots = this.buildSidePots(live);
    const potResults = [];
    const orderMap = this.seatOrderMap();

    for (const pot of pots) {
      let best = -Infinity;
      let winners = [];
      for (const p of pot.eligible) {
        const value = p.handResult ? p.handResult.value : -1;
        if (value > best) {
          best = value;
          winners = [p];
        } else if (value === best) {
          winners.push(p);
        }
      }
      if (!winners.length) winners = [live[0] || this.players.find((p) => !p.folded)];
      winners.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

      const share = Math.floor(pot.amount / winners.length);
      let extra = pot.amount - share * winners.length;
      const payouts = [];
      for (const winner of winners) {
        const amount = share + (extra > 0 ? 1 : 0);
        if (extra > 0) extra -= 1;
        winner.stack += amount;
        winner.won += amount;
        winner.isWinner = true;
        if (showdown) winner.revealed = true;
        payouts.push({ playerId: winner.id, amount });
      }
      potResults.push({
        amount: pot.amount,
        level: pot.level,
        winners: winners.map((w) => w.id),
        payouts,
      });
    }

    const winnerIds = [...new Set(potResults.flatMap((pot) => pot.winners))];
    for (const id of winnerIds) {
      const player = this.players.find((p) => p.id === id);
      const handText = showdown && player.handResult ? ` com ${player.handResult.description}` : '';
      this.pushLog(`${player.name} leva ${formatChips(player.won)}${handText}`, 'win');
    }

    this.results = {
      showdown,
      totalPot,
      pots: potResults,
      winners: winnerIds.map((id) => {
        const player = this.players.find((p) => p.id === id);
        return {
          id,
          name: player.name,
          avatar: player.avatar,
          amount: player.won,
          handName: player.handResult ? player.handResult.name : null,
          handDetail: player.handResult ? player.handResult.description : null,
        };
      }),
    };

    for (const p of this.players) {
      p.committed = 0;
      p.bet = 0;
    }

    return this.results;
  }

  async finishHand() {
    const live = this.livePlayers();
    let showdown = false;

    if (live.length > 1) {
      showdown = true;
      for (const p of live) {
        p.revealed = true;
        p.handResult = evaluate([...p.hole, ...this.board]);
      }
      this.street = 'showdown';
      this.emit('showdown');
      await this.pause(900);
    } else {
      this.street = 'showdown';
    }

    const results = this.awardPot(live, showdown);

    if (showdown) {
      const bots = this.players.filter((p) => !p.isHuman && !p.out && p.revealed);
      const botWinners = bots.filter((p) => p.won > 0);
      if (botWinners.length) this.botReact(botWinners[0], 'win', 0.8);
      const botLosers = bots.filter((p) => p.won === 0);
      if (botLosers.length) {
        this.botReact(botLosers[Math.floor(Math.random() * botLosers.length)], 'lose', 0.3);
      }
    } else {
      const botWinner = this.players.find((p) => !p.isHuman && p.isWinner);
      if (botWinner) this.botReact(botWinner, 'win', 0.65);
    }

    this.street = 'hand-end';
    this.emit('hand-end', { results });
    await this.pause(1700);

    return {
      gameOver: this.isGameOver(),
      results,
    };
  }

  isGameOver() {
    const withChips = this.players.filter((p) => p.stack > 0).length;
    if (withChips < 2) return true;
    if (!this.hadHumans) return false;
    return this.players.filter((p) => p.isHuman && p.stack > 0).length === 0;
  }
}
