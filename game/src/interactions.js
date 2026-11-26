// The contextual E layer. While Rae is on foot, one prompt owns the key: a
// free seat here, the jewelry register there, a parked car to steal, the valet
// podium. Interactions decides which action is live, consumes the key when it
// acts, and returns whether it did so, letting main.js pass `allowE: false` to
// the player's enter/exit path. F stays the unconditional vehicle key.

import { quoteService } from './fuel.js';

const SEAT_REACH = 1.8;
const REGISTER_REACH = 2.0;
const PARKED_CAR_REACH = 2.0;
const PODIUM_REACH = 2.2;

export class Interactions {
  constructor({ player, world, vehicles = null, parking = null, robbery = null, gasStation = null } = {}) {
    this.player = player;
    this.world = world;
    this.vehicles = vehicles;
    this.parking = parking;
    this.robbery = robbery;
    this.gasStation = gasStation;
    this.prompt = null;
  }

  nearestSeat(x, z) {
    let best = null;
    let bestDistance = SEAT_REACH;
    for (const seat of this.world.seats ?? []) {
      if (seat.occupant && seat.occupant !== 'player') continue;
      const distance = Math.hypot(seat.x - x, seat.z - z);
      if (distance < bestDistance) {
        best = seat;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** The nearest free seat, for a crowd pedestrian looking for somewhere to sit. */
  freeSeat(x, z, reach = 24) {
    let best = null;
    let bestDistance = reach;
    for (const seat of this.world.seats ?? []) {
      if (seat.occupant) continue;
      const distance = Math.hypot(seat.x - x, seat.z - z);
      if (distance < bestDistance) {
        best = seat;
        bestDistance = distance;
      }
    }
    return best;
  }

  update(dt, input) {
    this.prompt = null;
    const player = this.player;
    if (!player || player.dead) return false;

    // While stopped in the valet zone, E parks the car instead of exiting it.
    // F still leaves the car, because the player's exit path never sees E once
    // this returns true. A pump inside the station takes priority over valet,
    // so E services and never exits while the car is on a pump pad.
    if (player.driving) {
      if (this.gasStation && Math.abs(player.driving.speed) < 0.5) {
        const pump = this.gasStation.atPump(player.position, 3.5);
        const quote = pump ? quoteService(player.driving) : null;
        if (quote && quote.total > 0) {
          this.prompt = { action: 'fuel', label: 'SERVICE', detail: `$${quote.total}` };
          if (input.wasPressed('KeyE')) {
            input.consumePressed('KeyE');
            this.gasStation.service(player);
            return true;
          }
        }
      }
      if (this.parking && Math.abs(player.driving.speed) < 0.5 && this.parking.atValetZone(player.position)) {
        this.prompt = { action: 'valet', label: 'VALET', detail: 'PARK THE CAR' };
        if (input.wasPressed('KeyE')) {
          input.consumePressed('KeyE');
          this.parking.parkValet(player.driving);
          return true;
        }
      }
      return false;
    }

    if (player.knockdown > 0) return false;

    if (player.sitting) {
      this.prompt = { action: 'stand', label: 'STAND', detail: player.seat?.kind ?? 'SEAT' };
      if (input.wasPressed('KeyE')) {
        input.consumePressed('KeyE');
        player.stand();
        return true;
      }
      return false;
    }

    // Priority: seat > register > parked car > valet podium > vehicle entry.
    const seat = this.nearestSeat(player.position.x, player.position.z);
    if (seat) {
      this.prompt = { action: 'sit', label: 'SIT', detail: seat.kind };
      if (input.wasPressed('KeyE')) {
        input.consumePressed('KeyE');
        player.sitAt(seat);
        return true;
      }
      return false;
    }

    if (this.robbery && typeof this.robbery.inReach === 'function' && this.robbery.inReach(player.position)) {
      this.prompt = { action: 'rob', label: 'ROB', detail: this.robbery.robbed ? 'EMPTY' : 'JEWELRY' };
      if (!this.robbery.robbed && input.wasPressed('KeyE')) {
        input.consumePressed('KeyE');
        this.robbery.tryRob();
        return true;
      }
      return false;
    }

    if (this.parking) {
      const parked = this.parking.parkedNear(player.position, PARKED_CAR_REACH);
      if (parked) {
        this.prompt = { action: 'steal', label: 'STEAL', detail: parked.type?.toUpperCase() ?? 'CAR' };
        if (input.wasPressed('KeyE')) {
          input.consumePressed('KeyE');
          this.parking.steal(parked);
          return true;
        }
        return false;
      }
      if (this.parking.atPodium(player.position, PODIUM_REACH)) {
        this.prompt = { action: 'retrieve', label: 'RETRIEVE', detail: 'VALET CAR' };
        if (input.wasPressed('KeyE')) {
          input.consumePressed('KeyE');
          this.parking.retrieveValet();
          return true;
        }
        return false;
      }
    }
    return false;
  }
}
