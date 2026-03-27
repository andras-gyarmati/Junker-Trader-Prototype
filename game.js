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
    reofferFloorRatio: 0.88,
    lowballBaseAccept: 0.28,
    fairBaseAccept: 0.62,
    askingBaseAccept: 0.92
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

// ==== Game State ====
const state = {
  runStartedAt: new Date().toISOString(),
  day: 1,
  money: CONFIG.startingMoney,
  totalSpent: 0,
  totalRevenue: 0,
  totalProfit: 0,
  dayCars: [],
  inventory: [],
  selectedCar: null,
  selectedInventoryId: null,
  buyerQueue: [],
  dayBuyerDemand: 1,
  buyersRemainingToday: 1,
  saleHistory: [],
  completedDeals: [],
  actions: [],
  saveSuggestedName: `junker-trader-log-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  savePending: false,
  saveInFlight: false,
  opfsReady: false,
  opfsDir: null,
  runBlobUrl: null,
  actionsBlobUrl: null,
  persistenceMode: "none",
  logLines: [],
  runOver: false,
  dailyEvent: null,
  series: {
    money: [],
    spent: [],
    profit: [],
    balanceDelta: []
  }
};

// ==== DOM refs ====
const el = {
  topbar: document.getElementById("topbar"),
  buyerForecast: document.getElementById("buyer-forecast"),
  marketPanel: document.getElementById("market-panel"),
  marketCars: document.getElementById("market-cars"),
  negotiationPanel: document.getElementById("negotiation-panel"),
  negotiationContent: document.getElementById("negotiation-content"),
  garagePanel: document.getElementById("garage-panel"),
  inventoryList: document.getElementById("inventory-list"),
  garageContent: document.getElementById("garage-content"),
  repairActions: document.getElementById("repair-actions"),
  salePanel: document.getElementById("sale-panel"),
  saleContent: document.getElementById("sale-content"),
  log: document.getElementById("event-log"),
  dealHistory: document.getElementById("deal-history"),
  runLogLink: document.getElementById("run-log-link"),
  actionsLogLink: document.getElementById("actions-log-link"),
  persistenceStatus: document.getElementById("persistence-status"),
  moneyGraph: document.getElementById("money-graph"),
  spentGraph: document.getElementById("spent-graph"),
  profitGraph: document.getElementById("profit-graph"),
  nextDayBtn: document.getElementById("next-day-btn"),
  toGarageFromMarketBtn: document.getElementById("to-garage-from-market-btn"),
  toMarketFromGarageBtn: document.getElementById("to-market-from-garage-btn"),
  offerLowball: document.getElementById("offer-lowball"),
  offerFair: document.getElementById("offer-fair"),
  offerAsking: document.getElementById("offer-asking"),
  walkAway: document.getElementById("walk-away"),
  inspectBtn: document.getElementById("inspect-btn"),
  sellQuickBtn: document.getElementById("sell-quick-btn"),
  sellFairBtn: document.getElementById("sell-fair-btn"),
  sellPremiumBtn: document.getElementById("sell-premium-btn"),
  sellJunkyardBtn: document.getElementById("sell-junkyard-btn"),
  continueBtn: document.getElementById("continue-btn")
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function fmt(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function balanceDelta() {
  return state.money - CONFIG.startingMoney;
}

function trackAction(type, data = {}, persistAfter = false) {
  state.actions.push({
    t: new Date().toISOString(),
    day: state.day,
    type,
    ...data
  });
  if (persistAfter) {
    schedulePersistence();
  }
}

async function ensureOpfsReady() {
  if (state.opfsReady) {
    return true;
  }
  if (!navigator.storage || !navigator.storage.getDirectory) {
    state.persistenceMode = "localStorage";
    return false;
  }
  try {
    state.opfsDir = await navigator.storage.getDirectory();
    state.opfsReady = true;
    state.persistenceMode = "opfs";
    return true;
  } catch (_err) {
    state.persistenceMode = "localStorage";
    return false;
  }
}

async function persistRunDataNow() {
  const payload = buildExportData();
  const json = JSON.stringify(payload);
  const ndjson = state.actions.map((a) => JSON.stringify(a)).join("\n");

  if (await ensureOpfsReady()) {
    const runFile = await state.opfsDir.getFileHandle(`${state.saveSuggestedName}.json`, { create: true });
    const writable = await runFile.createWritable();
    await writable.write(json);
    await writable.close();
    const actionsFile = await state.opfsDir.getFileHandle(`${state.saveSuggestedName}-actions.ndjson`, { create: true });
    const actionsWritable = await actionsFile.createWritable();
    await actionsWritable.write(ndjson);
    await actionsWritable.close();
    renderPersistenceLinks(json, ndjson);
    return;
  }

  localStorage.setItem("junker_trader_latest_run", json);
  renderPersistenceLinks(json, ndjson);
}

function schedulePersistence() {
  state.savePending = true;
  if (state.saveInFlight) {
    return;
  }

  state.saveInFlight = true;
  setTimeout(async () => {
    while (state.savePending) {
      state.savePending = false;
      try {
        await persistRunDataNow();
      } catch (_err) {
        state.persistenceMode = "localStorage";
        try {
          localStorage.setItem("junker_trader_latest_run", JSON.stringify(buildExportData()));
        } catch (_err2) {
          // best effort only
        }
      }
    }
    state.saveInFlight = false;
  }, 0);
}

function log(msg) {
  state.logLines.unshift(`[Day ${state.day}] ${msg}`);
  el.log.textContent = state.logLines.join("\n");
  trackAction("log", { msg });
}

function renderPersistenceLinks(runJson, actionsNdjson) {
  if (!el.runLogLink || !el.actionsLogLink || !el.persistenceStatus) {
    return;
  }

  if (state.runBlobUrl) {
    URL.revokeObjectURL(state.runBlobUrl);
  }
  if (state.actionsBlobUrl) {
    URL.revokeObjectURL(state.actionsBlobUrl);
  }

  state.runBlobUrl = URL.createObjectURL(new Blob([runJson], { type: "application/json" }));
  state.actionsBlobUrl = URL.createObjectURL(new Blob([actionsNdjson], { type: "application/x-ndjson" }));

  const runName = `${state.saveSuggestedName}.json`;
  const actionsName = `${state.saveSuggestedName}-actions.ndjson`;

  el.runLogLink.href = state.runBlobUrl;
  el.runLogLink.download = runName;
  el.runLogLink.textContent = runName;

  el.actionsLogLink.href = state.actionsBlobUrl;
  el.actionsLogLink.download = actionsName;
  el.actionsLogLink.textContent = actionsName;

  el.persistenceStatus.textContent = `Persistence: ${state.persistenceMode}`;
}

function showPanel(panel) {
  [el.marketPanel, el.negotiationPanel, el.garagePanel, el.salePanel].forEach((p) => p.classList.remove("active"));
  panel.classList.add("active");
}

function getCurrentBuyer() {
  return state.buyerQueue[0] || null;
}

function ensureBuyerQueue() {
  while (state.buyerQueue.length < CONFIG.buyerPreviewCount) {
    state.buyerQueue.push(pick(BUYER_TYPES));
  }
}

function advanceBuyerQueue() {
  state.buyerQueue.shift();
  ensureBuyerQueue();
}

function rollDailyBuyerDemand() {
  let demand = randInt(1, 3);
  if (state.dailyEvent.name === "Weekend Hype") {
    demand += 1;
  }
  if (state.dailyEvent.name === "Tax Panic") {
    demand -= 1;
  }
  state.dayBuyerDemand = clamp(demand, 1, 4);
  state.buyersRemainingToday = state.dayBuyerDemand;
}

function discoveredFaults(car) {
  if (!car.inspected) {
    return [...car.visibleFaults];
  }
  return [...car.visibleFaults, ...car.hiddenFaults];
}

function allFaults(car) {
  return [...car.visibleFaults, ...car.hiddenFaults];
}

function unresolvedFaults(car) {
  return allFaults(car).filter((faultId) => !car.repairedFaults.has(faultId));
}

function formatWorkLogEntry(w) {
  const dayLabel = `d${w.day}`;
  if (w.kind === "buy") return `${dayLabel}:buy:-${fmt(w.amount)}`;
  if (w.kind === "inspect") return `${dayLabel}:inspect:-${fmt(w.amount)}`;
  if (w.kind === "repair") return `${dayLabel}:repair:${w.faultId}:-${fmt(w.amount)}`;
  if (w.kind === "clean") return `${dayLabel}:clean:-${fmt(w.amount)}`;
  if (w.kind === "sell_attempt") return `${dayLabel}:sellAttempt:${w.mode}:-${fmt(w.amount)}`;
  if (w.kind === "sell_success") return `${dayLabel}:sell:+${fmt(w.amount)}`;
  if (w.kind === "junkyard_sale") return `${dayLabel}:junkyard:+${fmt(w.amount)}`;
  if (w.kind === "sell_fail") return `${dayLabel}:sell:failed`;
  return `${dayLabel}:${w.kind}`;
}

function estimateRepairValueGain(faultId) {
  const fallback = FAULTS[faultId].valueHit;
  const relevant = state.completedDeals.filter((d) => (d.allFaultsAtSale || []).includes(faultId));
  if (relevant.length < 2) {
    return { gain: fallback, samples: relevant.length, confidence: "low" };
  }

  const repaired = relevant.filter((d) => (d.faultsFixed || []).includes(faultId));
  const unresolved = relevant.filter((d) => (d.unresolvedAtSale || []).includes(faultId));
  if (repaired.length === 0 || unresolved.length === 0) {
    return { gain: fallback, samples: relevant.length, confidence: "low" };
  }

  const avg = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0) / arr.length;
  const repairedMultiple = avg(repaired, (d) => d.salePrice / Math.max(800, d.referenceValueAtSale || 800));
  const unresolvedMultiple = avg(unresolved, (d) => d.salePrice / Math.max(800, d.referenceValueAtSale || 800));
  const baseRef = avg(relevant, (d) => Math.max(800, d.referenceValueAtSale || 800));
  const observedGain = Math.max(120, (repairedMultiple - unresolvedMultiple) * baseRef);

  const weight = clamp(relevant.length / (relevant.length + 10), 0.08, 0.85);
  const blended = fallback * (1 - weight) + observedGain * weight;
  const confidence = relevant.length >= 16 ? "high" : relevant.length >= 8 ? "med" : "low";
  return { gain: blended, samples: relevant.length, confidence };
}

function calcTrueValue(car) {
  let val = car.baseMarketValue;
  allFaults(car).forEach((f) => {
    if (!car.repairedFaults.has(f)) {
      val -= FAULTS[f].valueHit;
    }
  });
  val += (car.cosmeticCondition - 50) * 35;
  return Math.max(650, val);
}

function carComparableData(car) {
  return {
    name: car.name,
    age: car.age,
    mileage: car.mileage,
    cosmeticCondition: car.cosmeticCondition,
    visibleFaultCount: car.visibleFaults.length
  };
}

function notebookEstimateRange(car) {
  if (state.saleHistory.length < CONFIG.notebook.minSamplesForEstimate) {
    return null;
  }

  const probe = carComparableData(car);
  let weightedSum = 0;
  let totalWeight = 0;
  const weightedPrices = [];
  let matchedSamples = 0;
  let strongestWeight = 0;

  state.saleHistory.forEach((entry) => {
    const namePenalty = entry.name === probe.name ? 0 : 1.2;
    const agePenalty = Math.abs(entry.age - probe.age) * 0.08;
    const mileagePenalty = Math.abs(entry.mileage - probe.mileage) / 60000;
    const cosmeticPenalty = Math.abs(entry.cosmeticCondition - probe.cosmeticCondition) / 30;
    const visiblePenalty = Math.abs(entry.visibleFaultCount - probe.visibleFaultCount) * 0.35;
    const dist = namePenalty + agePenalty + mileagePenalty + cosmeticPenalty + visiblePenalty;
    const weight = 1 / (1 + dist);

    weightedSum += entry.finalPrice * weight;
    totalWeight += weight;
    weightedPrices.push({ price: entry.finalPrice, weight });
    if (weight >= 0.22) {
      matchedSamples += 1;
    }
    strongestWeight = Math.max(strongestWeight, weight);
  });

  if (totalWeight <= 0) {
    return null;
  }

  const mean = weightedSum / totalWeight;
  let variance = 0;
  weightedPrices.forEach((x) => {
    variance += ((x.price - mean) ** 2) * x.weight;
  });
  variance /= totalWeight;

  const stdDev = Math.sqrt(variance);
  const totalSamples = state.saleHistory.length;
  const effectiveSamples = Math.max(1, totalWeight);
  const confidence = clamp((effectiveSamples / 8) + (matchedSamples / 14), 0.08, 0.98);
  const slowConvergeFactor = clamp(1.95 - Math.log(totalSamples + 1) * 0.24, 0.8, 1.95);
  const minHalfRange = 280 * slowConvergeFactor;
  const halfRange = Math.max(minHalfRange, stdDev * (0.95 + 2.8 / Math.sqrt(effectiveSamples))) * slowConvergeFactor;

  return {
    low: Math.max(300, mean - halfRange),
    high: mean + halfRange,
    mean,
    sampleCount: totalSamples,
    matchedSamples,
    strongestWeight,
    confidence
  };
}

function generateCar() {
  const age = randInt(6, 23);
  const mileage = randInt(70000, 280000);
  const cosmeticCondition = randInt(20, 95);
  const riskScoreModifier = Math.random();

  let baseMarketValue = 14500 - age * 265 - mileage * 0.025 + randInt(-1200, 1200);
  baseMarketValue = clamp(baseMarketValue, 1300, 12000);

  const faultPool = Object.keys(FAULTS);
  const visibleFaults = [];
  const hiddenFaults = [];

  const faultCount = randInt(1, 4);
  for (let i = 0; i < faultCount; i += 1) {
    const fault = pick(faultPool);
    if (visibleFaults.includes(fault) || hiddenFaults.includes(fault)) {
      continue;
    }
    if (Math.random() < 0.55) {
      visibleFaults.push(fault);
    } else {
      hiddenFaults.push(fault);
    }
  }

  if (visibleFaults.length === 0 && hiddenFaults.length === 0) {
    visibleFaults.push(pick(faultPool));
  }

  const visiblePenalty = visibleFaults.reduce((sum, f) => sum + FAULTS[f].valueHit * 0.7, 0);
  const hiddenPenalty = hiddenFaults.reduce((sum, f) => sum + FAULTS[f].valueHit * 0.3, 0);
  const sellerPersonality = pick(SELLER_PERSONALITIES);

  let askingPrice = baseMarketValue - visiblePenalty - hiddenPenalty + randInt(-400, 900);
  askingPrice = clamp(askingPrice, 550, baseMarketValue * 1.08);

  return {
    id: makeId(),
    name: pick(CAR_NAMES),
    age,
    mileage,
    baseMarketValue,
    askingPrice: Math.round(askingPrice),
    visibleFaults,
    hiddenFaults,
    cosmeticCondition,
    riskScoreModifier,
    sellerPersonality,
    lastRejectedOffer: 0
  };
}

function applyDailyEvent() {
  const roll = Math.random();
  state.dailyEvent = { name: "None", desc: "No major market shift.", askModifier: 1, saleModifier: 1, inspectModifier: 1 };

  if (roll < 0.2) {
    state.dailyEvent = {
      name: "Rainy Market",
      desc: "Rusty heaps flood listings. More rust faults.",
      askModifier: 0.97,
      saleModifier: 1,
      inspectModifier: 1
    };
  } else if (roll < 0.38) {
    state.dailyEvent = {
      name: "Tax Panic",
      desc: "Sellers drop prices to unload quickly.",
      askModifier: 0.9,
      saleModifier: 1,
      inspectModifier: 1
    };
  } else if (roll < 0.56) {
    state.dailyEvent = {
      name: "Weekend Hype",
      desc: "Buyers pay a bit more today.",
      askModifier: 1,
      saleModifier: 1.06,
      inspectModifier: 1
    };
  } else if (roll < 0.72) {
    state.dailyEvent = {
      name: "Mechanic Strike",
      desc: "Engine/transmission/tire repairs are blocked today; other work costs more.",
      askModifier: 1,
      saleModifier: 1,
      inspectModifier: 1.25
    };
  }
}

function generateDayCars() {
  applyDailyEvent();
  rollDailyBuyerDemand();
  const count = randInt(CONFIG.carsPerDayMin, CONFIG.carsPerDayMax);
  state.dayCars = Array.from({ length: count }, () => {
    const car = generateCar();

    if (state.dailyEvent.name === "Rainy Market" && Math.random() < 0.45 && !car.visibleFaults.includes("rust") && !car.hiddenFaults.includes("rust")) {
      car.visibleFaults.push("rust");
      car.askingPrice = Math.max(450, car.askingPrice - 300);
    }

    car.askingPrice = Math.round(car.askingPrice * state.dailyEvent.askModifier);
    return car;
  });
}

function renderTopbar() {
  const buyer = getCurrentBuyer();
  const nextBuyer = state.buyerQueue[1];

  el.topbar.innerHTML = `
    <strong>Day:</strong> ${state.day}/${CONFIG.maxDays}
    | <strong>Money:</strong> ${fmt(state.money)}
    | <strong>Revenue:</strong> ${fmt(state.totalProfit)}
    | <strong>Balance Delta:</strong> ${fmt(balanceDelta())}
    | <strong>Inventory:</strong> ${state.inventory.length}
    | <strong>Today Buyer:</strong> ${buyer ? buyer.name : "N/A"}
    ${nextBuyer ? `| <strong>Next:</strong> ${nextBuyer.name}` : ""}
    | <strong>Buyers Left Today:</strong> ${state.buyersRemainingToday}/${state.dayBuyerDemand}
    | <strong>Event:</strong> ${state.dailyEvent.name}
  `;
}

function renderBuyerForecast() {
  const buyer = getCurrentBuyer();
  const preview = state.buyerQueue
    .slice(0, CONFIG.buyerPreviewCount)
    .map((b, idx) => `${idx === 0 ? "Now" : `Next ${idx}`}: ${b.name}`)
    .join(" | ");

  el.buyerForecast.innerHTML = `
    <strong>Buyer Queue:</strong> ${preview}<br>
    <strong>Current Buyer Need:</strong> ${buyer ? buyer.profile : "N/A"}<br>
    <strong>Daily demand:</strong> ${state.buyersRemainingToday} buyer(s) left today<br>
    <strong>Today Event:</strong> ${state.dailyEvent.name} - ${state.dailyEvent.desc}
  `;
}

function renderMarket() {
  renderTopbar();
  renderBuyerForecast();
  el.marketCars.innerHTML = "";

  if (state.dayCars.length === 0) {
    el.marketCars.innerHTML = "<p>No cars left today.</p>";
    return;
  }

  state.dayCars.forEach((car) => {
    const card = document.createElement("div");
    card.className = "card";
    const visible = car.visibleFaults.length ? car.visibleFaults.map((f) => FAULTS[f].label).join(", ") : "none obvious";
    const estimate = notebookEstimateRange(car);

    card.innerHTML = `
      <strong>${car.name}</strong><br>
      Age: ${car.age} years | Mileage: ${car.mileage.toLocaleString()} km<br>
      Cosmetic: ${car.cosmeticCondition}/100 | Seller: ${car.sellerPersonality.name}<br>
      Visible faults: ${visible}<br>
      Asking: ${fmt(car.askingPrice)}<br>
      Notebook estimate: ${estimate ? `${fmt(estimate.low)} - ${fmt(estimate.high)}` : "insufficient history"}<br>
      Notebook basis: ${estimate ? `${estimate.matchedSamples} strong matches / ${estimate.sampleCount} total sales` : "sell more cars to train notebook"}
    `;

    const btn = document.createElement("button");
    btn.textContent = "Negotiate";
    btn.addEventListener("click", () => {
      trackAction("ui_click", { control: "negotiate-btn", carId: car.id, name: car.name }, true);
      startNegotiation(car.id);
    });

    card.appendChild(document.createElement("br"));
    card.appendChild(btn);
    el.marketCars.appendChild(card);
  });
}

function startNegotiation(carId) {
  const car = state.dayCars.find((c) => c.id === carId);
  if (!car) {
    return;
  }

  state.selectedCar = car;
  const visible = car.visibleFaults.length ? car.visibleFaults.map((f) => FAULTS[f].label).join(", ") : "none obvious";

  el.negotiationContent.innerHTML = `
    <div class="card">
      <strong>${car.name}</strong><br>
      Asking: ${fmt(car.askingPrice)}<br>
      Age: ${car.age} | Mileage: ${car.mileage.toLocaleString()} km<br>
      Visible faults: ${visible}<br>
      Seller mood: ${car.sellerPersonality.name}
    </div>
  `;
  showPanel(el.negotiationPanel);
}

function attemptOffer(type) {
  const car = state.selectedCar;
  if (!car) {
    return;
  }

  let ratio = CONFIG.negotiation.fairRatio;
  let baseAccept = CONFIG.negotiation.fairBaseAccept;
  if (type === "lowball") {
    ratio = CONFIG.negotiation.lowballRatio;
    baseAccept = CONFIG.negotiation.lowballBaseAccept;
  } else if (type === "asking") {
    ratio = CONFIG.negotiation.askingRatio;
    baseAccept = CONFIG.negotiation.askingBaseAccept;
  }

  const offer = Math.round(car.askingPrice * ratio);
  trackAction("offer", { carId: car.id, name: car.name, type, offer, asking: car.askingPrice }, true);
  const trueValue = calcTrueValue({ ...car, repairedFaults: new Set(), inspected: true });
  const qualityBonus = clamp((trueValue / car.askingPrice - 1) * 0.25, -0.12, 0.12);
  const patienceBonus = (1 - car.sellerPersonality.patience) * 0.2;
  const acceptChance = clamp(baseAccept + qualityBonus + patienceBonus, 0.05, 0.98);

  if (offer > state.money) {
    log(`Offer failed: you only have ${fmt(state.money)}.`);
    return;
  }

  if (offer <= car.lastRejectedOffer * CONFIG.negotiation.reofferFloorRatio) {
    log(`Seller rejects ${fmt(offer)} immediately after earlier higher offer.`);
    trackAction("offer_reject_floor", { carId: car.id, offer, lastRejectedOffer: car.lastRejectedOffer }, true);
    showPanel(el.marketPanel);
    return;
  }

  if (offer >= car.askingPrice) {
    buyCar(car, offer);
    log("Seller accepted immediately because offer met/exceeded asking.");
    trackAction("offer_accept_auto", { carId: car.id, offer }, true);
    return;
  }

  if (Math.random() < acceptChance) {
    buyCar(car, offer);
    trackAction("offer_accept", { carId: car.id, offer, acceptChance }, true);
    return;
  }

  car.lastRejectedOffer = offer;
  log(`Seller rejected ${fmt(offer)} for ${car.name}.`);
  trackAction("offer_reject", { carId: car.id, offer, acceptChance }, true);
  showPanel(el.marketPanel);
}

function buyCar(car, price) {
  const ownedCar = {
    ...car,
    boughtFor: price,
    totalInvested: price,
    repairSpend: 0,
    inspectSpend: 0,
    cleaningSpend: 0,
    sellFees: 0,
    saleAttempts: 0,
    actionHistory: [{ kind: "buy", day: state.day, amount: price }],
    inspected: false,
    repairedFaults: new Set(),
    purchaseDay: state.day
  };

  state.money -= price;
  state.totalSpent += price;
  state.totalProfit = state.totalRevenue;
  state.inventory.push(ownedCar);
  state.selectedInventoryId = ownedCar.id;
  state.dayCars = state.dayCars.filter((c) => c.id !== car.id);

  log(`Bought ${car.name} for ${fmt(price)}. Inventory now ${state.inventory.length}.`);
  trackAction("buy", { carId: car.id, name: car.name, price }, true);
  recordSeriesPoint();
  renderGraphs();
  renderMarket();
  showPanel(el.marketPanel);
}

function getSelectedInventoryCar() {
  if (!state.selectedInventoryId) {
    return null;
  }
  return state.inventory.find((car) => car.id === state.selectedInventoryId) || null;
}

function selectInventoryCar(carId) {
  state.selectedInventoryId = carId;
  renderGarage();
}

function inspectSelectedCar() {
  const car = getSelectedInventoryCar();
  if (!car || car.inspected) {
    return;
  }

  const cost = Math.round(CONFIG.inspectCost * state.dailyEvent.inspectModifier);
  if (state.money < cost) {
    log(`Cannot inspect: need ${fmt(cost)}.`);
    return;
  }

  state.money -= cost;
  state.totalSpent += cost;
  state.totalProfit = state.totalRevenue;
  car.inspectSpend += cost;
  car.totalInvested += cost;
  car.actionHistory.push({ kind: "inspect", day: state.day, amount: cost });
  car.inspected = true;
  log(`Inspection complete on ${car.name}. Hidden faults revealed.`);
  trackAction("inspect", { carId: car.id, name: car.name, cost }, true);
  recordSeriesPoint();
  renderGraphs();
  renderGarage();
}

function repairSelectedCarFault(faultId) {
  const car = getSelectedInventoryCar();
  if (!car) {
    return;
  }
  if (car.repairedFaults.has(faultId)) {
    return;
  }

  const info = FAULTS[faultId];
  if (state.dailyEvent.name === "Mechanic Strike" && MECHANICAL_FAULTS.has(faultId)) {
    log(`Mechanic Strike blocks repair on ${info.label} today.`);
    return;
  }

  const cost = Math.round(info.repairCost * state.dailyEvent.inspectModifier);
  if (state.money < cost) {
    log(`Cannot repair ${info.label}: need ${fmt(cost)}.`);
    return;
  }

  state.money -= cost;
  state.totalSpent += cost;
  state.totalProfit = state.totalRevenue;
  car.repairSpend += cost;
  car.totalInvested += cost;
  car.actionHistory.push({ kind: "repair", day: state.day, amount: cost, faultId });
  car.repairedFaults.add(faultId);
  log(`Repaired ${info.label} on ${car.name} for ${fmt(cost)}.`);
  trackAction("repair", { carId: car.id, name: car.name, faultId, cost }, true);
  recordSeriesPoint();
  renderGraphs();
  renderGarage();
}

function cleanSelectedCarCosmetic() {
  const car = getSelectedInventoryCar();
  if (!car) {
    return;
  }

  if (state.money < CONFIG.cosmeticCleanCost) {
    log(`Cannot clean: need ${fmt(CONFIG.cosmeticCleanCost)}.`);
    return;
  }

  state.money -= CONFIG.cosmeticCleanCost;
  state.totalSpent += CONFIG.cosmeticCleanCost;
  state.totalProfit = state.totalRevenue;
  car.cleaningSpend += CONFIG.cosmeticCleanCost;
  car.totalInvested += CONFIG.cosmeticCleanCost;
  car.actionHistory.push({ kind: "clean", day: state.day, amount: CONFIG.cosmeticCleanCost });
  car.cosmeticCondition = clamp(car.cosmeticCondition + 10, 0, 100);
  log(`Quick cleaning done on ${car.name} for ${fmt(CONFIG.cosmeticCleanCost)}.`);
  trackAction("clean", { carId: car.id, name: car.name, cost: CONFIG.cosmeticCleanCost }, true);
  recordSeriesPoint();
  renderGraphs();
  renderGarage();
}

function buyerFitBonus(buyer, car, unresolved) {
  const unresolvedCount = unresolved.length;
  let bonus = 0;

  if (buyer.name === "Bargain Hunter") {
    if (car.boughtFor < 4000) {
      bonus += 0.1;
    }
    if (car.cosmeticCondition < 45) {
      bonus -= 0.03;
    }
  }

  if (buyer.name === "Picky Buyer") {
    if (unresolvedCount === 0 && car.cosmeticCondition >= 70) {
      bonus += 0.22;
    }
    if (unresolvedCount >= 2) {
      bonus -= 0.25;
    }
  }

  if (buyer.name === "Enthusiast") {
    const majorUnresolved = unresolved.includes("engine") || unresolved.includes("transmission");
    if (!majorUnresolved) {
      bonus += 0.16;
    } else {
      bonus -= 0.16;
    }
  }

  if (buyer.name === "Impulse Buyer") {
    if (car.cosmeticCondition >= 78) {
      bonus += 0.18;
    }
    if (car.cosmeticCondition <= 35) {
      bonus -= 0.12;
    }
  }

  return bonus;
}

function salePriceMultiplierForMode(priceMode) {
  if (priceMode === "quick") return CONFIG.selling.quickMultiplier;
  if (priceMode === "premium") return CONFIG.selling.premiumMultiplier;
  return CONFIG.selling.fairMultiplier;
}

function estimateExpectedSalePrice(car, buyer, priceMode = "fair") {
  if (!buyer) {
    return 0;
  }
  const multiplier = salePriceMultiplierForMode(priceMode);
  const trueValue = calcTrueValue(car) * state.dailyEvent.saleModifier;
  const listPrice = Math.round(trueValue * multiplier);
  const unresolved = unresolvedFaults(car);
  const unresolvedPenalty = unresolved.reduce((sum, f) => sum + FAULTS[f].salePenalty, 0) * buyer.flawSensitivity;
  const cosmeticPenalty = ((100 - car.cosmeticCondition) / 100) * buyer.cosmeticNeed;
  const pricePressure = listPrice / Math.max(1, trueValue);

  let sellChance = 0.72;
  sellChance -= unresolvedPenalty * CONFIG.selling.unresolvedPenaltyWeight;
  sellChance -= cosmeticPenalty * CONFIG.selling.cosmeticPenaltyWeight;
  sellChance -= (pricePressure - buyer.tolerance) * CONFIG.selling.pricePenaltyWeight;
  sellChance += buyerFitBonus(buyer, car, unresolved);
  sellChance = clamp(sellChance, 0.03, 0.97);

  const hagglePrice = Math.round(listPrice * ((CONFIG.selling.postHaggleMin + CONFIG.selling.postHaggleMax) / 2));
  const dropPrice = Math.round(listPrice * 0.92);
  const sellFailChance = 1 - sellChance;
  const fallbackSellChance = clamp(sellChance + 0.2, 0.08, 0.95);

  const expected = (sellChance * listPrice) +
    (sellFailChance * buyer.haggleChance * hagglePrice) +
    (sellFailChance * (1 - buyer.haggleChance) * fallbackSellChance * dropPrice);
  return Math.round(expected);
}

function projectedDealProfitAfterRepair(car, faultId) {
  const buyer = getCurrentBuyer();
  const simulated = {
    ...car,
    repairedFaults: new Set(car.repairedFaults)
  };
  simulated.repairedFaults.add(faultId);

  const repairCost = Math.round(FAULTS[faultId].repairCost * state.dailyEvent.inspectModifier);
  const expectedSale = estimateExpectedSalePrice(simulated, buyer, "fair");
  const projectedProfit = expectedSale - (car.totalInvested + repairCost + CONFIG.sellAttemptFee);
  return {
    expectedSale,
    projectedProfit,
    repairCost
  };
}

function calcJunkyardPrice(car) {
  const unresolved = unresolvedFaults(car);
  const salvageBase = car.baseMarketValue * 0.22;
  const repairedBonus = car.repairedFaults.size * 110;
  const unresolvedPenalty = unresolved.reduce((sum, f) => sum + FAULTS[f].valueHit * 0.1, 0);
  const cosmeticBonus = (car.cosmeticCondition - 50) * 8;
  const inspectedBonus = car.inspected ? 120 : 0;
  const raw = salvageBase + repairedBonus + cosmeticBonus + inspectedBonus - unresolvedPenalty;
  return Math.round(clamp(raw, 250, 4200));
}

function attemptSale(priceMode) {
  const car = getSelectedInventoryCar();
  const buyer = getCurrentBuyer();
  if (!car || !buyer) {
    return;
  }

  if (state.buyersRemainingToday <= 0) {
    log("No buyers left today. End day for the next market batch.");
    return;
  }

  let multiplier = CONFIG.selling.fairMultiplier;
  if (priceMode === "quick") {
    multiplier = CONFIG.selling.quickMultiplier;
  } else if (priceMode === "premium") {
    multiplier = CONFIG.selling.premiumMultiplier;
  }

  const trueValue = calcTrueValue(car) * state.dailyEvent.saleModifier;
  let listPrice = Math.round(trueValue * multiplier);

  const unresolved = unresolvedFaults(car);
  const unresolvedPenalty = unresolved.reduce((sum, f) => sum + FAULTS[f].salePenalty, 0) * buyer.flawSensitivity;
  const cosmeticPenalty = ((100 - car.cosmeticCondition) / 100) * buyer.cosmeticNeed;
  const pricePressure = listPrice / Math.max(1, trueValue);

  let sellChance = 0.72;
  sellChance -= unresolvedPenalty * CONFIG.selling.unresolvedPenaltyWeight;
  sellChance -= cosmeticPenalty * CONFIG.selling.cosmeticPenaltyWeight;
  sellChance -= (pricePressure - buyer.tolerance) * CONFIG.selling.pricePenaltyWeight;
  sellChance += buyerFitBonus(buyer, car, unresolved);
  sellChance = clamp(sellChance, 0.03, 0.97);

  state.money -= CONFIG.sellAttemptFee;
  state.totalSpent += CONFIG.sellAttemptFee;
  car.sellFees += CONFIG.sellAttemptFee;
  car.totalInvested += CONFIG.sellAttemptFee;
  car.saleAttempts += 1;
  car.actionHistory.push({ kind: "sell_attempt", day: state.day, amount: CONFIG.sellAttemptFee, mode: priceMode });

  let outcome = "failed sale";
  let finalPrice = 0;

  if (Math.random() < sellChance) {
    outcome = "sold instantly";
    finalPrice = listPrice;
  } else if (Math.random() < buyer.haggleChance) {
    outcome = "buyer forced lower final price";
    finalPrice = Math.round(listPrice * (CONFIG.selling.postHaggleMin + Math.random() * (CONFIG.selling.postHaggleMax - CONFIG.selling.postHaggleMin)));
  } else if (priceMode !== "quick" && Math.random() < clamp(sellChance + 0.2, 0.08, 0.95)) {
    outcome = "sold after price drop";
    listPrice = Math.round(listPrice * 0.92);
    finalPrice = listPrice;
  }

  if (finalPrice > 0) {
    car.actionHistory.push({ kind: "sell_success", day: state.day, amount: finalPrice, mode: priceMode });
    state.money += finalPrice;
    state.totalRevenue += finalPrice;
    state.totalProfit = state.totalRevenue;
    state.saleHistory.push({ ...carComparableData(car), finalPrice });
    const dealProfit = finalPrice - car.totalInvested;
    state.completedDeals.unshift({
      id: car.id,
      name: car.name,
      purchaseDay: car.purchaseDay,
      sellDay: state.day,
      boughtFor: car.boughtFor,
      invested: car.totalInvested,
      salePrice: finalPrice,
      dealProfit,
      saleAttempts: car.saleAttempts,
      buyerType: buyer.name,
      mode: priceMode,
      faultsFixed: [...car.repairedFaults],
      allFaultsAtSale: allFaults(car),
      unresolvedAtSale: unresolved,
      referenceValueAtSale: car.baseMarketValue + (car.cosmeticCondition - 50) * 35,
      workLog: [...car.actionHistory]
    });
    state.inventory = state.inventory.filter((c) => c.id !== car.id);
    if (state.selectedInventoryId === car.id) {
      state.selectedInventoryId = state.inventory[0]?.id || null;
    }
    log(`${buyer.name} ${outcome}: ${car.name} sold for ${fmt(finalPrice)}.`);
    trackAction("sell_success", { carId: car.id, name: car.name, buyer: buyer.name, mode: priceMode, listPrice, finalPrice, invested: car.totalInvested, dealProfit }, true);
  } else {
    car.actionHistory.push({ kind: "sell_fail", day: state.day, mode: priceMode });
    state.totalProfit = state.totalRevenue;
    log(`${buyer.name} ${outcome}: ${car.name} not sold. Car stays in inventory.`);
    trackAction("sell_fail", { carId: car.id, name: car.name, buyer: buyer.name, mode: priceMode, listPrice }, true);
  }

  state.buyersRemainingToday = Math.max(0, state.buyersRemainingToday - 1);
  advanceBuyerQueue();
  log(`${state.buyersRemainingToday} buyer(s) left today.`);
  recordSeriesPoint();
  renderGraphs();
  renderDealHistory();

  el.saleContent.innerHTML = `
    <div class="card">
      Buyer type: <strong>${buyer.name}</strong><br>
      Buyer profile: ${buyer.profile}<br>
      Buyers left today after this: ${state.buyersRemainingToday}<br>
      Pricing mode: ${priceMode}<br>
      Listing price: ${fmt(listPrice)}<br>
      Internal value model: ${fmt(trueValue)}<br>
      Unresolved faults: ${unresolved.length ? unresolved.map((f) => FAULTS[f].label).join(", ") : "none"}<br>
      Outcome: <strong>${outcome}</strong><br>
      ${finalPrice > 0 ? `Final sale price: ${fmt(finalPrice)}` : "No sale"}
    </div>
  `;

  renderTopbar();
  showPanel(el.salePanel);
}

function sellSelectedToJunkyard() {
  const car = getSelectedInventoryCar();
  if (!car) {
    return;
  }

  const payout = calcJunkyardPrice(car);
  car.actionHistory.push({ kind: "junkyard_sale", day: state.day, amount: payout });
  state.money += payout;
  state.totalRevenue += payout;
  state.totalProfit = state.totalRevenue;

  const dealProfit = payout - car.totalInvested;
  state.completedDeals.unshift({
    id: car.id,
    name: car.name,
    purchaseDay: car.purchaseDay,
    sellDay: state.day,
    boughtFor: car.boughtFor,
    invested: car.totalInvested,
    salePrice: payout,
    dealProfit,
    saleAttempts: car.saleAttempts,
    buyerType: "Junkyard",
    mode: "junkyard",
    faultsFixed: [...car.repairedFaults],
    allFaultsAtSale: allFaults(car),
    unresolvedAtSale: unresolvedFaults(car),
    referenceValueAtSale: car.baseMarketValue + (car.cosmeticCondition - 50) * 35,
    workLog: [...car.actionHistory]
  });

  state.inventory = state.inventory.filter((c) => c.id !== car.id);
  if (state.selectedInventoryId === car.id) {
    state.selectedInventoryId = state.inventory[0]?.id || null;
  }
  log(`Sold ${car.name} to junkyard for ${fmt(payout)} (${dealProfit >= 0 ? "+" : ""}${fmt(dealProfit)}).`);
  trackAction("junkyard_sale", { carId: car.id, name: car.name, payout, invested: car.totalInvested, dealProfit }, true);

  recordSeriesPoint();
  renderGraphs();
  renderDealHistory();
  renderGarage();
}

function renderInventoryList() {
  el.inventoryList.innerHTML = "";
  if (state.inventory.length === 0) {
    el.inventoryList.innerHTML = "<div class=\"card\">Inventory empty. Buy cars in the market.</div>";
    return;
  }

  state.inventory.forEach((car) => {
    const card = document.createElement("div");
    card.className = "card";
    const unresolved = unresolvedFaults(car);

    card.innerHTML = `
      <strong>${car.name}</strong>
      | Bought: ${fmt(car.boughtFor)}
      | Cosmetic: ${car.cosmeticCondition}/100
      | Unresolved: ${unresolved.length}
      | ${car.inspected ? "Inspected" : "Not inspected"}
    `;

    const btn = document.createElement("button");
    btn.textContent = state.selectedInventoryId === car.id ? "Selected" : "Manage";
    btn.disabled = state.selectedInventoryId === car.id;
    btn.addEventListener("click", () => {
      trackAction("ui_click", { control: "manage-car-btn", carId: car.id, name: car.name }, true);
      selectInventoryCar(car.id);
    });
    card.appendChild(document.createElement("br"));
    card.appendChild(btn);
    el.inventoryList.appendChild(card);
  });
}

function renderGarage() {
  renderTopbar();
  renderInventoryList();

  const buyer = getCurrentBuyer();
  const car = getSelectedInventoryCar();
  if (!car) {
    el.garageContent.innerHTML = `<div class="card">No car selected. Current buyer: ${buyer ? buyer.name : "N/A"}.</div>`;
    el.repairActions.innerHTML = "";
    el.inspectBtn.disabled = true;
    el.sellQuickBtn.disabled = true;
    el.sellFairBtn.disabled = true;
    el.sellPremiumBtn.disabled = true;
    el.sellJunkyardBtn.disabled = true;
    return;
  }

  const knownFaults = discoveredFaults(car);
  const unresolvedKnown = knownFaults.filter((f) => !car.repairedFaults.has(f));
  const notebook = notebookEstimateRange(car);

  el.garageContent.innerHTML = `
    <div class="card">
      <strong>${car.name}</strong><br>
      Bought for: ${fmt(car.boughtFor)} (day ${car.purchaseDay})<br>
      Cosmetic: ${car.cosmeticCondition}/100<br>
      Known faults: ${knownFaults.length ? knownFaults.map((f) => FAULTS[f].label).join(", ") : "none"}<br>
      Hidden faults: ${car.inspected ? "revealed" : "unknown"}<br>
      Notebook estimate: ${notebook ? `${fmt(notebook.low)} - ${fmt(notebook.high)}` : "insufficient history"}<br>
      Notebook basis: ${notebook ? `${notebook.matchedSamples} strong matches / ${notebook.sampleCount} total sales` : "sell more cars to train notebook"}<br>
      Invested so far: ${fmt(car.totalInvested)}<br>
      Work log: ${car.actionHistory.length ? car.actionHistory.map((w) => {
        return formatWorkLogEntry(w);
      }).join(" | ") : "none"}<br>
      Today buyer: ${buyer ? buyer.name : "N/A"} (${buyer ? buyer.profile : "-"})
    </div>
  `;

  el.repairActions.innerHTML = "";
  knownFaults.forEach((faultId) => {
    const fault = FAULTS[faultId];
    const learned = estimateRepairValueGain(faultId);
    const projected = projectedDealProfitAfterRepair(car, faultId);
    const wrapped = document.createElement("div");
    wrapped.className = "card";
    wrapped.innerHTML = `${fault.label} | Repair cost: ${fmt(Math.round(fault.repairCost * state.dailyEvent.inspectModifier))} | Value gain if fixed: ~${fmt(learned.gain)} (${learned.confidence}, ${learned.samples} sample${learned.samples === 1 ? "" : "s"})<br>
    Projected fair-mode deal P/L after this repair: ${projected.projectedProfit >= 0 ? "+" : ""}${fmt(projected.projectedProfit)}`;

    const btn = document.createElement("button");
    if (car.repairedFaults.has(faultId)) {
      btn.disabled = true;
      btn.textContent = "Already Repaired";
    } else if (state.dailyEvent.name === "Mechanic Strike" && MECHANICAL_FAULTS.has(faultId)) {
      btn.disabled = true;
      btn.textContent = "Blocked By Mechanic Strike";
    } else {
      btn.textContent = `Repair ${fault.label}`;
      btn.addEventListener("click", () => {
        trackAction("ui_click", { control: "repair-btn", carId: car.id, faultId }, true);
        repairSelectedCarFault(faultId);
      });
    }
    wrapped.appendChild(document.createElement("br"));
    wrapped.appendChild(btn);
    el.repairActions.appendChild(wrapped);
  });

  const cleanRow = document.createElement("div");
  cleanRow.className = "card";
  cleanRow.innerHTML = `Cosmetic cleaning | Cost: ${fmt(CONFIG.cosmeticCleanCost)} | Helps impulse/picky buyers`;
  const cleanBtn = document.createElement("button");
  cleanBtn.textContent = "Cheap Clean";
  cleanBtn.addEventListener("click", () => {
    trackAction("ui_click", { control: "cheap-clean-btn", carId: car.id }, true);
    cleanSelectedCarCosmetic();
  });
  cleanRow.appendChild(document.createElement("br"));
  cleanRow.appendChild(cleanBtn);
  el.repairActions.appendChild(cleanRow);

  el.inspectBtn.disabled = car.inspected;
  const disableSaleButtons = state.buyersRemainingToday <= 0;
  el.sellQuickBtn.disabled = disableSaleButtons;
  el.sellFairBtn.disabled = disableSaleButtons;
  el.sellPremiumBtn.disabled = disableSaleButtons;
  el.sellJunkyardBtn.disabled = false;

  if (unresolvedKnown.length > 0 && !car.inspected) {
    // intentionally no-op: this keeps pressure to inspect before committing sale
  }
}

function renderDealHistory() {
  if (state.completedDeals.length === 0) {
    el.dealHistory.innerHTML = "No completed deals yet.";
    return;
  }

  el.dealHistory.innerHTML = state.completedDeals
    .slice(0, 24)
    .map((deal) => {
      const roi = deal.invested > 0 ? (deal.dealProfit / deal.invested) * 100 : 0;
      return `
        <div class="card">
          <strong>${deal.name}</strong>
          | Buy d${deal.purchaseDay}: ${fmt(deal.boughtFor)}
          | Sell d${deal.sellDay}: ${fmt(deal.salePrice)}
          | Invested: ${fmt(deal.invested)}
          | Deal P/L: ${fmt(deal.dealProfit)}
          | ROI: ${roi.toFixed(1)}%
          | Buyer: ${deal.buyerType}
          | Attempts: ${deal.saleAttempts}
          <br>
          Work log: ${deal.workLog ? deal.workLog.map((w) => {
            return formatWorkLogEntry(w);
          }).join(" | ") : "none"}
        </div>
      `;
    })
    .join("");
}

function recordSeriesPoint() {
  state.series.money.push(state.money);
  state.series.spent.push(state.totalSpent);
  state.series.profit.push(state.totalProfit);
  state.series.balanceDelta.push(balanceDelta());

  const maxPoints = 60;
  if (state.series.money.length > maxPoints) {
    state.series.money.shift();
    state.series.spent.shift();
    state.series.profit.shift();
    state.series.balanceDelta.shift();
  }
}

function renderSpark(svgEl, data, color) {
  const width = 700;
  const height = 130;
  svgEl.innerHTML = "";
  if (data.length < 2) {
    return;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1, max - min);

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 12) - 6;
    return { x, y, v };
  });

  const pointsString = points.map((p) => `${p.x},${p.y}`).join(" ");
  const dotRadius = data.length > 30 ? 1.8 : 2.8;
  const axisColor = "#ccc";

  const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axis.setAttribute("x1", "0");
  axis.setAttribute("y1", String(height - 6));
  axis.setAttribute("x2", String(width));
  axis.setAttribute("y2", String(height - 6));
  axis.setAttribute("stroke", axisColor);
  axis.setAttribute("stroke-width", "1");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", pointsString);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", color);
  polyline.setAttribute("stroke-width", "2");

  svgEl.appendChild(axis);
  svgEl.appendChild(polyline);

  points.forEach((p) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(p.x));
    circle.setAttribute("cy", String(p.y));
    circle.setAttribute("r", String(dotRadius));
    circle.setAttribute("fill", color);
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${Math.round(p.v).toLocaleString()}`;
    circle.appendChild(title);
    svgEl.appendChild(circle);
  });
}

