export const VARIANTS = {
  classic: {
    id: 'classic',
    name: 'Clássico',
    short: 'Texas Hold\'em puro',
    icon: '♠',
    description: 'Sem poderes, sem compras e sem curingas. A mesa original do Pokeke.',
  },
  arcana: {
    id: 'arcana',
    name: 'Mesa Arcana',
    short: '2 cartas de poder secretas',
    icon: '🔮',
    description:
      'Escolha 2 cartas de poder antes de cada mão. Elas são secretas, de uso único e não se repõem. No river, todos ganham mais uma.',
  },
  market: {
    id: 'market',
    name: 'Mercado',
    short: 'Compre vantagens com fichas',
    icon: '🛒',
    description:
      'Receba 3 ofertas secretas por mão. Na sua vez, compre uma carta usando fichas; o valor vai para o pote.',
  },
  joker: {
    id: 'joker',
    name: 'Mesa do Curinga',
    short: '4 curingas, um por naipe',
    icon: '🃏',
    description:
      'O baralho ganha um curinga de cada naipe. Cada curinga pode virar qualquer carta do próprio naipe.',
  },
};

export const VARIANT_LIST = Object.values(VARIANTS);

export const POWER_CARDS = [
  {
    id: 'vision',
    name: 'Visão',
    icon: '👁️',
    kind: 'power',
    timing: 'turn',
    target: 'none',
    description: 'Veja a próxima carta comunitária antes de ela abrir.',
    detail: 'A informação fica só com você até o fim da mão.',
  },
  {
    id: 'deck-peek',
    name: 'Olho do Baralho',
    icon: '🔮',
    kind: 'power',
    timing: 'turn',
    target: 'none',
    description: 'Veja as 3 próximas cartas do baralho.',
    detail: 'Ótimo para decidir se vale continuar comprando cartas.',
  },
  {
    id: 'swap',
    name: 'Troca',
    icon: '🔄',
    kind: 'power',
    timing: 'preflop',
    target: 'hole',
    description: 'Troque uma carta da sua mão pela próxima do baralho.',
    detail: 'Só pode ser usada antes do flop.',
  },
  {
    id: 'extra',
    name: 'Mão Extra',
    icon: '🃏',
    kind: 'power',
    timing: 'preflop',
    target: 'none',
    description: 'Compre uma terceira carta e use as duas melhores.',
    detail: 'Só pode ser usada antes do flop.',
  },
  {
    id: 'mirror',
    name: 'Espelho',
    icon: '🪞',
    kind: 'power',
    timing: 'turn',
    target: 'opponent',
    description: 'Veja a melhor mão atual de um oponente, com as cartas usadas.',
    detail: 'Escolha o alvo no momento de usar.',
  },
  {
    id: 'read',
    name: 'Leitura',
    icon: '🧠',
    kind: 'power',
    timing: 'turn',
    target: 'opponent',
    description: 'Veja as cartas fechadas de um oponente.',
    detail: 'Mostra as cartas da mão dele, não o board.',
  },
  {
    id: 'ghost',
    name: 'Fantasma',
    icon: '👻',
    kind: 'power',
    timing: 'turn',
    target: 'none',
    description: 'Se você desistir, recupera metade do que colocou na mão.',
    detail: 'Ative antes de desistir. O reembolso sai do pote.',
  },
  {
    id: 'tie',
    name: 'Empate',
    icon: '🤝',
    kind: 'power',
    timing: 'turn',
    target: 'none',
    description: 'Se o showdown empatar, você vence o empate.',
    detail: 'Ative antes do fim da mão. Vale para qualquer pote.',
  },
];

export const POWER_BY_ID = new Map(POWER_CARDS.map((card) => [card.id, card]));

export const MARKET_ITEMS = [
  {
    id: 'market-extra',
    powerId: 'extra',
    name: 'Carta Extra',
    icon: '🃏',
    kind: 'market',
    costBB: 3,
    description: 'Compre uma terceira carta e use as duas melhores.',
  },
  {
    id: 'market-swap',
    powerId: 'swap',
    name: 'Troca',
    icon: '🔄',
    kind: 'market',
    costBB: 2,
    description: 'Troque uma carta aleatória da sua mão pela próxima do baralho.',
  },
  {
    id: 'market-vision',
    powerId: 'vision',
    name: 'Olhar',
    icon: '👁️',
    kind: 'market',
    costBB: 1,
    description: 'Veja a próxima carta comunitária.',
  },
  {
    id: 'market-mirror',
    powerId: 'mirror',
    name: 'Espelho',
    icon: '🪞',
    kind: 'market',
    costBB: 2,
    description: 'Veja a melhor mão atual de um oponente aleatório.',
  },
  {
    id: 'market-deck',
    powerId: 'deck-peek',
    name: 'Olho do Baralho',
    icon: '🔮',
    kind: 'market',
    costBB: 1,
    description: 'Veja as 3 próximas cartas do baralho.',
  },
];

export const MARKET_BY_ID = new Map(MARKET_ITEMS.map((item) => [item.id, item]));

export function shuffled(values, rng = Math.random) {
  const copy = values.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function randomPowerOffer(count = 4, rng = Math.random) {
  return shuffled(POWER_CARDS, rng).slice(0, Math.min(count, POWER_CARDS.length));
}

export function randomMarketOffer(count = 3, rng = Math.random) {
  return shuffled(MARKET_ITEMS, rng).slice(0, Math.min(count, MARKET_ITEMS.length));
}

const BOT_POWER_SCORE = {
  extra: 8,
  swap: 7,
  vision: 5,
  mirror: 5,
  read: 4,
  'deck-peek': 3,
  ghost: 4,
  tie: 3,
};

export function pickBotPowers(offer, rng = Math.random) {
  return offer
    .slice()
    .sort((a, b) => (BOT_POWER_SCORE[b.id] || 0) - (BOT_POWER_SCORE[a.id] || 0) + (rng() - 0.5))
    .slice(0, 2);
}
