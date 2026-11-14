import { createDeck, cardCode } from './cards.js';
import { evaluateValue } from './evaluator.js';

const FULL_DECK = createDeck();
const FULL_IDS = FULL_DECK.map(cardCode);
const BY_ID = new Map(FULL_DECK.map((c) => [cardCode(c), c]));

export const BOT_PROFILES = [
  { name: 'Luna', avatar: '🦊', style: 'Agressiva', aggression: 0.84, tightness: 0.34, bluff: 0.2 },
  { name: 'Bruno', avatar: '🐻', style: 'Cauteloso', aggression: 0.29, tightness: 0.72, bluff: 0.05 },
  { name: 'Íris', avatar: '🦉', style: 'Calculista', aggression: 0.55, tightness: 0.55, bluff: 0.08 },
  { name: 'Téo', avatar: '🐯', style: 'Turbulento', aggression: 0.93, tightness: 0.2, bluff: 0.26 },
  { name: 'Nina', avatar: '🐼', style: 'Equilibrada', aggression: 0.5, tightness: 0.5, bluff: 0.11 },
  { name: 'Cauã', avatar: '🐺', style: 'Oportunista', aggression: 0.66, tightness: 0.44, bluff: 0.16 },
  { name: 'Zoe', avatar: '🐱', style: 'Imprevisível', aggression: 0.72, tightness: 0.38, bluff: 0.21 },
  { name: 'Rex', avatar: '🦁', style: 'Paciente', aggression: 0.4, tightness: 0.64, bluff: 0.07 },
  { name: 'Mel', avatar: '🐰', style: 'Mão-fechada', aggression: 0.36, tightness: 0.78, bluff: 0.04 },
  { name: 'Aria', avatar: '🦋', style: 'Solta', aggression: 0.75, tightness: 0.28, bluff: 0.24 },
];