function renderGraphs() {
  renderSpark(el.moneyGraph, state.series.money, "#3b82f6");
  renderSpark(el.spentGraph, state.series.spent, "#ef4444");
  renderSpark(el.profitGraph, state.series.profit, "#16a34a");
}

function buildExportData() {
  return {
    meta: {
      exportedAt: new Date().toISOString(),
      runStartedAt: state.runStartedAt,
      day: state.day,
      runOver: state.runOver
    },
    summary: {
      startingMoney: CONFIG.startingMoney,
      money: state.money,
      revenue: state.totalRevenue,
      spent: state.totalSpent,
      balanceDelta: balanceDelta(),
      inventoryCount: state.inventory.length,
      persistenceMode: state.persistenceMode
    },
    series: state.series,
    completedDeals: state.completedDeals,
    saleHistory: state.saleHistory,
    inventorySnapshot: state.inventory.map((car) => ({
      id: car.id,
      name: car.name,
      purchaseDay: car.purchaseDay,
      boughtFor: car.boughtFor,
      totalInvested: car.totalInvested,
      saleAttempts: car.saleAttempts,
      inspected: car.inspected,
      visibleFaults: car.visibleFaults,
      hiddenFaults: car.hiddenFaults,
      repairedFaults: [...car.repairedFaults]
    })),
    logs: state.logLines,
    actions: state.actions
  };
}

