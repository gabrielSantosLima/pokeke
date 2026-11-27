import assert from 'node:assert/strict';
import {
  BOT_REACTIONS,
  PLAYER_REACTIONS,
  REACTION_GROUPS,
  pickBotReaction,
} from '../src/reactions.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
    throw error;
  }
}

const hasEmoji = (value) =>
  Array.from(String(value)).some((character) => character.codePointAt(0) > 0x2000);

test('player reaction picker has a broad emoji set', () => {
  assert.ok(PLAYER_REACTIONS.length >= 50);
  assert.equal(new Set(PLAYER_REACTIONS).size, PLAYER_REACTIONS.length);
  assert.ok(PLAYER_REACTIONS.filter(hasEmoji).length >= 40);
  for (const reaction of PLAYER_REACTIONS) {
    assert.ok(String(reaction).trim().length > 0);
    assert.ok(String(reaction).length <= 40);
  }
});

test('reaction picker is grouped into emojis and phrases', () => {
  assert.deepEqual(
    REACTION_GROUPS.map((group) => group.id),
    ['emojis', 'phrases'],
  );
  const [emojis, phrases] = REACTION_GROUPS;
  assert.ok(emojis.items.length >= 100);
  assert.ok(phrases.items.length >= 40);
  assert.equal(new Set([...emojis.items, ...phrases.items]).size, PLAYER_REACTIONS.length);
  assert.ok(phrases.items.every((item) => item.length <= 40));
});

test('bot reactions cover every gameplay kind', () => {
  const kinds = ['win', 'fold', 'raise', 'allin', 'lose', 'check', 'call'];
  for (const kind of kinds) {
    const list = BOT_REACTIONS[kind];
    assert.ok(Array.isArray(list), `missing reactions for ${kind}`);
    assert.ok(list.length >= 4, `not enough reactions for ${kind}`);
    assert.equal(new Set(list).size, list.length, `duplicate reaction in ${kind}`);
    for (const reaction of list) assert.ok(String(reaction).trim().length > 0);
  }
});

test('pickBotReaction falls back for unknown kinds', () => {
  for (let index = 0; index < 25; index += 1) {
    const reaction = pickBotReaction('win');
    assert.ok(BOT_REACTIONS.win.includes(reaction));
    assert.ok(BOT_REACTIONS.check.includes(pickBotReaction('unknown-kind')));
  }
});
