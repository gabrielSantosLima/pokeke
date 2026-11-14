import { RANK_NAMES, RANK_PLURALS, SUIT_INDEX } from './cards.js';

export const CATEGORY_NAMES = [
  'Carta Alta',
  'Par',
  'Dois Pares',
  'Trinca',
  'Sequência',
  'Flush',
  'Full House',
  'Quadra',
  'Straight Flush',
];

const BASE = 15;

/** Pack category + five kickers into one comparable integer. */
export function pack(cat, k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0) {
  return ((((cat * BASE + k0) * BASE + k1) * BASE + k2) * BASE + k3) * BASE + k4;
}

function combinations(n, k) {
  const result = [];
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    result.push(idx.slice());
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i -= 1;
    if (i < 0) break;
    idx[i] += 1;
    for (let j = i + 1; j < k; j += 1) idx[j] = idx[j - 1] + 1;
  }
  return result;
}

const COMBOS = {
  5: [[0, 1, 2, 3, 4]],
  6: combinations(6, 5),
  7: combinations(7, 5),
};

/** Straight high card from a rank bitmask (handles the wheel). */
function straightHighFromMask(mask) {
  for (let high = 14; high >= 6; high -= 1) {
    let ok = true;
    for (let r = high; r > high - 5; r -= 1) {
      if (!(mask & (1 << r))) {
        ok = false;
        break;
      }
    }
    if (ok) return high;
  }
  const wheel = (1 << 14) | (1 << 5) | (1 << 4) | (1 << 3) | (1 << 2);
  if ((mask & wheel) === wheel) return 5;
  return 0;
}

/**
 * Evaluate exactly five cards.
 * Returns { cat, kickers, value }.
 */
export function evaluate5(cards) {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush =
    cards[0].s === cards[1].s &&
    cards[1].s === cards[2].s &&
    cards[2].s === cards[3].s &&
    cards[3].s === cards[4].s;

  let mask = 0;
  for (const r of ranks) mask |= 1 << r;
  let straightHigh = 0;
  if (ranks[0] !== ranks[1] && ranks[1] !== ranks[2] && ranks[2] !== ranks[3] && ranks[3] !== ranks[4]) {
    straightHigh = straightHighFromMask(mask);
  }

  if (straightHigh && flush) {
    return { cat: 8, kickers: [straightHigh, 0, 0, 0, 0], value: pack(8, straightHigh) };
  }

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (groups[0][1] === 4) {
    const q = groups[0][0];
    const k = groups[1][0];
    return { cat: 7, kickers: [q, k, 0, 0, 0], value: pack(7, q, k) };
  }

  if (groups[0][1] === 3 && groups[1] && groups[1][1] >= 2) {
    const t = groups[0][0];
    const p = groups[1][0];
    return { cat: 6, kickers: [t, p, 0, 0, 0], value: pack(6, t, p) };
  }

  if (flush) {
    const k = ranks;
    return {
      cat: 5,
      kickers: k,
      value: pack(5, k[0], k[1], k[2], k[3], k[4]),
    };
  }

  if (straightHigh) {
    return { cat: 4, kickers: [straightHigh, 0, 0, 0, 0], value: pack(4, straightHigh) };
  }

  if (groups[0][1] === 3) {
    const t = groups[0][0];
    const k1 = groups[1] ? groups[1][0] : 0;
    const k2 = groups[2] ? groups[2][0] : 0;
    return { cat: 3, kickers: [t, k1, k2, 0, 0], value: pack(3, t, k1, k2) };
  }

  if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) {
    const p1 = groups[0][0];
    const p2 = groups[1][0];
    const k = groups[2] ? groups[2][0] : 0;
    return { cat: 2, kickers: [p1, p2, k, 0, 0], value: pack(2, p1, p2, k) };
  }

  if (groups[0][1] === 2) {
    const p = groups[0][0];
    const k1 = groups[1] ? groups[1][0] : 0;
    const k2 = groups[2] ? groups[2][0] : 0;
    const k3 = groups[3] ? groups[3][0] : 0;
    return { cat: 1, kickers: [p, k1, k2, k3, 0], value: pack(1, p, k1, k2, k3) };
  }

  const [k0, k1, k2, k3, k4] = ranks;
  return { cat: 0, kickers: ranks, value: pack(0, k0, k1, k2, k3, k4) };
}

/**
 * Fast value-only evaluation for 5, 6 or 7 cards (best five).
 * Used by the bots' Monte Carlo simulation.
 */
export function evaluateValue(cards) {
  const length = cards.length;
  if (length === 7) return evaluate7Value(cards);
  if (length === 5) return evaluate5(cards).value;

  let best = -1;
  for (const combo of COMBOS[length]) {
    const value = evaluate5([cards[combo[0]], cards[combo[1]], cards[combo[2]], cards[combo[3]], cards[combo[4]]]).value;
    if (value > best) best = value;
  }
  return best;
}