function endDay() {
  if (state.runOver) {
    return;
  }

  if (state.day >= CONFIG.maxDays) {
    finishRun();
    return;
  }

  state.day += 1;
  state.selectedCar = null;
  for (let i = 0; i < state.buyersRemainingToday; i += 1) {
    advanceBuyerQueue();
  }
  generateDayCars();
  trackAction("end_day", { nextDay: state.day, event: state.dailyEvent.name, buyer: getCurrentBuyer().name }, true);
  recordSeriesPoint();
  renderGraphs();
  renderMarket();
  showPanel(el.marketPanel);
  log(`New day. ${state.dayCars.length} junkers listed. Buyer now: ${getCurrentBuyer().name}. Event: ${state.dailyEvent.name}.`);
}

function finishRun() {
  state.runOver = true;
  showPanel(el.marketPanel);
  el.marketCars.innerHTML = `
    <div class="card">
      <strong>Run Over</strong><br>
      Days played: ${CONFIG.maxDays}<br>
      Final money: ${fmt(state.money)}<br>
      Total spent: ${fmt(state.totalSpent)}<br>
      Total revenue: ${fmt(state.totalRevenue)}<br>
      Balance delta: ${fmt(balanceDelta())}<br>
      Unsold inventory: ${state.inventory.length}
    </div>
    <button id="restart-btn">Restart Run</button>
  `;

  const restart = document.getElementById("restart-btn");
  restart.addEventListener("click", () => window.location.reload());
  renderTopbar();
  log(`Run finished. Revenue: ${fmt(state.totalRevenue)}. Balance delta: ${fmt(balanceDelta())}.`);
  renderDealHistory();
  schedulePersistence();
}

