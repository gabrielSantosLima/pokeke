import assert from 'node:assert/strict';
import { createDeck, cardCode } from '../src/cards.js';
import { evaluate, evaluate5, evaluateValue } from '../src/evaluator.js';
import { decideBotAction, estimateEquity, pickBotProfiles } from '../src/ai.js';
import { PokerGame } from '../src/game.js';

const parse = (code) => {
  const suit = code[code.length - 1];
  const rankText = code.slice(0, -1);
  const map = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return { r: map[rankText] || Number(rankText), s: suit };
};
const hand = (...codes) => codes.map(parse);

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

// ---------------------------------------------------------------- evaluator

await test('reconhece categorias básicas', () => {
  assert.equal(evaluate5(hand('As', 'Kd', 'Qh', 'Jc', 'Ts')).cat, 4);
  assert.equal(evaluate5(hand('As', 'Ad', 'Qh', 'Jc', 'Ts')).cat, 1);
  assert.equal(evaluate5(hand('As', 'Ad', 'Qh', 'Qc', 'Ts')).cat, 2);
  assert.equal(evaluate5(hand('As', 'Ad', 'Ah', 'Qc', 'Ts')).cat, 3);
  assert.equal(evaluate5(hand('As', 'Kd', 'Qh', 'Jc', '9s')).cat, 0);
  assert.equal(evaluate5(hand('As', 'Ks', 'Qs', 'Js', '9s')).cat, 5);
  assert.equal(evaluate5(hand('As', 'Ad', 'Ah', 'Qc', 'Qs')).cat, 6);
  assert.equal(evaluate5(hand('As', 'Ad', 'Ah', 'Ac', 'Qs')).cat, 7);
  assert.equal(evaluate5(hand('9s', '8s', '7s', '6s', '5s')).cat, 8);
});

await test('roda a sequência baixa (A-2-3-4-5)', () => {
  const wheel = evaluate5(hand('As', '2d', '3h', '4c', '5s'));
  assert.equal(wheel.cat, 4);
  assert.equal(wheel.kickers[0], 5);
  assert.ok(wheel.value < evaluate5(hand('2s', '3d', '4h', '5c', '6s')).value);
});

