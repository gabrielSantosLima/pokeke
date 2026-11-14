export const SUITS = {
  s: { key: 's', symbol: '♠', color: 'black', name: 'Espadas' },
  h: { key: 'h', symbol: '♥', color: 'red', name: 'Copas' },
  d: { key: 'd', symbol: '♦', color: 'red', name: 'Ouros' },
  c: { key: 'c', symbol: '♣', color: 'black', name: 'Paus' },
};

export const SUIT_KEYS = ['s', 'h', 'd', 'c'];
export const SUIT_INDEX = { s: 0, h: 1, d: 2, c: 3 };

export const RANK_NAMES = {
  2: 'Dois',
  3: 'Três',
  4: 'Quatro',
  5: 'Cinco',
  6: 'Seis',
  7: 'Sete',
  8: 'Oito',
  9: 'Nove',
  10: 'Dez',
  11: 'Valete',
  12: 'Dama',
  13: 'Rei',
  14: 'Ás',
};

export const RANK_PLURALS = {
  2: 'Dois',
  3: 'Três',
  4: 'Quatros',
  5: 'Cincos',
  6: 'Seis',
  7: 'Setes',
  8: 'Oitos',
  9: 'Noves',
  10: 'Dezes',
  11: 'Valetes',
  12: 'Damas',
  13: 'Reis',
  14: 'Ases',
};

const SYMBOLS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function rankSymbol(rank) {
  return SYMBOLS[rank] || String(rank);
}

export function rankName(rank) {
  return RANK_NAMES[rank] || String(rank);
}

export function cardCode(card) {
  return `${rankSymbol(card.r)}${card.s}`;
}

export function createDeck() {
  const deck = [];
  for (const suit of SUIT_KEYS) {
    for (let rank = 2; rank <= 14; rank += 1) {
      deck.push({ r: rank, s: suit });
    }
  }
  return deck;
}

/** Fisher-Yates, in place. */
export function shuffleInPlace(array, rng = Math.random) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

export function formatChips(value) {
  return new Intl.NumberFormat('pt-BR').format(Math.max(0, Math.round(value)));
}
