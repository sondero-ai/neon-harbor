// The loot table for human NPC deaths. Pure on purpose: the unit tests pin the
// weights, the cash steps and the SMG gate without a browser.

const PISTOL_AMMO = 12;
const SMG_AMMO = 32;

export function rollDrop(random = Math.random, { smgOwned = false, cashMin = 15, cashMax = 70 } = {}) {
  const roll = random();
  if (roll < 0.6) {
    const steps = Math.max(1, Math.round((cashMax - cashMin) / 5));
    const amount = Math.min(cashMax, cashMin + Math.floor(random() * (steps + 1)) * 5);
    return { kind: 'cash', amount };
  }
  if (smgOwned && roll >= 0.9) return { kind: 'smg', amount: SMG_AMMO };
  return { kind: 'pistol', amount: PISTOL_AMMO };
}
