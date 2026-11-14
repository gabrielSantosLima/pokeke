export const PLAYER_REACTIONS = [
  '😂',
  '😎',
  '😱',
  '😤',
  '🤔',
  '🔥',
  '🤑',
  '👏',
  'Boa!',
  'Ih…',
  'Coragem',
  'Vamos!',
];

export const BOT_REACTIONS = {
  win: ['😎 Fácil.', '🤑 Cadê?', '🎉 Mais uma!', '😏 Sabia.', '🍀 Sorte? Não.'],
  fold: ['😤 Essa não.', '🙄 Deixa passar.', '🫠 Sem chance.', '😑 Passe.'],
  raise: ['😈 Vai encarar?', '🔥 Subindo!', '😏 Coragem.', '💰 Vamos ver.'],
  allin: ['😱 All-in!', '🤯 Tudo ou nada.', '😤 Vamos nessa!', '🚀'],
  lose: ['😭 Boa mão.', '😅 Quase.', '🫡 Respeito.', '😮‍💨 Essa doeu.'],
  check: ['🤔', '😐', '👀', '🫣'],
  call: ['😬', '👍', '🫡', '😮‍💨'],
};

export const REACTION_COOLDOWN_MS = 1500;

export function pickBotReaction(kind) {
  const list = BOT_REACTIONS[kind] || BOT_REACTIONS.check;
  return list[Math.floor(Math.random() * list.length)];
}
