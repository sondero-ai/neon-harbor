// Pure Solano story data: the five mission beats and the Pier 9 staging
// points. Nothing here touches the scene or three.js; missions.js and the
// E2E suite read these tables directly.

export const SAFEHOUSE = { x: -71.5, z: 36.6 };
export const MOTOR_SHOP = { x: 162, z: 18.2 };

// Pier 9 staging. The deck is pedestrian-only and its props are solid, so the
// heist crate and enemies stand on the open planks rather than in the shack,
// the benches or a sampled crate. The E2E suite validates every point against
// world.colliders.
export const PIER_HEIST_CRATES = [
  [-185, 70, 1.2], [-193, 75, 1.0], [-201, 62, 1.05], [-209, 77, 0.9],
  [-218, 64, 1.15], [-226, 75, 1.0], [-236, 63, 0.9], [-242, 77, 1.2],
  [-249, 66, 1.0], [-255, 74, 0.9],
];
export const PIER_HEIST_SPAWNS = [
  { x: -196, z: 66, health: 115 },
  { x: -199, z: 70, health: 115 },
  { x: -212, z: 69, health: 120 },
  { x: -221, z: 65, health: 115 },
  { x: -228, z: 75, health: 125 },
  { x: -238, z: 68, health: 120 },
  { x: -246, z: 73, health: 125 },
  { x: -254, z: 70, health: 280, boss: true, name: 'Aurelio', damage: 13, speed: 2.2 },
];

// The five story beats. Positions are on the street: a marker is where the
// player meets the job, not a trigger that teleports anyone.
export const STORY = [
  {
    key: 'riptide',
    title: 'The Riptide Job',
    operation: 'DOCK RUN',
    start: { x: -72, z: 26.2, facing: -Math.PI / 2 },
    reward: 1200,
    idleTitle: 'Meet Mira on the Strip',
    idleSub: 'A courier job on Vega Strip. Walk into the marker.',
    intro: [
      ['MIRA', 'Rae Solano. Back in the harbor and already late.'],
      ['RAE', 'I am not late. The city moved.'],
      ['MIRA', 'There is a Vela GT parked at the Sunset Hotel. Bring it to my bay on Motor Row. Do not scratch it.'],
      ['RAE', 'You are not going to ask how I have been?'],
      ['MIRA', 'I am asking you to steal a car. That is how I say welcome home.'],
    ],
    outro: [
      ['MIRA', 'Clean. The Solanos still know how to steal.'],
      ['RAE', 'The Solanos know how to make a mess look intentional.'],
    ],
  },
  {
    key: 'heat',
    title: 'Heat Check',
    operation: 'STRIP HEAT',
    start: { x: 162, z: 18.2, facing: Math.PI },
    reward: 1800,
    idleTitle: 'Find Mira at the Motor Row bay',
    idleSub: 'The Vela is hot. Mira has a way to cool it.',
    intro: [
      ['MIRA', 'That car had a tracker. Harbor PD is already on the lane.'],
      ['RAE', 'You could have said that before I drove it across the city.'],
      ['MIRA', 'Then it would not have been a test. Lose them. Get to the safehouse clean.'],
      ['RAE', 'And if I cannot?'],
      ['MIRA', 'Then I will need a new courier.'],
    ],
    outro: [
      ['MIRA', 'Stars are out. Maybe you are still good at this.'],
      ['RAE', 'Tell that to the five cruisers behind me.'],
    ],
  },
  {
    key: 'delivery',
    title: 'Special Delivery',
    operation: 'THE LEDGER RUN',
    start: { x: SAFEHOUSE.x - 4.9, z: SAFEHOUSE.z, facing: Math.PI },
    reward: 1500,
    idleTitle: 'Meet Mira at the safehouse',
    idleSub: 'She has a case for you. She will not say what is in it.',
    intro: [
      ['MIRA', 'Casa Luna. The case behind the bar. Do not open it.'],
      ['RAE', 'What is in it?'],
      ['MIRA', 'The reason you came home. Deliver it to Tomas at Luna Plaza. You have a hundred seconds before the bar closes and the back room talks.'],
      ['RAE', 'A courier run. Like the old days.'],
      ['MIRA', 'Exactly like the old days. That is the problem.'],
    ],
    outro: [
      ['TOMAS', 'Little cousin. You are carrying my ledger.'],
      ['RAE', 'Tomas. You look like a man who sold his own family.'],
      ['TOMAS', 'I look like a man who got paid. Meet me at the fountain.'],
    ],
  },
  {
    key: 'betrayal',
    title: 'Family Cut',
    operation: 'LUNA PLAZA',
    start: { x: 0, z: 17.6, facing: Math.PI },
    reward: 2400,
    idleTitle: 'Meet Tomas at Luna Plaza',
    idleSub: 'The fountain. Come armed. Tomas did not say why.',
    intro: [
      ['TOMAS', 'You brought the case. And a conscience. You always did.'],
      ['RAE', 'You sold the crew out, Tomas.'],
      ['TOMAS', 'I sold you. There is a difference. Boys, show her the difference.'],
      ['RAE', 'You should have brought more boys.'],
    ],
    outro: [
      ['AURELIO', 'You just killed my son, Rae.'],
      ['RAE', 'He killed the family first. Tell me where the pier is, Aurelio.'],
      ['AURELIO', 'Pier 9. Come see what your name buys now.'],
    ],
  },
  {
    key: 'pier',
    title: 'Pier 9 Burning',
    operation: 'LAST EXIT',
    start: { x: -168, z: 70, facing: -Math.PI / 2 },
    reward: 6000,
    idleTitle: 'Take the fight to Pier 9',
    idleSub: 'Aurelio Solano is waiting at the end of the pier. End it.',
    intro: [
      ['AURELIO', 'The harbor always collects, Rae. Even from family.'],
      ['RAE', 'Then collect this.'],
      ['MIRA', 'Rae, listen to me. The ledger burns tonight. You do not have to be standing next to it when it does.'],
      ['RAE', 'Yes I do. Keep the engine running.'],
    ],
    outro: [
      ['MIRA', 'The pier is burning. Tell me you are not still on it.'],
      ['RAE', 'The ledger is ash. The harbor is mine.'],
    ],
  },
];
