// Fuel and bodywork economics. A tank is a 0..1 fraction, burned by distance
// at a fixed rate, and the pump's quote is a pure function of the tank and the
// condition so the prompt, the service call and the tests all agree on the
// price. This module has no scene or player imports on purpose.

export const FUEL_BURN_PER_METER = 0.00007;
export const LOW_FUEL = 0.2;
export const FUEL_PRICE_PER_TANK = 80; // $8 per 10% of the missing tank
export const REPAIR_PRICE = 150;

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

/** Tank after driving `metres`; distance is never negative, the tank clamps at 0..1. */
export function drainFuel(fuel, metres) {
  const distance = Math.max(0, Number(metres) || 0);
  return clamp01(clamp01(fuel) - distance * FUEL_BURN_PER_METER);
}

/** Whole percent for the HUD, rounded the same way the condition gauge is. */
export function fuelPct(fuel) {
  return Math.round(clamp01(fuel) * 100);
}

/**
 * The service quote for a car: missing fuel at $8 per 10%, bodywork at $150
 * scaled by damage. Both parts are rounded once, then summed.
 */
export function quoteService(car) {
  const fuel = clamp01(car?.fuel ?? 1);
  const condition = clamp01(car?.condition ?? 1);
  const fuelCost = Math.round((1 - fuel) * FUEL_PRICE_PER_TANK);
  const repairCost = Math.round((1 - condition) * REPAIR_PRICE);
  return { fuelCost, repairCost, total: fuelCost + repairCost };
}
