import { SUITS, rankSymbol, formatChips, isJoker } from './cards.js';
import { evaluateBest } from './evaluator.js';
import { sfx } from './audio.js';
import { REACTION_GROUPS } from './reactions.js';
import { POWER_BY_ID } from './variants.js';

const STREET_LABELS = {
  preflop: 'Pré-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  'hand-end': 'Fim da mão',
};

const SEAT_LAYOUTS = {
  2: [[50, 85], [50, 13]],
  3: [[50, 85], [14, 38], [86, 38]],
  4: [[50, 85], [11, 52], [50, 12], [89, 52]],
  5: [[50, 85], [9, 58], [23, 14], [77, 14], [91, 58]],
  6: [[50, 85], [8, 61], [17, 16], [50, 11.5], [83, 16], [92, 61]],
};

// Narrow screens get a clean row of bots across the top, board in the middle.
const MOBILE_SEAT_LAYOUTS = {
  2: [[50, 84], [50, 17]],
  3: [[50, 84], [27, 17], [73, 17]],
  4: [[50, 84], [17, 17], [50, 17], [83, 17]],
  5: [[50, 84], [12, 17], [37, 17], [63, 17], [88, 17]],
  6: [[50, 84], [10, 17], [30, 17], [50, 17], [70, 17], [90, 17]],
};


const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function cardMarkup(card, index, noAnim = false) {
  const suit = SUITS[card.s];
  if (isJoker(card)) {
    return `<div class="card card--joker${noAnim ? ' no-anim' : ''}" style="--i:${index}">
      <span class="card__rank">★</span>
      <span class="card__suit">${suit.symbol}</span>
      <span class="card__joker">CURINGA</span>
    </div>`;
  }
  return `<div class="card${suit.color === 'red' ? ' card--red' : ''}${noAnim ? ' no-anim' : ''}" style="--i:${index}">
    <span class="card__rank">${rankSymbol(card.r)}</span>
    <span class="card__suit">${suit.symbol}</span>
  </div>`;
}

function backMarkup(index) {
  return `<div class="card card--back" style="--i:${index}"></div>`;
}

const CHIP_STYLES = [
  { value: 1000, color: 'gold' },
  { value: 500, color: 'purple' },
  { value: 100, color: 'black' },
  { value: 25, color: 'green' },
  { value: 5, color: 'red' },
  { value: 1, color: 'white' },
];

function chipBreakdown(amount, maxChips) {
  let remaining = Math.max(0, Math.round(amount));
  const chips = [];
  for (const chip of CHIP_STYLES) {
    while (remaining >= chip.value && chips.length < maxChips) {
      chips.push(chip);
      remaining -= chip.value;
    }
    if (chips.length >= maxChips) break;
  }
  if (!chips.length && amount > 0) chips.push(CHIP_STYLES[CHIP_STYLES.length - 1]);
  return chips;
}

function chipMarkup(chip, index) {
  return `<span class="chip chip--${chip.color}" style="--i:${index}"></span>`;
}

function betChipsMarkup(amount) {
  if (!amount) return '';
  return chipBreakdown(amount, 3).map(chipMarkup).join('');
}

function potChipsMarkup(amount) {
  if (amount <= 0) return '';
  const chips = chipBreakdown(amount, 9);
  const columns = [[], [], []];
  chips.forEach((chip, index) => columns[index % 3].push(chip));
  return columns
    .filter((column) => column.length)
    .map((column) => `<span class="chip-stack">${column.map(chipMarkup).join('')}</span>`)
    .join('');
}

