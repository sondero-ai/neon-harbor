import test from 'node:test';
import assert from 'node:assert/strict';
import { rollDrop } from '../game/src/loot.js';

const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

test('pistol-only table: no smg outcome before the unlock', () => {
  assert.equal(rollDrop(seq(0), { smgOwned: false }).kind, 'cash');
  assert.equal(rollDrop(seq(0.59), { smgOwned: false }).kind, 'cash');
  assert.equal(rollDrop(seq(0.61), { smgOwned: false }).kind, 'pistol');
  assert.equal(rollDrop(seq(0.99), { smgOwned: false }).kind, 'pistol');
});

test('smg crate only after the unlock', () => {
  const locked = rollDrop(seq(0.95), { smgOwned: false });
  assert.deepEqual(locked, { kind: 'pistol', amount: 12 });
  assert.deepEqual(rollDrop(seq(0.95), { smgOwned: true }), { kind: 'smg', amount: 32 });
});

test('cash steps and bounds', () => {
  assert.deepEqual(rollDrop(seq(0, 0), { smgOwned: false }), { kind: 'cash', amount: 15 });
  const top = rollDrop(seq(0, 0.999), { smgOwned: false });
  assert.equal(top.kind, 'cash');
  assert.equal(top.amount, 70);
  for (let i = 0; i < 200; i += 1) {
    const drop = rollDrop(Math.random, { smgOwned: i % 2 === 0 });
    if (drop.kind !== 'cash') continue;
    assert.equal(drop.amount % 5, 0);
    assert.ok(drop.amount >= 15 && drop.amount <= 70);
  }
  const wide = rollDrop(seq(0, 0.999), { smgOwned: false, cashMin: 40, cashMax: 120 });
  assert.deepEqual(wide, { kind: 'cash', amount: 120 });
});

test('amounts are pinned', () => {
  assert.equal(rollDrop(seq(0.7), { smgOwned: true }).amount, 12);
  assert.equal(rollDrop(seq(0.95), { smgOwned: true }).amount, 32);
});
