import assert from 'node:assert/strict';
import { createDeck, cardCode } from '../src/cards.js';
import { evaluate, evaluateBest, evaluateWithJokers } from '../src/evaluator.js';
import { PokerGame } from '../src/game.js';
import {
  POWER_CARDS,
  VARIANTS,
  VARIANT_LIST,
  randomMarketOffer,
  randomPowerOffer,
} from '../src/variants.js';
import { VARIANT_TUTORIALS } from '../src/variant-tutorials.js';

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

const parse = (code) => {
  const suit = code[code.length - 1];
  const rankText = code.slice(0, -1);
  const map = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return { r: map[rankText] || Number(rankText), s: suit };
};
const hand = (...codes) => codes.map(parse);
const joker = (suit) => ({ r: 0, s: suit, joker: true });

await test('joker deck has one wildcard per suit', () => {
  const deck = createDeck({ jokers: true });
  assert.equal(deck.length, 56);
  const jokers = deck.filter((card) => card.joker);
  assert.equal(jokers.length, 4);
  assert.deepEqual(jokers.map((card) => card.s), ['s', 'h', 'd', 'c']);
  assert.equal(new Set(deck.map(cardCode)).size, 56);
});

await test('joker completes a royal flush in its suit', () => {
  const result = evaluateWithJokers([joker('s'), ...hand('As', 'Ks', 'Qs', 'Js')]);
  assert.equal(result.name, 'Straight Flush');
  assert.equal(result.description, 'Royal Flush');
});

await test('joker completes a straight flush in its suit', () => {
  const result = evaluateWithJokers([joker('h'), ...hand('9h', '8h', '7h', '6h')]);
  assert.equal(result.name, 'Straight Flush');
  assert.equal(result.kickers[0], 10);
});

await test('evaluateBest detects jokers automatically', () => {
  const withJoker = evaluateBest([joker('d'), ...hand('Ad', 'Kd', 'Qd', 'Jd')]);
  assert.equal(withJoker.cat, 8);
  const plain = evaluateBest(hand('As', 'Kd', 'Qh', 'Jc', '9s'));
  assert.deepEqual(plain, evaluate(hand('As', 'Kd', 'Qh', 'Jc', '9s')));
});

await test('three hole cards are evaluated as best five of eight', () => {
  const result = evaluate([
    ...hand('As', 'Ks', 'Qs'),
    ...hand('Js', 'Ts', '2d', '3c', '4h'),
  ]);
  assert.equal(result.description, 'Royal Flush');
});

await test('variant metadata and tutorials are complete', () => {
  assert.ok(VARIANT_LIST.length >= 4);
  for (const variant of VARIANT_LIST) assert.ok(VARIANTS[variant.id]);
  assert.ok(POWER_CARDS.length >= 8);
  for (const id of ['arcana', 'market', 'joker']) {
    const steps = VARIANT_TUTORIALS[id];
    assert.ok(Array.isArray(steps) && steps.length >= 4);
    for (const step of steps) {
      assert.ok(step.title && step.text && step.visual);
    }
  }
});

await test('power and market offers are unique', () => {
  const powers = randomPowerOffer(4);
  assert.equal(powers.length, 4);
  assert.equal(new Set(powers.map((card) => card.id)).size, 4);
  const market = randomMarketOffer(3);
  assert.equal(market.length, 3);
  assert.equal(new Set(market.map((item) => item.id)).size, 3);
});

const makeGame = (variant, players) =>
  new PokerGame({
    players,
    smallBlind: 10,
    bigBlind: 20,
    difficulty: 'normal',
    variant,
    botDelayMin: 0,
    botDelayMax: 0,
    pauseScale: 0,
  });