export class PokerUI {
  constructor(doc = document) {
    this.doc = doc;
    this.game = null;
    this.viewerId = null;
    this.state = null;
    this.options = null;
    this.seatNodes = new Map();
    this.seatIds = '';
    this.layoutKey = '';
    this.boardSig = '__empty__';
    this.prevBoardLen = 0;
    this.lastLogId = 0;
    this.lastPot = 0;
    this.raiseKey = '';
    this.lastReactionSent = 0;
    this.lastDraftSig = '';
    this.reactionGroup = 'emojis';
    this.onPower = null;
    this.onMarket = null;
    this.onDraft = null;

    this.el = {
      seats: doc.getElementById('seats'),
      board: doc.getElementById('board'),
      pot: doc.getElementById('pot'),
      potValue: doc.getElementById('pot-value'),
      potChips: doc.getElementById('pot-chips'),
      street: doc.getElementById('street-label'),
      log: doc.getElementById('log'),
      handNumber: doc.getElementById('hand-number'),
      blindLabel: doc.getElementById('blind-label'),
      turnStatus: doc.getElementById('turn-status'),
      turnInfo: doc.getElementById('turn-info'),
      handHint: doc.getElementById('hand-hint'),
      btnFold: doc.getElementById('btn-fold'),
      btnCheck: doc.getElementById('btn-check'),
      btnCall: doc.getElementById('btn-call'),
      callAmount: doc.getElementById('call-amount'),
      btnRaise: doc.getElementById('btn-raise'),
      raisePanel: doc.getElementById('raise-panel'),
      raiseSlider: doc.getElementById('raise-slider'),
      raiseValue: doc.getElementById('raise-value'),
      raiseLabel: doc.getElementById('raise-label'),
      reactionBox: doc.getElementById('reaction-box'),
      reactionBtn: doc.getElementById('reaction-btn'),
      reactionPopover: doc.getElementById('reaction-popover'),
      reactionFeed: doc.getElementById('reaction-feed'),
      powerTray: doc.getElementById('power-tray'),
      powerIntel: doc.getElementById('power-intel'),
      marketBtn: doc.getElementById('market-btn'),
    };

    this.quickButtons = Array.from(doc.querySelectorAll('.quick'));
    this.buildReactionPicker();
    this.bindInputs();
    this.bindVariantControls();

    window.addEventListener('resize', () => {
      if (!this.state) return;
      this.layoutKey = '';
      this.render(this.state);
    });
  }

  // ------------------------------------------------------------- lifecycle

  bindGame(game, viewerId = null) {
    this.game = game;
    this.viewerId = viewerId;
    this.reset();
    this.el.blindLabel.textContent = `${formatChips(game.smallBlind)} / ${formatChips(game.bigBlind)}`;
  }

  reset() {
    for (const node of this.seatNodes.values()) clearTimeout(node.reactionTimer);
    clearTimeout(this.feedTimer);
    this.el.reactionFeed.classList.remove('show');
    this.el.reactionFeed.innerHTML = '';
    this.setReactionPicker(false);
    this.state = null;
    this.options = null;
    this.seatNodes.clear();
    this.seatIds = '';
    this.layoutKey = '';
    this.boardSig = '__empty__';
    this.prevBoardLen = 0;
    this.lastLogId = 0;
    this.lastPot = 0;
    this.raiseKey = '';

    this.el.seats.innerHTML = '';
    this.el.board.innerHTML = '';
    this.el.log.innerHTML = '';
    this.el.handNumber.textContent = '—';
    this.el.potValue.textContent = '0';
    this.el.potChips.innerHTML = '';
    this.el.street.textContent = 'Aguardando';
    this.el.handHint.textContent = '';
    this.el.turnInfo.textContent = 'Aguardando o início…';
    this.el.turnStatus.classList.remove('is-turn', 'is-win', 'is-loss');
    this.el.pot.classList.remove('bump');
    this.setEnabled(false);
    this.quickButtons.forEach((button) => {
      button.disabled = true;
    });
    this.el.btnCheck.hidden = true;
    this.el.btnCall.hidden = false;
    this.el.callAmount.textContent = '';
    this.el.raisePanel.classList.add('is-hidden');
    this.el.btnRaise.textContent = 'Apostar';
    this.lastDraftSig = '';
    if (this.el.powerTray) {
      this.el.powerTray.innerHTML = '';
      this.el.powerTray.hidden = true;
    }
    if (this.el.powerIntel) {
      this.el.powerIntel.innerHTML = '';
      this.el.powerIntel.hidden = true;
    }
    if (this.el.marketBtn) this.el.marketBtn.hidden = true;
    if (this.onDraft) this.onDraft(null);
  }

