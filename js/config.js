// ==== Balance Constants (tweak here) ====
const CONFIG = {
  startingMoney: 14000,
  maxDays: 10,
  carsPerDayMin: 3,
  carsPerDayMax: 5,
  inspectCost: 220,
  cosmeticCleanCost: 180,
  sellAttemptFee: 120,
  buyerPreviewCount: 3,
  negotiation: {
    lowballRatio: 0.72,
    fairRatio: 0.9,
    askingRatio: 1.0,
    customMinRatio: 0.6,
    customMaxRatio: 1.2,
    reofferFloorRatio: 0.88,
    lowballBaseAccept: 0.28,
    fairBaseAccept: 0.62,
    askingBaseAccept: 0.92,
    offendedLeaveBaseChance: 0.2
  },
  selling: {
    quickMultiplier: 0.92,
    fairMultiplier: 1.0,
    premiumMultiplier: 1.1,
    postHaggleMin: 0.86,
    postHaggleMax: 0.95,
    pricePenaltyWeight: 0.85,
    cosmeticPenaltyWeight: 0.25,
    unresolvedPenaltyWeight: 0.8
  },
  notebook: {
    minSamplesForEstimate: 2
  }
};

const FAULTS = {
  engine: { label: "Engine Problem", repairCost: 1200, valueHit: 1800, salePenalty: 0.18 },
  transmission: { label: "Transmission Problem", repairCost: 1500, valueHit: 2200, salePenalty: 0.2 },
  rust: { label: "Rust", repairCost: 500, valueHit: 900, salePenalty: 0.08 },
  electrical: { label: "Electrical Issue", repairCost: 700, valueHit: 1100, salePenalty: 0.1 },
  interior: { label: "Interior Damage", repairCost: 350, valueHit: 700, salePenalty: 0.05 },
  tires: { label: "Tire Wear", repairCost: 300, valueHit: 550, salePenalty: 0.04 }
};

const BUYER_TYPES = [
  {
    name: "Bargain Hunter",
    tolerance: 0.92,
    flawSensitivity: 0.85,
    cosmeticNeed: 0.4,
    haggleChance: 0.75,
    profile: "Wants cheap deals, tolerates rough condition"
  },
  {
    name: "Picky Buyer",
    tolerance: 0.98,
    flawSensitivity: 1.6,
    cosmeticNeed: 1.2,
    haggleChance: 0.45,
    profile: "Pays okay only for clean cars with few faults"
  },
  {
    name: "Enthusiast",
    tolerance: 1.06,
    flawSensitivity: 0.9,
    cosmeticNeed: 0.7,
    haggleChance: 0.25,
    profile: "Accepts premium if key mechanical parts are sorted"
  },
  {
    name: "Impulse Buyer",
    tolerance: 1.12,
    flawSensitivity: 0.65,
    cosmeticNeed: 1.0,
    haggleChance: 0.2,
    profile: "Buys quickly if car looks appealing"
  }
];

const CAR_NAMES = [
  "RustRocket", "Civic-ish", "Turbo Brick", "Grandpa Cruiser", "Mystery Wagon", "Sad Coupe",
  "Budget Beast", "Parking Lot Legend", "Oil Leaker GT", "Noisy Hatch", "Moonlight Sedan"
];

const SELLER_PERSONALITIES = [
  { name: "Desperate", patience: 0.7 },
  { name: "Normal", patience: 1.0 },
  { name: "Stubborn", patience: 1.25 }
];

const MECHANICAL_FAULTS = new Set(["engine", "transmission", "tires"]);