export function pickBotProfiles(count, rng = Math.random) {
  const pool = BOT_PROFILES.slice();
  const picked = [];
  while (picked.length < count && pool.length) {
    const index = Math.floor(rng() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

const EQUITY_CACHE_LIMIT = 4000;

/**
 * Rough equity of `hole` against `opponents` random hands, by Monte Carlo.
 * Returns a number between 0 and 1.
 */
export function estimateEquity(hole, board, opponents, iterations = 160, rng = Math.random) {
  if (!hole || hole.length < 2) return 0;
  const known = new Set();
  for (const card of hole) known.add(cardCode(card));
  for (const card of board) known.add(cardCode(card));

  const deck = [];
  for (let i = 0; i < FULL_DECK.length; i += 1) {
    if (!known.has(FULL_IDS[i])) deck.push(BY_ID.get(FULL_IDS[i]));
  }

  const boardNeeded = 5 - board.length;
  const draws = Math.min(opponents * 2 + boardNeeded, deck.length);
  if (draws <= 0) return 0.5;

  const boardCards = board.slice();
  const oppHands = Array.from({ length: opponents }, () => []);
  let score = 0;
  let total = 0;

  for (let it = 0; it < iterations; it += 1) {
    // Partial Fisher-Yates on the probability deck.
    for (let i = 0; i < draws; i += 1) {
      const j = i + Math.floor(rng() * (deck.length - i));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }

    let cursor = 0;
    for (let o = 0; o < opponents; o += 1) {
      oppHands[o][0] = deck[cursor];
      oppHands[o][1] = deck[cursor + 1];
      cursor += 2;
    }

    const complete = boardCards.slice();
    for (let k = 0; k < boardNeeded; k += 1) complete.push(deck[cursor + k]);

    const mine = evaluateValue([hole[0], hole[1], ...complete]);
    let bestOpp = -1;
    let tied = 1;
    for (let o = 0; o < opponents; o += 1) {
      const value = evaluateValue([oppHands[o][0], oppHands[o][1], ...complete]);
      if (value > bestOpp) bestOpp = value;
      if (value === mine) tied += 1;
    }
    if (mine > bestOpp) score += 1;
    else if (mine === bestOpp) score += 1 / tied;
    total += 1;
  }

  return total ? score / total : 0.5;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function roundToBlind(value, blind) {
  const unit = Math.max(1, blind);
  return Math.round(value / unit) * unit;
}

/**
 * Choose an action for a bot.
 * Context comes from PokerGame#buildBotContext.
 */
export function decideBotAction(ctx) {
  const rng = ctx.rng || Math.random;
  const style = ctx.strategy || { aggression: 0.55, tightness: 0.5, bluff: 0.1 };
  const street = ctx.street;
  const opponents = Math.max(1, ctx.opponents);

  const iterations =
    ctx.difficulty === 'easy' ? 80 : ctx.difficulty === 'hard' ? 300 : 160;
  const equity = estimateEquity(ctx.hole, ctx.board, opponents, iterations, rng);

  const pot = Math.max(ctx.bigBlind, ctx.pot);
  const toCall = Math.max(0, ctx.toCall);
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const noise = ctx.difficulty === 'easy' ? 0.11 : ctx.difficulty === 'hard' ? 0.035 : 0.06;
  const perceived = clamp(equity + (rng() - 0.5) * noise, 0, 1);

  const aggr = style.aggression;
  const bluff = style.bluff;
  const tight = style.tightness;
  const baseline = 1 / (opponents + 1);
  const strength = equity / baseline;

  const canRaise = ctx.canRaise && ctx.raisesThisStreet < 5;

  const raiseTarget = (fraction) => {
    const increment = Math.max(
      ctx.minRaiseTo - ctx.currentBet,
      roundToBlind(pot * fraction, ctx.bigBlind),
    );
    return clamp(ctx.currentBet + increment, ctx.minRaiseTo, ctx.maxRaiseTo);
  };

  if (toCall === 0) {
    const valueBar = 1.16 + (1 - aggr) * 0.12 + (tight - 0.5) * 0.14;
    const wantsValue = strength > valueBar;
    const bluffChance = bluff * (street === 'river' ? 1.15 : street === 'preflop' ? 0.4 : 0.8) * (opponents === 1 ? 1.2 : 0.85);
    const wantsBluff = rng() < bluffChance;

    if (canRaise && wantsValue) {
      const fraction = 0.42 + aggr * 0.32 + rng() * 0.18;
      return { type: 'raise', amount: raiseTarget(fraction) };
    }
    if (canRaise && wantsBluff) {
      return { type: 'raise', amount: raiseTarget(0.5 + rng() * 0.15) };
    }
    return { type: 'check' };
  }

  const stackCommit = toCall / Math.max(1, ctx.stack + ctx.bet);
  const allInCall = stackCommit > 0.92;

  const raiseBar = 1.62 + (opponents - 1) * 0.07 - aggr * 0.2;
  const wantsRaise = strength > raiseBar && rng() < 0.62 + aggr * 0.3;
  const bluffRaise = rng() < bluff * 0.35 * (opponents === 1 ? 1.1 : 0.9);

  if (canRaise && !allInCall && (wantsRaise || (bluffRaise && rng() < 0.5))) {
    if (wantsRaise && rng() < 0.16) {
      // Slow play the very strong hands occasionally.
      return { type: 'call' };
    }
    const fraction = 0.5 + aggr * 0.35 + rng() * 0.2;
    return { type: 'raise', amount: raiseTarget(fraction) };
  }

  const margin = 0.015 + tight * 0.035 + (ctx.difficulty === 'easy' ? 0.03 : 0);
  if (perceived >= potOdds + margin) {
    return { type: 'call' };
  }

  // Cheap peek with a tiny call? Implied odds can justify a call when the price is small.
  if (toCall <= ctx.bigBlind * 0.5 && perceived > potOdds * 0.6 && rng() < 0.5) {
    return { type: 'call' };
  }

  return { type: 'fold' };
}