/** Head-to-head value evaluator for seven cards. */
function evaluate7Value(cards) {
  const counts = new Uint8Array(15);
  const suitCounts = [0, 0, 0, 0];
  const suitRanks = [[], [], [], []];
  for (let i = 0; i < 7; i += 1) {
    const c = cards[i];
    counts[c.r] += 1;
    const si = SUIT_INDEX[c.s];
    suitCounts[si] += 1;
    suitRanks[si].push(c.r);
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s += 1) {
    if (suitCounts[s] >= 5) {
      flushSuit = s;
      break;
    }
  }

  if (flushSuit >= 0) {
    const sr = suitRanks[flushSuit].sort((a, b) => b - a);
    let mask = 0;
    for (const r of sr) mask |= 1 << r;
    const sfHigh = straightHighFromMask(mask);
    if (sfHigh) return pack(8, sfHigh);
  }

  const quads = [];
  const trips = [];
  const pairs = [];
  for (let r = 14; r >= 2; r -= 1) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quads.length) {
    const q = quads[0];
    let kicker = 0;
    for (let r = 14; r >= 2; r -= 1) {
      if (r !== q && counts[r] > 0) {
        kicker = r;
        break;
      }
    }
    return pack(7, q, kicker);
  }

  if (trips.length >= 2) return pack(6, trips[0], trips[1]);
  if (trips.length === 1 && pairs.length >= 1) return pack(6, trips[0], pairs[0]);

  if (flushSuit >= 0) {
    const sr = suitRanks[flushSuit].sort((a, b) => b - a);
    return pack(5, sr[0], sr[1], sr[2], sr[3], sr[4]);
  }

  let mask = 0;
  for (let r = 2; r <= 14; r += 1) if (counts[r] > 0) mask |= 1 << r;
  const straightHigh = straightHighFromMask(mask);
  if (straightHigh) return pack(4, straightHigh);

  if (trips.length === 1) {
    const t = trips[0];
    const kickers = [];
    for (let r = 14; r >= 2 && kickers.length < 2; r -= 1) {
      if (r !== t && counts[r] > 0) kickers.push(r);
    }
    return pack(3, t, kickers[0] || 0, kickers[1] || 0);
  }

  if (pairs.length >= 2) {
    const p1 = pairs[0];
    const p2 = pairs[1];
    let kicker = 0;
    for (let r = 14; r >= 2; r -= 1) {
      if (r !== p1 && r !== p2 && counts[r] > 0) {
        kicker = r;
        break;
      }
    }
    return pack(2, p1, p2, kicker);
  }

  if (pairs.length === 1) {
    const p = pairs[0];
    const kickers = [];
    for (let r = 14; r >= 2 && kickers.length < 3; r -= 1) {
      if (r !== p && counts[r] > 0) kickers.push(r);
    }
    return pack(1, p, kickers[0] || 0, kickers[1] || 0, kickers[2] || 0);
  }

  const high = [];
  for (let r = 14; r >= 2 && high.length < 5; r -= 1) if (counts[r] > 0) high.push(r);
  return pack(0, high[0], high[1], high[2], high[3], high[4]);
}

function describe(cat, kickers) {
  const k = kickers;
  switch (cat) {
    case 8:
      return k[0] === 14 ? 'Royal Flush' : `Straight Flush até ${RANK_NAMES[k[0]]}`;
    case 7:
      return `Quadra de ${RANK_PLURALS[k[0]]}`;
    case 6:
      return `Full House de ${RANK_PLURALS[k[0]]} e ${RANK_PLURALS[k[1]]}`;
    case 5:
      return `Flush de ${RANK_NAMES[k[0]]} alto`;
    case 4:
      return `Sequência até ${RANK_NAMES[k[0]]}`;
    case 3:
      return `Trinca de ${RANK_PLURALS[k[0]]}`;
    case 2:
      return `Dois Pares (${RANK_PLURALS[k[0]]} e ${RANK_PLURALS[k[1]]})`;
    case 1:
      return `Par de ${RANK_PLURALS[k[0]]}`;
    default:
      return `${RANK_NAMES[k[0]]} alto`;
  }
}

/**
 * Evaluate the best five-card hand from 5-7 cards.
 * Returns { cat, kickers, value, cards, name, description }.
 */
export function evaluate(cards) {
  if (cards.length < 5) throw new Error('É preciso pelo menos 5 cartas para avaliar a mão');
  const combos = COMBOS[cards.length];
  let best = null;
  for (const combo of combos) {
    const hand = [cards[combo[0]], cards[combo[1]], cards[combo[2]], cards[combo[3]], cards[combo[4]]];
    const ev = evaluate5(hand);
    if (!best || ev.value > best.value) {
      best = { ...ev, cards: hand };
    }
  }
  return {
    ...best,
    name: CATEGORY_NAMES[best.cat],
    description: describe(best.cat, best.kickers),
  };
}