await test('escolhe a melhor mão entre 7 cartas', () => {
  const result = evaluate(hand('As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '2c'));
  assert.equal(result.name, 'Straight Flush');
  assert.equal(result.description, 'Royal Flush');
  assert.equal(result.cards.length, 5);

  const full = evaluate(hand('As', 'Ad', 'Ah', 'Kc', 'Kd', '2c', '3d'));
  assert.equal(full.name, 'Full House');

  const quads = evaluate(hand('7s', '7d', '7h', '7c', 'Kd', '2c', '3d'));
  assert.equal(quads.name, 'Quadra');
});

await test('evaluateValue concorda com evaluate em mãos aleatórias', () => {
  const deck = createDeck();
  for (let i = 0; i < 500; i += 1) {
    for (let j = deck.length - 1; j > 0; j -= 1) {
      const k = Math.floor(Math.random() * (j + 1));
      [deck[j], deck[k]] = [deck[k], deck[j]];
    }
    const cards = deck.slice(0, 7);
    const a = evaluate(cards).value;
    const b = evaluateValue(cards);
    assert.equal(a, b, cards.map(cardCode).join(' '));
  }
});

// -------------------------------------------------------------- side pots

await test('distribui side pots corretamente', () => {
  const game = new PokerGame({
    players: [
      { id: 'a', name: 'A', avatar: '🦊', stack: 0 },
      { id: 'b', name: 'B', avatar: '🐻', stack: 0 },
      { id: 'c', name: 'C', avatar: '🦉', stack: 0 },
    ],
    smallBlind: 5,
    bigBlind: 10,
    botDelayMin: 0,
    botDelayMax: 0,
  });

  const [a, b, c] = game.players;
  a.hole = hand('As', 'Ad');
  b.hole = hand('Ks', 'Kd');
  c.hole = hand('7c', '2d');
  game.board = hand('Ah', '9c', '4s', '3d', '8h');
  a.committed = 100;
  b.committed = 300;
  c.committed = 300;
  a.allIn = true;

  const results = game.awardPot([a, b, c], true);

  assert.equal(results.totalPot, 700);
  assert.equal(a.won, 300, 'A leva o pote principal');
  assert.equal(b.won, 400, 'B leva o side pot');
  assert.equal(c.won, 0);
  assert.equal(a.stack + b.stack + c.stack, 700);
});

// -------------------------------------------------------------- reactions

await test('reações de bots e do jogador', () => {
  const events = [];
  const game = new PokerGame({
    players: [
      { id: 'h', name: 'Humano', avatar: '🧑', isHuman: true, stack: 1000 },
      { id: 'b', name: 'Bot', avatar: '🦊', stack: 1000 },
    ],
    smallBlind: 5,
    bigBlind: 10,
    botDelayMin: 0,
    botDelayMax: 0,
    viewerId: 'h',
    onEvent: (event) => events.push(event),
  });
  game.handNumber = 1;
  assert.equal(game.botReact(game.players[1], 'win', 1), true);
  const botReaction = events.find((event) => event.type === 'reaction');
  assert.ok(botReaction);
  assert.equal(botReaction.playerId, 'b');
  assert.ok(typeof botReaction.text === 'string' && botReaction.text.length > 0);
  // one reaction per bot per hand
  assert.equal(game.botReact(game.players[1], 'raise', 1), false);

  assert.equal(game.submitReaction('😂'), true);
  const humanReaction = events.filter((event) => event.type === 'reaction').at(-1);
  assert.equal(humanReaction.playerId, 'h');
  assert.equal(humanReaction.text, '😂');
  // rate limit
  assert.equal(game.submitReaction('🔥'), false);
});

// --------------------------------------------------------------- equity

await test('equidade de AA contra 3 oponentes fica na faixa esperada', () => {
  const equity = estimateEquity(hand('As', 'Ad'), [], 3, 600);
  assert.ok(equity > 0.5 && equity < 0.75, `equity=${equity}`);
});

await test('equidade de 7-2 contra 1 oponente é baixa', () => {
  const equity = estimateEquity(hand('7c', '2d'), [], 1, 600);
  assert.ok(equity < 0.42, `equity=${equity}`);
});

// ------------------------------------------------------ full game simulation

async function runSimulation({ hands = 400, withHuman = false, label }) {
  let totalHands = 0;
  let showdowns = 0;
  let folds = 0;
  let raises = 0;
  let games = 0;
  const started = Date.now();

  while (totalHands < hands) {
    games += 1;
    const profiles = pickBotProfiles(withHuman ? 3 : 5);
    const seats = profiles.map((profile, index) => ({
      id: `b${index}`,
      name: profile.name,
      avatar: profile.avatar,
      isHuman: false,
      stack: 2000,
      strategy: profile,
    }));
    if (withHuman) {
      seats.splice(2, 0, {
        id: 'human',
        name: 'Você',
        avatar: '🧑',
        isHuman: true,
        stack: 2000,
        strategy: { aggression: 0.55, tightness: 0.5, bluff: 0.1 },
      });
    }

    let game;
    const totalStart = 2000 * seats.length;

    game = new PokerGame({
      players: seats,
      smallBlind: 10,
      bigBlind: 20,
      difficulty: 'normal',
      pauseScale: 0,
      botDelayMin: 0,
      botDelayMax: 0,
      onEvent: (event) => {
        if (event.type === 'showdown') showdowns += 1;
        if (event.type === 'action') {
          if (event.action === 'fold') folds += 1;
          if (event.action === 'raise' || event.action === 'allin') raises += 1;
        }
        if (event.type === 'human-turn' && withHuman) {
          const { options } = event;
          const roll = Math.random();
          let action;
          if (roll < 0.25) action = { type: 'fold' };
          else if (roll < 0.7 && options.canCheck) action = { type: 'check' };
          else if (roll < 0.85 && options.canRaise) {
            action = {
              type: 'raise',
              amount:
                options.minRaiseTo +
                Math.floor(Math.random() * Math.max(1, options.maxRaiseTo - options.minRaiseTo + 1)),
            };
          } else action = { type: 'call' };
          game.submitAction(action);
        }
      },
    });

    const originalApply = game.applyAction.bind(game);
    game.applyAction = (player, action) => {
      if (action && (action.type === 'raise' || action.type === 'allin')) {
        const options = game.getOptions(player);
        assert.ok(options.canRaise, 'raise sem direito de subir');
        if (action.type === 'raise') {
          assert.ok(
            action.amount >= options.minRaiseTo && action.amount <= options.maxRaiseTo,
            `raise fora dos limites: ${action.amount} (${options.minRaiseTo}-${options.maxRaiseTo})`,
          );
        }
      }
      originalApply(player, action);
    };

    while (totalHands < hands) {
      const result = await game.playHand();
      totalHands += 1;
      const stacks = game.players.reduce((sum, p) => sum + p.stack, 0);
      assert.equal(stacks, totalStart, 'fichas sumiram ou apareceram');
      assert.ok(
        game.players.every((p) => p.stack >= 0 && Number.isFinite(p.stack)),
        'stack inválido',
      );
      if (result.gameOver) break;
    }
  }

  const elapsed = Date.now() - started;
  console.log(
    `     ${label}: ${totalHands} mãos, ${games} partidas, ${showdowns} showdowns, ` +
      `${folds} folds, ${raises} raises, ${elapsed}ms (${(elapsed / totalHands).toFixed(1)}ms/mão)`,
  );
  return { totalHands, showdowns, folds, raises };
}

await test('simulação completa sem humano', async () => {
  const stats = await runSimulation({ hands: 500, label: 'sem humano' });
  assert.ok(stats.showdowns > 30, 'poucos showdowns');
  assert.ok(stats.folds > 100, 'poucos folds');
});

await test('simulação completa com humano automatizado', async () => {
  const stats = await runSimulation({ hands: 300, withHuman: true, label: 'com humano' });
  assert.ok(stats.showdowns > 15);
});

await test('desempenho de decisão dos bots', () => {
  const deck = createDeck();
  const hole = deck.slice(0, 2);
  const board = deck.slice(2, 5);
  const started = Date.now();
  let equity = 0;
  for (let i = 0; i < 60; i += 1) {
    equity += estimateEquity(hole, board, 3, 160);
  }
  const perDecision = (Date.now() - started) / 60;
  console.log(`     equity média=${(equity / 60).toFixed(3)} · ${perDecision.toFixed(1)}ms por decisão`);
  assert.ok(perDecision < 120, `decisão muito lenta: ${perDecision}ms`);
});

await test('bots tomam decisões válidas em contextos aleatórios', () => {
  const deck = createDeck();
  for (let i = 0; i < 300; i += 1) {
    const cards = deck.slice(0, 9);
    const boardSize = [0, 3, 4, 5][i % 4];
    const currentBet = [0, 20, 100][i % 3];
    const options = {
      hole: cards.slice(0, 2),
      board: cards.slice(2, 2 + boardSize),
      street: ['preflop', 'flop', 'turn', 'river'][boardSize === 0 ? 0 : boardSize - 2],
      pot: 60 + (i % 10) * 40,
      toCall: currentBet,
      stack: 300 + (i % 5) * 200,
      bet: 0,
      currentBet,
      minRaiseTo: currentBet + 20,
      maxRaiseTo: 300 + (i % 5) * 200,
      canRaise: true,
      canCheck: currentBet === 0,
      opponents: 1 + (i % 4),
      raisesThisStreet: i % 3,
      bigBlind: 20,
      difficulty: 'normal',
      strategy: pickBotProfiles(1)[0],
    };
    const action = decideBotAction(options);
    assert.ok(['fold', 'check', 'call', 'raise'].includes(action.type), action.type);
    if (action.type === 'raise') {
      assert.ok(action.amount >= options.minRaiseTo && action.amount <= options.maxRaiseTo);
    }
    if (options.toCall === 0 && action.type === 'fold') {
      assert.fail('bot desistiu sem aposta para pagar');
    }
  }
});

console.log('\nTodos os testes passaram.');
