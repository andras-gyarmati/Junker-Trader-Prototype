// ==== Balance Constants (tweak here) ====
const CONFIG = {
  startingMoney: 14000,
  maxCities: 10,
  carsPerDayMin: 3,
  carsPerDayMax: 5,
  inspectCost: 220,
  cosmeticCleanCost: 180,
  sellAttemptFee: 120,
  roadsideScrapPenalty: 180,
  abandonTaxiCost: 260,
  buyerPreviewCount: 3,
  travel: {
    minChoices: 2,
    maxChoices: 3,
    minDistanceKm: 120,
    maxDistanceKm: 860,
    fuelCostPerKm: 0.48,
    baseWearPer100Km: 6,
    baseBreakdownChance: 0.055,
    hiddenFaultRevealChance: 0.18,
    newFaultChance: 0.14
  },
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

const CITY_POOL = [
  { name: "Lisbon", carPriceMult: 0.95, repairMult: 1.0, buyerRichness: 0.96, qualityShift: -0.04, shadySeller: 0.05, fuelMult: 0.98 },
  { name: "Madrid", carPriceMult: 1.0, repairMult: 1.02, buyerRichness: 1.0, qualityShift: 0, shadySeller: 0.02, fuelMult: 1.0 },
  { name: "Barcelona", carPriceMult: 1.04, repairMult: 1.05, buyerRichness: 1.04, qualityShift: 0.02, shadySeller: 0.03, fuelMult: 1.03 },
  { name: "Marseille", carPriceMult: 1.03, repairMult: 1.07, buyerRichness: 1.02, qualityShift: -0.01, shadySeller: 0.04, fuelMult: 1.04 },
  { name: "Milan", carPriceMult: 1.06, repairMult: 1.08, buyerRichness: 1.07, qualityShift: 0.03, shadySeller: 0.02, fuelMult: 1.06 },
  { name: "Munich", carPriceMult: 1.08, repairMult: 1.1, buyerRichness: 1.08, qualityShift: 0.04, shadySeller: 0.01, fuelMult: 1.05 },
  { name: "Prague", carPriceMult: 0.92, repairMult: 0.94, buyerRichness: 0.94, qualityShift: -0.03, shadySeller: 0.06, fuelMult: 0.96 },
  { name: "Vienna", carPriceMult: 1.02, repairMult: 1.03, buyerRichness: 1.04, qualityShift: 0.02, shadySeller: 0.02, fuelMult: 1.02 },
  { name: "Budapest", carPriceMult: 0.9, repairMult: 0.92, buyerRichness: 0.92, qualityShift: -0.05, shadySeller: 0.08, fuelMult: 0.95 },
  { name: "Warsaw", carPriceMult: 0.91, repairMult: 0.95, buyerRichness: 0.93, qualityShift: -0.04, shadySeller: 0.07, fuelMult: 0.97 },
  { name: "Berlin", carPriceMult: 1.05, repairMult: 1.06, buyerRichness: 1.06, qualityShift: 0.03, shadySeller: 0.01, fuelMult: 1.04 },
  { name: "Amsterdam", carPriceMult: 1.07, repairMult: 1.11, buyerRichness: 1.09, qualityShift: 0.03, shadySeller: 0.01, fuelMult: 1.08 },
  { name: "Brussels", carPriceMult: 1.01, repairMult: 1.03, buyerRichness: 1.01, qualityShift: 0.01, shadySeller: 0.03, fuelMult: 1.01 },
  { name: "Paris", carPriceMult: 1.09, repairMult: 1.12, buyerRichness: 1.1, qualityShift: 0.04, shadySeller: 0.01, fuelMult: 1.09 },
  { name: "Zurich", carPriceMult: 1.14, repairMult: 1.18, buyerRichness: 1.14, qualityShift: 0.05, shadySeller: 0.01, fuelMult: 1.14 },
  { name: "Copenhagen", carPriceMult: 1.1, repairMult: 1.14, buyerRichness: 1.11, qualityShift: 0.04, shadySeller: 0.01, fuelMult: 1.1 }
];

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
