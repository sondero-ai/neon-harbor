import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUEL_BURN_PER_METER,
  LOW_FUEL,
  drainFuel,
  fuelPct,
  quoteService,
} from '../game/src/fuel.js';

test('fuel drains by distance and clamps at zero', () => {
  assert.equal(FUEL_BURN_PER_METER, 0.00007);
  assert.equal(drainFuel(1, 0), 1);
  assert.ok(Math.abs(drainFuel(1, 1000) - 0.93) < 1e-9);
  assert.equal(drainFuel(0.05, 1000), 0);
  assert.equal(drainFuel(0.5, -10), 0.5);
});

test('service quote charges for the missing fuel and the damage', () => {
  assert.deepEqual(quoteService({ fuel: 1, condition: 1 }), { fuelCost: 0, repairCost: 0, total: 0 });
  assert.deepEqual(quoteService({ fuel: 0.4, condition: 0.5 }), { fuelCost: 48, repairCost: 75, total: 123 });
  assert.deepEqual(quoteService({ fuel: 0, condition: 0 }), { fuelCost: 80, repairCost: 150, total: 230 });
});

test('fuel percent and the low-fuel threshold are pinned', () => {
  assert.equal(LOW_FUEL, 0.2);
  assert.equal(fuelPct(1), 100);
  assert.equal(fuelPct(0.416), 42);
  assert.equal(fuelPct(0), 0);
});
