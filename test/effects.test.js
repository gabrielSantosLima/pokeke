import assert from 'node:assert/strict';
import { createChipPayload, cursorColorFor } from '../src/table-effects.js';

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

test('chip payload stays inside the viewport and has valid physics', () => {
  for (let index = 0; index < 40; index += 1) {
    const chip = createChipPayload(0.5, 0.5);
    assert.ok(chip.x >= 0 && chip.x <= 1);
    assert.ok(chip.y >= 0 && chip.y <= 1);
    assert.ok(chip.size >= 0.015 && chip.size <= 0.055);
    assert.ok(Number.isFinite(chip.vx) && Number.isFinite(chip.vy));
    assert.ok(Math.abs(chip.vx) <= 0.3 && Math.abs(chip.vy) <= 0.3);
    assert.ok(Number.isFinite(chip.angle) && Number.isFinite(chip.spin));
  }
});

test('cursor colors are stable and distinct enough', () => {
  assert.equal(cursorColorFor('player-a'), cursorColorFor('player-a'));
  const colors = new Set(
    ['player-a', 'player-b', 'player-c', 'player-d', 'player-e'].map(cursorColorFor),
  );
  assert.ok(colors.size >= 3);
});