await test('arcana draft gives two secret powers and river adds one', async () => {
  const game = makeGame('arcana', [
    { id: 'human', name: 'Human', avatar: '🧑', isHuman: true, stack: 1000 },
    { id: 'bot', name: 'Bot', avatar: '🦊', stack: 1000, strategy: { aggression: 0.5, tightness: 0.5, bluff: 0.1 } },
  ]);
  const draft = game.runArcanaDraft([0, 1]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const human = game.players[0];
  assert.equal(human.powerOffer.length, 4);
  const picks = human.powerOffer.slice(0, 2).map((card) => card.id);
  assert.equal(game.submitPowerDraft('human', picks), true);
  await draft;
  assert.equal(human.powers.length, 2);
  assert.equal(game.players[1].powers.length, 2);
  game.grantRiverPowers();
  assert.equal(human.powers.length, 3);
});

await test('arcana powers are single-use and draw cards', () => {
  const game = makeGame('arcana', [
    { id: 'human', name: 'Human', avatar: '🧑', isHuman: true, stack: 1000 },
    { id: 'bot', name: 'Bot', avatar: '🦊', stack: 1000, strategy: { aggression: 0.5, tightness: 0.5, bluff: 0.1 } },
  ]);
  const human = game.players[0];
  human.hole = hand('As', 'Ks');
  human.powers = [POWER_CARDS.find((card) => card.id === 'extra')];
  game.deck = hand('2c', '3c', '4c', '5c', '6c');
  game.street = 'preflop';
  assert.equal(game.usePowerInternal(human, 'extra'), true);
  assert.equal(human.hole.length, 3);
  assert.equal(human.powers.length, 0);
  game.street = 'flop';
  human.powers = [POWER_CARDS.find((card) => card.id === 'extra')];
  assert.equal(game.usePowerInternal(human, 'extra'), false);
});

await test('mirror and read reveal hands as cards', () => {
  const game = makeGame('arcana', [
    { id: 'human', name: 'Human', avatar: '🧑', isHuman: true, stack: 1000 },
    { id: 'bot', name: 'Bot', avatar: '🦊', stack: 1000, strategy: { aggression: 0.5, tightness: 0.5, bluff: 0.1 } },
  ]);
  const human = game.players[0];
  const bot = game.players[1];
  human.hole = hand('As', 'Ks');
  bot.hole = hand('Ah', 'Kh');
  game.board = hand('Qs', 'Js', 'Ts', '2d', '3c');
  game.street = 'river';
  human.powers = [
    POWER_CARDS.find((card) => card.id === 'mirror'),
    POWER_CARDS.find((card) => card.id === 'read'),
  ];
  assert.equal(game.usePowerInternal(human, 'mirror', { targetId: 'bot' }), true);
  assert.equal(human.intel.mirror.cards.length, 5);
  assert.ok(human.intel.mirror.cards.some((card) => card.fromBoard));
  assert.equal(game.usePowerInternal(human, 'read', { targetId: 'bot' }), true);
  assert.equal(human.intel.read.cards.length, 2);
  assert.ok(human.intel.read.handName);
});

await test('variant games complete hands with bots only', async () => {
  for (const variant of ['arcana', 'market', 'joker']) {
    const game = makeGame(
      variant,
      Array.from({ length: 4 }, (_, index) => ({
        id: `bot-${index}`,
        name: `Bot ${index}`,
        avatar: '🦊',
        stack: 400,
        strategy: {
          aggression: 0.5,
          tightness: 0.5,
          bluff: 0.1,
          style: 'Teste',
        },
      })),
    );
    let played = 0;
    while (played < 8) {
      const result = await game.playHand();
      played += 1;
      if (result.gameOver) break;
    }
    assert.ok(played >= 1);
    assert.ok(game.handNumber >= 1);
  }
});

await test('market purchase spends chips into the pot and grants intel', () => {
  const game = makeGame('market', [
    { id: 'human', name: 'Human', avatar: '🧑', isHuman: true, stack: 1000 },
    { id: 'bot', name: 'Bot', avatar: '🦊', stack: 1000, strategy: { aggression: 0.5, tightness: 0.5, bluff: 0.1 } },
  ]);
  const human = game.players[0];
  game.street = 'preflop';
  game.activePlayerId = 'human';
  game.deck = hand('2c', '3c', '4c', '5c', '6c');
  human.hole = hand('As', 'Ks');
  human.marketOffers = ['market-deck'];
  assert.equal(game.submitMarket('human', 'market-deck'), true);
  assert.equal(human.stack, 980);
  assert.equal(human.committed, 20);
  assert.equal(human.marketBought, true);
  assert.ok(Array.isArray(human.intel.deckPeek));
  assert.equal(human.intel.deckPeek.length, 3);
  assert.equal(game.snapshot('human').market.intel.deckPeek.length, 3);
});