// ==== Events ====
el.nextDayBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "next-day-btn" }, true);
  endDay();
});
el.toGarageFromMarketBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "to-garage-from-market-btn" }, true);
  renderGarage();
  showPanel(el.garagePanel);
});
el.toMarketFromGarageBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "to-market-from-garage-btn" }, true);
  renderMarket();
  showPanel(el.marketPanel);
});
el.offerLowball.addEventListener("click", () => {
  trackAction("ui_click", { control: "offer-lowball" }, true);
  attemptOffer("lowball");
});
el.offerFair.addEventListener("click", () => {
  trackAction("ui_click", { control: "offer-fair" }, true);
  attemptOffer("fair");
});
el.offerAsking.addEventListener("click", () => {
  trackAction("ui_click", { control: "offer-asking" }, true);
  attemptOffer("asking");
});
el.walkAway.addEventListener("click", () => {
  trackAction("ui_click", { control: "walk-away" }, true);
  if (state.selectedCar) {
    log(`Walked away from ${state.selectedCar.name}.`);
  }
  state.selectedCar = null;
  showPanel(el.marketPanel);
});
el.inspectBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "inspect-btn" }, true);
  inspectSelectedCar();
});
el.sellQuickBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "sell-quick-btn" }, true);
  attemptSale("quick");
});
el.sellFairBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "sell-fair-btn" }, true);
  attemptSale("fair");
});
el.sellPremiumBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "sell-premium-btn" }, true);
  attemptSale("premium");
});
el.sellJunkyardBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "sell-junkyard-btn" }, true);
  sellSelectedToJunkyard();
});
el.continueBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "continue-btn" }, true);
  renderGarage();
  showPanel(el.garagePanel);
});

// ==== Init ====
function init() {
  ensureBuyerQueue();
  generateDayCars();
  recordSeriesPoint();
  renderGraphs();
  renderDealHistory();
  renderMarket();
  log(`Run started with ${fmt(state.money)}. Buyer now: ${getCurrentBuyer().name}. Event: ${state.dailyEvent.name}.`);
  trackAction("run_start", { money: state.money, buyer: getCurrentBuyer().name, event: state.dailyEvent.name });
  schedulePersistence();
}

init();
