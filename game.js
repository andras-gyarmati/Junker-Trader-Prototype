// ==== Balance Constants (tweak here) ====
const CONFIG = {
  startingMoney: 12000,
  maxDays: 8,
  carsPerDayMin: 3,
  carsPerDayMax: 5,
  inspectCost: 200,
  cosmeticCleanCost: 180,
  cosmeticCleanGain: 320,
  marketNoisePct: 0.12,
  negotiation: {
    lowballRatio: 0.72,
    fairRatio: 0.9,
    askingRatio: 1.0,
    lowballBaseAccept: 0.28,
    fairBaseAccept: 0.62,
    askingBaseAccept: 0.92
  },
  selling: {
    minListMarkup: 0.9,
    maxListMarkup: 1.2,
    autoPriceDropRatio: 0.93,
    unresolvedFaultPenaltyChance: 0.06,
    cosmeticPenaltyMultiplier: 0.08
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
  { name: "Bargain Hunter", tolerance: 0.88, flawSensitivity: 1.1, haggleChance: 0.65 },
  { name: "Picky Buyer", tolerance: 0.96, flawSensitivity: 1.5, haggleChance: 0.5 },
  { name: "Enthusiast", tolerance: 1.05, flawSensitivity: 0.8, haggleChance: 0.3 },
  { name: "Impulse Buyer", tolerance: 1.12, flawSensitivity: 0.6, haggleChance: 0.2 }
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

// ==== Game State ====
const state = {
  day: 1,
  money: CONFIG.startingMoney,
  totalProfit: 0,
  dayCars: [],
  selectedCar: null,
  ownedCar: null,
  inspected: false,
  repairedFaults: new Set(),
  logLines: [],
  runOver: false,
  dailyEvent: null
};

// ==== DOM refs ====
const el = {
  topbar: document.getElementById("topbar"),
  marketPanel: document.getElementById("market-panel"),
  marketCars: document.getElementById("market-cars"),
  negotiationPanel: document.getElementById("negotiation-panel"),
  negotiationContent: document.getElementById("negotiation-content"),
  garagePanel: document.getElementById("garage-panel"),
  garageContent: document.getElementById("garage-content"),
  repairActions: document.getElementById("repair-actions"),
  salePanel: document.getElementById("sale-panel"),
  saleContent: document.getElementById("sale-content"),
  log: document.getElementById("event-log"),
  nextDayBtn: document.getElementById("next-day-btn"),
  offerLowball: document.getElementById("offer-lowball"),
  offerFair: document.getElementById("offer-fair"),
  offerAsking: document.getElementById("offer-asking"),
  walkAway: document.getElementById("walk-away"),
  inspectBtn: document.getElementById("inspect-btn"),
  toSaleBtn: document.getElementById("to-sale-btn"),
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

function log(msg) {
  state.logLines.unshift(`[Day ${state.day}] ${msg}`);
  state.logLines = state.logLines.slice(0, 18);
  el.log.textContent = state.logLines.join("\n");
}

function showPanel(panel) {
  [el.marketPanel, el.negotiationPanel, el.garagePanel, el.salePanel].forEach((p) => p.classList.remove("active"));
  panel.classList.add("active");
}

function effectiveKnownFaults(car) {
  const known = [...car.visibleFaults];
  if (state.inspected) {
    known.push(...car.hiddenFaults);
  }
  return known;
}

function discoveredFaults(car) {
  return [...car.visibleFaults, ...car.hiddenFaults];
}

function unresolvedFaults(car) {
  return discoveredFaults(car).filter((faultId) => !state.repairedFaults.has(faultId));
}

function calcTrueValue(car) {
  let val = car.baseMarketValue;
  discoveredFaults(car).forEach((f) => {
    if (!state.repairedFaults.has(f)) {
      val -= FAULTS[f].valueHit;
    }
  });
  val += (car.cosmeticCondition - 50) * 35;
  return Math.max(600, val);
}

function marketEstimate(car) {
  const hiddenPenalty = car.hiddenFaults.reduce((sum, f) => sum + FAULTS[f].valueHit, 0);
  const uncertainty = 1 + (Math.random() * 2 - 1) * CONFIG.marketNoisePct;
  const estimate = (car.baseMarketValue - hiddenPenalty * (0.4 + car.riskScoreModifier * 0.6)) * uncertainty;
  return Math.max(500, estimate);
}

function generateCar() {
  const age = randInt(6, 23);
  const mileage = randInt(70000, 280000);
  const cosmeticCondition = randInt(20, 95);
  const riskScoreModifier = Math.random();

  let baseMarketValue = 14000 - age * 260 - mileage * 0.025 + randInt(-1200, 1200);
  baseMarketValue = clamp(baseMarketValue, 1300, 11500);

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
  askingPrice = clamp(askingPrice, 500, baseMarketValue * 1.05);

  return {
    id: crypto.randomUUID(),
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
    boughtFor: null
  };
}

function applyDailyEvent() {
  const roll = Math.random();
  state.dailyEvent = null;
  if (roll < 0.25) {
    state.dailyEvent = { name: "Rainy Market", desc: "More rusty junk today.", rustBias: 0.4 };
  } else if (roll < 0.45) {
    state.dailyEvent = { name: "Tax Panic", desc: "Sellers are desperate to unload.", askModifier: 0.9 };
  } else if (roll < 0.6) {
    state.dailyEvent = { name: "Weekend Hype", desc: "Buyers pay a little more.", saleModifier: 1.06 };
  }
}

function generateDayCars() {
  applyDailyEvent();
  const count = randInt(CONFIG.carsPerDayMin, CONFIG.carsPerDayMax);
  state.dayCars = Array.from({ length: count }, () => {
    const car = generateCar();
    if (
      state.dailyEvent?.rustBias &&
      Math.random() < state.dailyEvent.rustBias &&
      !car.visibleFaults.includes("rust") &&
      !car.hiddenFaults.includes("rust")
    ) {
      car.visibleFaults.push("rust");
      car.askingPrice = Math.max(450, car.askingPrice - 300);
    }
    if (state.dailyEvent?.askModifier) {
      car.askingPrice = Math.round(car.askingPrice * state.dailyEvent.askModifier);
    }
    return car;
  });
}

function renderTopbar() {
  el.topbar.innerHTML = `
    <strong>Day:</strong> ${state.day}/${CONFIG.maxDays}
    | <strong>Money:</strong> ${fmt(state.money)}
    | <strong>Total Profit:</strong> ${fmt(state.totalProfit)}
    ${state.dailyEvent ? `| <strong>Event:</strong> ${state.dailyEvent.name} (${state.dailyEvent.desc})` : ""}
  `;
}

function renderMarket() {
  renderTopbar();
  el.marketCars.innerHTML = "";

  if (state.dayCars.length === 0) {
    el.marketCars.innerHTML = "<p>No cars left today.</p>";
    return;
  }

  state.dayCars.forEach((car) => {
    const card = document.createElement("div");
    card.className = "card";
    const visible = car.visibleFaults.length ? car.visibleFaults.map((f) => FAULTS[f].label).join(", ") : "none obvious";
    const estimate = marketEstimate(car);

    card.innerHTML = `
      <strong>${car.name}</strong><br>
      Age: ${car.age} years | Mileage: ${car.mileage.toLocaleString()} km<br>
      Cosmetic: ${car.cosmeticCondition}/100 | Seller: ${car.sellerPersonality.name}<br>
      Visible faults: ${visible}<br>
      Asking: ${fmt(car.askingPrice)} | Rough market estimate: ${fmt(estimate)}
    `;

    const btn = document.createElement("button");
    btn.textContent = "Negotiate";
    btn.disabled = state.ownedCar !== null;
    btn.addEventListener("click", () => startNegotiation(car.id));

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
  const qualityBonus = clamp((calcTrueValue(car) / car.askingPrice - 1) * 0.25, -0.12, 0.12);
  const patienceBonus = (1 - car.sellerPersonality.patience) * 0.2;
  const acceptChance = clamp(baseAccept + qualityBonus + patienceBonus, 0.05, 0.98);

  if (offer > state.money) {
    log(`Offer failed: you only have ${fmt(state.money)}.`);
    return;
  }

  if (Math.random() < acceptChance) {
    buyCar(car, offer);
    return;
  }

  if (type === "asking" && Math.random() < 0.35 && car.askingPrice <= state.money) {
    buyCar(car, car.askingPrice);
    log("Seller ignored your tactic but accepted full asking price.");
    return;
  }

  log(`Seller rejected ${fmt(offer)} for ${car.name}.`);
  showPanel(el.marketPanel);
}

function buyCar(car, price) {
  car.boughtFor = price;
  state.money -= price;
  state.ownedCar = car;
  state.inspected = false;
  state.repairedFaults = new Set();
  state.dayCars = state.dayCars.filter((c) => c.id !== car.id);
  log(`Bought ${car.name} for ${fmt(price)}.`);
  renderGarage();
  showPanel(el.garagePanel);
}

function inspectOwnedCar() {
  if (!state.ownedCar || state.inspected) {
    return;
  }
  if (state.money < CONFIG.inspectCost) {
    log(`Cannot inspect: need ${fmt(CONFIG.inspectCost)}.`);
    return;
  }

  state.money -= CONFIG.inspectCost;
  state.inspected = true;
  log("Inspection complete. Hidden faults revealed.");
  renderGarage();
}

function repairFault(faultId) {
  if (!state.ownedCar) {
    return;
  }
  if (state.repairedFaults.has(faultId)) {
    return;
  }

  const info = FAULTS[faultId];
  if (state.money < info.repairCost) {
    log(`Cannot repair ${info.label}: need ${fmt(info.repairCost)}.`);
    return;
  }

  state.money -= info.repairCost;
  state.repairedFaults.add(faultId);
  log(`Repaired ${info.label} for ${fmt(info.repairCost)}.`);
  renderGarage();
}

function cleanCosmetic() {
  const car = state.ownedCar;
  if (!car) {
    return;
  }
  if (state.money < CONFIG.cosmeticCleanCost) {
    log(`Cannot clean: need ${fmt(CONFIG.cosmeticCleanCost)}.`);
    return;
  }

  state.money -= CONFIG.cosmeticCleanCost;
  car.cosmeticCondition = clamp(car.cosmeticCondition + 10, 0, 100);
  log(`Quick cleaning done for ${fmt(CONFIG.cosmeticCleanCost)}.`);
  renderGarage();
}

function renderGarage() {
  renderTopbar();
  const car = state.ownedCar;
  if (!car) {
    return;
  }

  const knownFaults = effectiveKnownFaults(car);
  const allDiscovered = state.inspected ? discoveredFaults(car) : [...car.visibleFaults];
  const unresolvedKnown = knownFaults.filter((f) => !state.repairedFaults.has(f));

  el.garageContent.innerHTML = `
    <div class="card">
      <strong>${car.name}</strong><br>
      Bought for: ${fmt(car.boughtFor)}<br>
      Cosmetic: ${car.cosmeticCondition}/100<br>
      Known faults: ${knownFaults.length ? knownFaults.map((f) => FAULTS[f].label).join(", ") : "none"}<br>
      Hidden faults: ${state.inspected ? "revealed" : "unknown"}<br>
      Current true value estimate: ${fmt(calcTrueValue(car))}
    </div>
  `;

  el.repairActions.innerHTML = "";
  allDiscovered.forEach((faultId) => {
    const fault = FAULTS[faultId];
    const wrapped = document.createElement("div");
    wrapped.className = "card";
    wrapped.innerHTML = `${fault.label} | Repair cost: ${fmt(fault.repairCost)} | Value gain if fixed: ~${fmt(fault.valueHit)}`;

    const btn = document.createElement("button");
    if (state.repairedFaults.has(faultId)) {
      btn.disabled = true;
      btn.textContent = "Already Repaired";
    } else {
      btn.textContent = `Repair ${fault.label}`;
      btn.addEventListener("click", () => repairFault(faultId));
    }
    wrapped.appendChild(document.createElement("br"));
    wrapped.appendChild(btn);
    el.repairActions.appendChild(wrapped);
  });

  const cleanRow = document.createElement("div");
  cleanRow.className = "card";
  cleanRow.innerHTML = `Cosmetic cleaning | Cost: ${fmt(CONFIG.cosmeticCleanCost)} | Small resale bump`;
  const cleanBtn = document.createElement("button");
  cleanBtn.textContent = "Cheap Clean";
  cleanBtn.addEventListener("click", cleanCosmetic);
  cleanRow.appendChild(document.createElement("br"));
  cleanRow.appendChild(cleanBtn);
  el.repairActions.appendChild(cleanRow);

  el.inspectBtn.disabled = state.inspected;
  el.toSaleBtn.disabled = unresolvedKnown.length > 0 && state.money < 50;
}

function simulateSale() {
  const car = state.ownedCar;
  if (!car) {
    return;
  }

  const buyer = pick(BUYER_TYPES);
  const trueVal = calcTrueValue(car) * (state.dailyEvent?.saleModifier || 1);
  const markup = clamp(1.03 + (Math.random() * 0.14 - 0.04), CONFIG.selling.minListMarkup, CONFIG.selling.maxListMarkup);
  let listPrice = Math.round(trueVal * markup);

  const unresolved = unresolvedFaults(car);
  const unresolvedPenalty = unresolved.reduce((sum, f) => sum + FAULTS[f].salePenalty, 0) * buyer.flawSensitivity;
  const cosmeticPenalty = ((100 - car.cosmeticCondition) * CONFIG.selling.cosmeticPenaltyMultiplier) / 100;
  const valueFit = listPrice / Math.max(1, trueVal);

  let baseSellChance = 0.85 - unresolvedPenalty - cosmeticPenalty - (valueFit - buyer.tolerance) * 0.7;
  baseSellChance = clamp(baseSellChance, 0.05, 0.98);

  let outcome = "failed sale";
  let finalPrice = 0;

  if (Math.random() < baseSellChance) {
    outcome = "sold instantly";
    finalPrice = listPrice;
  } else if (Math.random() < clamp(baseSellChance + 0.25, 0.1, 0.99)) {
    outcome = "sold after price drop";
    listPrice = Math.round(listPrice * CONFIG.selling.autoPriceDropRatio);
    finalPrice = listPrice;
  } else if (Math.random() < buyer.haggleChance) {
    outcome = "buyer forced lower final price";
    finalPrice = Math.round(listPrice * (0.85 + Math.random() * 0.08));
  }

  if (finalPrice > 0) {
    state.money += finalPrice;
    const profit = finalPrice - car.boughtFor;
    state.totalProfit += profit;
    log(`${buyer.name} ${outcome}: ${car.name} sold for ${fmt(finalPrice)} (${profit >= 0 ? "+" : ""}${fmt(profit)}).`);
  } else {
    state.totalProfit -= 150;
    log(`${buyer.name} ${outcome}: no sale. Listing costs and hassle: -${fmt(150)}.`);
  }

  el.saleContent.innerHTML = `
    <div class="card">
      Buyer type: <strong>${buyer.name}</strong><br>
      Listing price: ${fmt(listPrice)}<br>
      Estimated real value: ${fmt(trueVal)}<br>
      Unresolved faults: ${unresolved.length ? unresolved.map((f) => FAULTS[f].label).join(", ") : "none"}<br>
      Outcome: <strong>${outcome}</strong><br>
      ${finalPrice > 0 ? `Final sale price: ${fmt(finalPrice)}` : "Car not sold this round"}
    </div>
  `;

  state.ownedCar = null;
  state.selectedCar = null;
  showPanel(el.salePanel);
  renderTopbar();
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
  generateDayCars();
  renderMarket();
  showPanel(el.marketPanel);
  log(`New day. ${state.dayCars.length} junkers hit the market.`);
}

function finishRun() {
  state.runOver = true;
  showPanel(el.marketPanel);
  el.marketCars.innerHTML = `
    <div class="card">
      <strong>Run Over</strong><br>
      Days played: ${CONFIG.maxDays}<br>
      Final money: ${fmt(state.money)}<br>
      Total trading profit: ${fmt(state.totalProfit)}<br>
      Score: ${Math.round(state.totalProfit + state.money * 0.1)}
    </div>
    <button id="restart-btn">Restart Run</button>
  `;

  const restart = document.getElementById("restart-btn");
  restart.addEventListener("click", () => window.location.reload());
  renderTopbar();
  log(`Run finished. Final profit: ${fmt(state.totalProfit)}.`);
}

// ==== Events ====
el.nextDayBtn.addEventListener("click", endDay);
el.offerLowball.addEventListener("click", () => attemptOffer("lowball"));
el.offerFair.addEventListener("click", () => attemptOffer("fair"));
el.offerAsking.addEventListener("click", () => attemptOffer("asking"));
el.walkAway.addEventListener("click", () => {
  if (state.selectedCar) {
    log(`Walked away from ${state.selectedCar.name}.`);
  }
  state.selectedCar = null;
  showPanel(el.marketPanel);
});
el.inspectBtn.addEventListener("click", inspectOwnedCar);
el.toSaleBtn.addEventListener("click", simulateSale);
el.continueBtn.addEventListener("click", endDay);

// ==== Init ====
function init() {
  generateDayCars();
  renderMarket();
  log(`Run started with ${fmt(state.money)}. ${state.dayCars.length} cars available.`);
}

init();