  bindVariantControls() {
    if (this.el.powerTray) {
      this.el.powerTray.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-power]');
        if (!button || button.disabled) return;
        const power = POWER_BY_ID.get(button.dataset.power);
        if (power && this.onPower) this.onPower(power);
      });
    }
    if (this.el.marketBtn) {
      this.el.marketBtn.addEventListener('click', () => {
        if (this.onMarket) this.onMarket();
      });
    }
  }

  syncVariantControls(state) {
    const arcana = state.arcana;
    const me = state.players.find((player) => player.isMe);
    const powers =
      arcana && Array.isArray(arcana.powers) && !(me && me.folded) && state.street !== 'hand-end'
        ? arcana.powers
        : [];
    if (this.el.powerTray) {
      this.el.powerTray.hidden = powers.length === 0;
      this.el.powerTray.innerHTML = powers
        .map((power) => {
          const info = POWER_BY_ID.get(power.id) || power;
          return `<button class="power-chip" type="button" data-power="${power.id}" title="${info.description}">
            <span class="power-chip__icon">${info.icon}</span>
            <span class="power-chip__name">${info.name}</span>
          </button>`;
        })
        .join('');
    }

    if (this.el.powerIntel) {
      const intel = (arcana && arcana.intel) || (state.market && state.market.intel) || null;
      const lines = [];
      if (intel && intel.vision) {
        lines.push(`👁️ Próxima carta: ${this.cardText(intel.vision)}`);
      }
      if (intel && Array.isArray(intel.deckPeek) && intel.deckPeek.length) {
        lines.push(`🔮 Topo do baralho: ${intel.deckPeek.map((card) => this.cardText(card)).join(' · ')}`);
      }
      if (intel && intel.mirror) {
        lines.push(`🪞 ${intel.mirror.name}: ${this.cardText(intel.mirror.card)}`);
      }
      if (intel && intel.read) {
        lines.push(`🧠 ${intel.read.name}: ${intel.read.handName}`);
      }
      if (arcana && arcana.ghost) lines.push('👻 Fantasma ativo');
      if (arcana && arcana.tie) lines.push('🤝 Empate armado');
      this.el.powerIntel.hidden = lines.length === 0;
      this.el.powerIntel.innerHTML = lines.map((line) => `<span>${line}</span>`).join('');
    }

    if (this.el.marketBtn) {
      const market = state.market;
      this.el.marketBtn.hidden = !market || state.street === 'hand-end';
      if (market) {
        this.el.marketBtn.disabled = !market.canBuy;
        this.el.marketBtn.textContent = market.bought ? '🛒 Compra feita' : '🛒 Mercado';
        this.el.marketBtn.title = market.canBuy
          ? 'Abrir o mercado desta mão'
          : market.bought
            ? 'Você já comprou nesta mão'
            : 'O mercado abre na sua vez';
      }
    }

    if (this.onDraft) {
      const draft = arcana && arcana.draft ? arcana.draft : null;
      const signature = draft
        ? `${state.handNumber}:${draft.offer.map((card) => card.id).join(',')}:${draft.picks.join(',')}`
        : '';
      if (signature !== this.lastDraftSig) {
        this.lastDraftSig = signature;
        this.onDraft(draft);
      }
    }
  }

  cardText(card) {
    if (!card) return '—';
    if (isJoker(card)) return `★${SUITS[card.s].symbol}`;
    return `${rankSymbol(card.r)}${SUITS[card.s].symbol}`;
  }

  handleEvent(event) {
    if (!event || !event.state) return;
    this.state = event.state;
    this.render(event.state);
    this.syncVariantControls(event.state);
    if (event.type === 'reaction') this.showReaction(event.playerId, event.text);
    if (event.type === 'hand-start') this.clearReactions();
    this.playSound(event);
  }

  // --------------------------------------------------------------- reactions

  buildReactionPicker() {
    const popover = this.el.reactionPopover;
    popover.innerHTML = `
      <div class="reaction-head">
        <span class="reaction-title">Reações</span>
        <button class="reaction-close" type="button" title="Fechar reações" aria-label="Fechar reações">✕</button>
      </div>
      <div class="reaction-tabs" role="tablist">
        ${REACTION_GROUPS.map(
          (group) =>
            `<button type="button" role="tab" data-group="${group.id}" class="${group.id === this.reactionGroup ? 'selected' : ''}">${group.label}</button>`,
        ).join('')}
      </div>
      <div class="reaction-panels"></div>
    `;

    const panels = popover.querySelector('.reaction-panels');
    for (const group of REACTION_GROUPS) {
      const panel = this.doc.createElement('div');
      panel.className = 'reaction-panel';
      panel.dataset.panel = group.id;
      panel.hidden = group.id !== this.reactionGroup;
      for (const reaction of group.items) {
        const button = this.doc.createElement('button');
        button.type = 'button';
        button.className = 'reaction-item';
        button.textContent = reaction;
        button.dataset.reaction = reaction;
        if (group.id === 'phrases') button.classList.add('is-phrase');
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          if (this.sendReaction(reaction)) this.setReactionPicker(false);
        });
        panel.appendChild(button);
      }
      panels.appendChild(panel);
    }

    popover.querySelector('.reaction-tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-group]');
      if (!tab) return;
      event.stopPropagation();
      this.setReactionGroup(tab.dataset.group);
    });
    popover.querySelector('.reaction-close').addEventListener('click', (event) => {
      event.stopPropagation();
      this.setReactionPicker(false);
    });
  }

  setReactionGroup(id) {
    if (!REACTION_GROUPS.some((group) => group.id === id)) return;
    this.reactionGroup = id;
    this.el.reactionPopover.querySelectorAll('.reaction-tabs [data-group]').forEach((tab) => {
      tab.classList.toggle('selected', tab.dataset.group === id);
    });
    this.el.reactionPopover.querySelectorAll('.reaction-panel').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== id;
    });
    const panel = this.el.reactionPopover.querySelector(`.reaction-panel[data-panel="${id}"]`);
    if (panel) panel.scrollTop = 0;
  }

  setReactionPicker(open) {
    this.el.reactionPopover.classList.toggle('hidden', !open);
    this.el.reactionBtn.classList.toggle('is-open', !!open);
    if (open) this.setReactionGroup(this.reactionGroup);
  }

  sendReaction(text) {
    if (!this.game || typeof this.game.submitReaction !== 'function') return false;
    const now = Date.now();
    if (now - this.lastReactionSent < 1300) return false;
    this.lastReactionSent = now;
    this.game.submitReaction(text);
    return true;
  }

  showReaction(playerId, text) {
    const node = this.seatNodes.get(playerId);
    if (!node || !text) return;
    const player = this.state && this.state.players.find((p) => p.id === playerId);
    node.refs.reaction.textContent = text;
    node.el.classList.add('is-reacting');
    clearTimeout(node.reactionTimer);
    node.reactionTimer = setTimeout(() => {
      node.el.classList.remove('is-reacting');
    }, 5500);

    const feed = this.el.reactionFeed;
    feed.innerHTML = '';
    const avatar = this.doc.createElement('span');
    avatar.className = 'rf-avatar';
    avatar.textContent = (player && player.avatar) || '🙂';
    const name = this.doc.createElement('span');
    name.className = 'rf-name';
    name.textContent = (player && player.name) || 'Mesa';
    const body = this.doc.createElement('span');
    body.className = 'rf-text';
    body.textContent = text;
    feed.append(avatar, name, body);
    feed.classList.add('show');
    clearTimeout(this.feedTimer);
    this.feedTimer = setTimeout(() => {
      feed.classList.remove('show');
    }, 5500);
  }

  clearReactions() {
    clearTimeout(this.feedTimer);
    this.el.reactionFeed.classList.remove('show');
    this.el.reactionFeed.innerHTML = '';
    for (const node of this.seatNodes.values()) {
      clearTimeout(node.reactionTimer);
      node.el.classList.remove('is-reacting');
    }
  }

  // ---------------------------------------------------------------- render

  render(state) {
    this.el.handNumber.textContent = state.handNumber ? `#${state.handNumber}` : '—';
    this.renderSeats(state);
    this.renderBoard(state);
    this.renderCenter(state);
    this.renderLog(state);
    this.renderControls(state);
    this.renderHandHint(state);
  }

  renderSeats(state) {
    const ids = state.players.map((p) => p.id).join('|');
    if (ids !== this.seatIds) {
      this.seatIds = ids;
      this.layoutKey = '';
      this.seatNodes.clear();
      this.el.seats.innerHTML = '';

      state.players.forEach((player) => {
        const el = this.doc.createElement('div');
        el.className = 'seat';
        el.innerHTML = `
          <div class="seat-hand"></div>
          <div class="seat-plate">
            <div class="seat-avatar"></div>
            <div class="seat-meta">
              <div class="seat-name"><span class="seat-name-text"></span><span class="seat-you">você</span><span class="seat-dealer">D</span></div>
              <div class="seat-stack"></div>
            </div>
            <div class="seat-bet"><span class="bet-chips"></span><span class="seat-bet-value"></span></div>
            <div class="seat-win"></div>
          </div>
          <div class="seat-status">All-in</div>
          <div class="seat-handname"></div>
          <div class="seat-reaction"></div>
        `;
        const refs = {
          hand: el.querySelector('.seat-hand'),
          avatar: el.querySelector('.seat-avatar'),
          name: el.querySelector('.seat-name-text'),
          you: el.querySelector('.seat-you'),
          stack: el.querySelector('.seat-stack'),
          bet: el.querySelector('.seat-bet'),
          betChips: el.querySelector('.bet-chips'),
          betValue: el.querySelector('.seat-bet-value'),
          handname: el.querySelector('.seat-handname'),
          reaction: el.querySelector('.seat-reaction'),
          win: el.querySelector('.seat-win'),
        };
        this.el.seats.appendChild(el);
        this.seatNodes.set(player.id, { el, refs, cardSig: '', betSig: '' });
      });
    }

    this.el.seats.dataset.count = String(state.players.length);
    this.applySeatLayout(state);

    for (const player of state.players) {
      const node = this.seatNodes.get(player.id);
      if (!node) continue;
      this.updateSeat(node, player, state);
    }
  }

  applySeatLayout(state) {
    const count = state.players.length;
    const width = this.el.seats.clientWidth || 900;
    const useOval = width >= 880;
    const rowSeat = Math.max(56, Math.min(96, Math.floor((width / count) * 0.84)));
    this.el.seats.style.setProperty('--row-seat', `${rowSeat}px`);
    this.el.seats.style.setProperty('--row-seat-human', `${Math.min(rowSeat + 26, 118)}px`);
    this.el.seats.dataset.layout = useOval ? 'oval' : 'row';

    const layout = (useOval ? SEAT_LAYOUTS : MOBILE_SEAT_LAYOUTS)[count] || [];
    const key = `${count}:${useOval ? 'oval' : 'row'}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;

    state.players.forEach((player, index) => {
      const node = this.seatNodes.get(player.id);
      if (!node) return;
      const [x, y] = layout[index] || [50, 50];
      node.el.style.left = `${x}%`;
      node.el.style.top = `${y}%`;
      node.el.dataset.orient = y >= 50 ? 'bottom' : 'top';
      node.el.dataset.side = x > 65 ? 'right' : x < 35 ? 'left' : 'center';
      node.el.dataset.seatIndex = String(index);
    });
  }

  updateSeat(node, player, state) {
    const { el, refs } = node;
    const isMe = !!player.isMe;
    el.classList.toggle('is-me', isMe);
    el.classList.toggle('is-human', isMe);
    el.classList.toggle('is-active', !!player.active);
    el.classList.toggle('is-folded', player.folded && !player.out);
    el.classList.toggle('is-out', player.out);
    el.classList.toggle('is-allin', player.allIn);
    el.classList.toggle('is-dealer', player.isDealer);
    el.classList.toggle('is-winner', player.isWinner && state.street === 'hand-end');
    el.classList.toggle('is-showdown', !!player.handName);

    refs.avatar.textContent = player.avatar;
    refs.name.textContent = player.name;
    refs.you.hidden = !isMe || player.name === 'Você';
    refs.stack.textContent = formatChips(player.stack);
    refs.stack.classList.toggle('low', player.stack > 0 && player.stack <= state.bigBlind * 3);
    const betSig = String(player.bet);
    if (betSig !== node.betSig) {
      node.betSig = betSig;
      refs.betValue.textContent = formatChips(player.bet);
      refs.betChips.innerHTML = betChipsMarkup(player.bet);
    }
    refs.bet.classList.toggle('show', player.bet > 0);
    refs.handname.textContent = player.handDetail || '';
    refs.win.textContent = player.won > 0 ? `+${formatChips(player.won)}` : '';

    const sig = `${player.hole.map((c) => (c ? `${c.r}${c.s}` : 'x')).join(',')}:${player.revealed ? 'r' : 'h'}`;
    if (sig !== node.cardSig) {
      node.cardSig = sig;
      refs.hand.innerHTML = player.hole
        .map((card, index) => (card ? cardMarkup(card, index) : backMarkup(index)))
        .join('');
    }
  }

  renderBoard(state) {
    const sig = state.board.map((c) => `${c.r}${c.s}`).join('|');
    if (sig === this.boardSig) return;
    this.boardSig = sig;
    const cards = state.board.map((card, index) => cardMarkup(card, index, index < this.prevBoardLen));
    const slots = [];
    for (let i = state.board.length; i < 5; i += 1) slots.push('<div class="card-slot"></div>');
    this.el.board.innerHTML = cards.join('') + slots.join('');
    this.prevBoardLen = state.board.length;
  }

  renderCenter(state) {
    const isEnd = state.street === 'hand-end' && state.results;
    const pot = isEnd ? state.results.totalPot : state.pot;
    if (pot !== this.lastPot) {
      this.el.potValue.textContent = formatChips(pot);
      this.el.potChips.innerHTML = potChipsMarkup(pot);
      if (pot > this.lastPot) {
        this.el.pot.classList.remove('bump');
        // force reflow so the animation can restart
        void this.el.pot.offsetWidth;
        this.el.pot.classList.add('bump');
      }
      this.lastPot = pot;
    }
    this.el.street.textContent = STREET_LABELS[state.street] || state.street;
  }

  renderLog(state) {
    if (!state.log) return;
    let appended = false;
    for (const entry of state.log) {
      if (entry.id <= this.lastLogId) continue;
      this.lastLogId = entry.id;
      const item = this.doc.createElement('div');
      item.className = `log-item ${entry.kind || 'info'}`;
      const dot = this.doc.createElement('span');
      dot.className = 'log-dot';
      const text = this.doc.createElement('span');
      text.className = 'log-text';
      text.textContent = entry.text;
      item.append(dot, text);
      this.el.log.appendChild(item);
      appended = true;
    }
    if (appended) {
      while (this.el.log.children.length > 140) this.el.log.removeChild(this.el.log.firstChild);
      this.el.log.scrollTop = this.el.log.scrollHeight;
    }
  }

  renderHandHint(state) {
    const human = state.players.find((p) => p.isMe);
    if (!human || !human.hole || human.hole.some((card) => !card)) {
      this.el.handHint.textContent = '';
      return;
    }
    const hole = human.hole.filter(Boolean);
    if (hole.length < 2) {
      this.el.handHint.textContent = '';
      return;
    }
    if (state.board.length >= 3) {
      const result = evaluateBest([...hole, ...state.board]);
      this.el.handHint.innerHTML = `Sua mão: <strong>${result.description}</strong>`;
    } else {
      const cardsText = hole.map((card) => `${rankSymbol(card.r)}${SUITS[card.s].symbol}`).join(' ');
      this.el.handHint.innerHTML = `Sua mão: <strong>${cardsText}</strong>`;
    }
  }

  // -------------------------------------------------------------- controls

  renderControls(state) {
    const human = state.players.find((p) => p.isMe);
    const options = human && state.activePlayerId === human.id ? state.options : null;
    this.options = options;

    const humanTurn = !!options;
    this.el.turnStatus.classList.toggle('is-turn', humanTurn);
    this.el.turnStatus.classList.remove('is-win', 'is-loss');

    if (humanTurn) {
      this.el.turnInfo.textContent = 'Sua vez de agir';
    } else if (state.street === 'hand-end' && state.results) {
      const { winners, totalPot } = state.results;
      const humanWin = winners.find((w) => w.id === (human && human.id));
      if (humanWin) {
        const detail = humanWin.handDetail ? ` · ${humanWin.handDetail}` : '';
        this.el.turnInfo.textContent = `Você levou ${formatChips(humanWin.amount)}${detail}`;
        this.el.turnStatus.classList.add('is-win');
      } else if (winners.length > 1) {
        this.el.turnInfo.textContent = `Pote dividido entre ${winners.map((w) => w.name).join(' e ')}`;
        this.el.turnStatus.classList.add('is-loss');
      } else if (winners.length === 1) {
        const detail = winners[0].handDetail ? ` · ${winners[0].handDetail}` : ' · todos desistiram';
        this.el.turnInfo.textContent = `${winners[0].name} levou ${formatChips(totalPot)}${detail}`;
        this.el.turnStatus.classList.add('is-loss');
      }
    } else if (state.street === 'showdown') {
      this.el.turnInfo.textContent = 'Showdown';
    } else {
      const active = state.players.find((p) => p.id === state.activePlayerId);
      if (active) this.el.turnInfo.textContent = `${active.name} está pensando…`;
      else this.el.turnInfo.textContent = 'Distribuindo cartas…';
    }

    const canAct = humanTurn && !human.folded && !human.out;

    this.el.btnFold.disabled = !canAct;
    this.el.btnCheck.hidden = !canAct || !options.canCheck;
    this.el.btnCheck.disabled = !canAct;
    this.el.btnCall.hidden = !canAct || options.toCall <= 0;
    this.el.btnCall.disabled = !canAct || options.toCall <= 0;
    this.el.callAmount.textContent = options && options.toCall > 0 ? formatChips(options.toCall) : '';

    const canRaise = !!(canAct && options.canRaise);
    this.el.raisePanel.classList.toggle('is-hidden', !canRaise);
    this.el.btnRaise.disabled = !canRaise;
    this.el.btnRaise.textContent = options && options.currentBet > 0 ? 'Subir' : 'Apostar';

    this.el.raiseLabel.textContent = options && options.currentBet > 0 ? 'Subir para' : 'Aposta';
    this.el.raiseSlider.disabled = !canRaise;
    this.quickButtons.forEach((button) => {
      button.disabled = !canRaise;
    });

    if (canRaise) {
      const key = `${options.minRaiseTo}:${options.maxRaiseTo}:${options.currentBet}:${options.pot}`;
      if (key !== this.raiseKey) {
        this.raiseKey = key;
        const base =
          options.currentBet > 0
            ? options.currentBet + options.pot * 0.65
            : Math.max(options.bigBlind, options.pot * 0.65);
        const rounded = Math.round(base / options.bigBlind) * options.bigBlind;
        this.setRaiseValue(clamp(rounded, options.minRaiseTo, options.maxRaiseTo));
      }
    } else {
      this.raiseKey = '';
    }
  }

  setEnabled(enabled) {
    this.el.btnFold.disabled = !enabled;
    this.el.btnCheck.disabled = !enabled;
    this.el.btnCall.disabled = !enabled;
    this.el.btnRaise.disabled = !enabled;
    this.el.raiseSlider.disabled = !enabled;
  }

  setRaiseValue(value) {
    const slider = this.el.raiseSlider;
    if (!this.options || !this.options.canRaise) return;
    slider.min = String(this.options.minRaiseTo);
    slider.max = String(this.options.maxRaiseTo);
    slider.value = String(clamp(Math.round(value), this.options.minRaiseTo, this.options.maxRaiseTo));
    this.syncRaiseUi();
  }

  syncRaiseUi() {
    const slider = this.el.raiseSlider;
    const min = Number(slider.min) || 0;
    const max = Number(slider.max) || 0;
    const value = Number(slider.value) || 0;
    this.el.raiseValue.textContent = formatChips(value);
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 100;
    slider.style.setProperty('--fill', `${clamp(pct, 0, 100)}%`);
  }

  // ---------------------------------------------------------------- inputs

  bindInputs() {
    const submit = (action) => {
      if (!this.game || !this.options) return;
      this.game.submitAction(this.viewerId, action);
    };

    this.el.btnFold.addEventListener('click', () => submit({ type: 'fold' }));
    this.el.btnCheck.addEventListener('click', () => submit({ type: 'check' }));
    this.el.btnCall.addEventListener('click', () => submit({ type: 'call' }));
    this.el.btnRaise.addEventListener('click', () => {
      if (!this.options || !this.options.canRaise) return;
      const amount = Number(this.el.raiseSlider.value);
      submit({ type: 'raise', amount: amount >= this.options.maxRaiseTo ? this.options.maxRaiseTo : amount });
    });

    this.el.raiseSlider.addEventListener('input', () => this.syncRaiseUi());

    this.el.reactionBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setReactionPicker(this.el.reactionPopover.classList.contains('hidden'));
    });

    this.doc.addEventListener('click', (event) => {
      if (!this.el.reactionBox.contains(event.target)) this.setReactionPicker(false);
    });

    this.quickButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (!this.options || !this.options.canRaise) return;
        if (button.dataset.allin) {
          this.setRaiseValue(this.options.maxRaiseTo);
          return;
        }
        const fraction = Number(button.dataset.frac) || 0.5;
        const { currentBet, pot, bigBlind, minRaiseTo, maxRaiseTo } = this.options;
        const base = currentBet > 0 ? currentBet + pot * fraction : pot * fraction;
        const rounded = Math.round(base / bigBlind) * bigBlind;
        this.setRaiseValue(clamp(rounded, minRaiseTo, maxRaiseTo));
      });
    });

    this.doc.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.el.reactionPopover.classList.contains('hidden')) {
        event.preventDefault();
        this.setReactionPicker(false);
        return;
      }
      if (!this.options || !this.game) return;
      if (this.doc.querySelector('.overlay:not(.hidden)')) return;
      const tag = (event.target && event.target.tagName) || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'f') {
        event.preventDefault();
        submit({ type: 'fold' });
      } else if (key === 'm') {
        if (this.options.canCheck) {
          event.preventDefault();
          submit({ type: 'check' });
        }
      } else if (key === 'c') {
        event.preventDefault();
        submit({ type: this.options.toCall > 0 ? 'call' : 'check' });
      } else if (key === 'r') {
        if (this.options.canRaise) {
          event.preventDefault();
          const amount = Number(this.el.raiseSlider.value);
          submit({ type: 'raise', amount });
        }
      }
    });
  }

  // ------------------------------------------------------------------ sound

  playSound(event) {
    switch (event.type) {
      case 'deal':
        sfx.deal();
        break;
      case 'street':
        sfx.flip();
        break;
      case 'human-turn':
        sfx.turn();
        break;
      case 'showdown':
        sfx.reveal();
        break;
      case 'action':
        if (event.action === 'fold') sfx.fold();
        else if (event.action === 'check') sfx.check();
        else if (event.action === 'allin') sfx.allin();
        else if (event.action === 'raise') sfx.raise();
        else sfx.chip();
        break;
      case 'hand-end': {
        const human = event.state.players.find((p) => p.isMe);
        const won = event.results && event.results.winners.some((w) => w.id === (human && human.id));
        if (won) sfx.win();
        else if (human && human.revealed) sfx.lose();
        break;
      }
      default:
        break;
    }
  }
}
