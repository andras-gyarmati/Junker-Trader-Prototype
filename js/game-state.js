function showPanel(panel) {
  [el.marketPanel, el.travelPanel, el.eventPanel, el.negotiationPanel, el.garagePanel, el.salePanel].forEach((p) => p.classList.remove("active"));
  panel.classList.add("active");
}

function getCurrentCar() {
  if (!state.currentCarId) {
    return null;
  }
  return state.inventory.find((car) => car.id === state.currentCarId) || null;
}

function setCurrentCar(carId) {
  state.currentCarId = carId;
  trackAction("set_current_car", { carId }, true);
}

function hasUsableRoadCar() {
  const car = getCurrentCar();
  if (!car) {
    return false;
  }
  return !car.brokenDown && car.durability > 0;
}

function canAffordAnyCar() {
  return state.dayCars.some((car) => car.askingPrice <= state.money);
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
  if (w.kind === "travel") return `${dayLabel}:travel:${w.to}:${w.km}km:-${fmt(w.amount)}`;
  if (w.kind === "roadside_repair") return `${dayLabel}:roadRepair:${w.faultId}:-${fmt(w.amount)}`;
  if (w.kind === "emergency_repair") return `${dayLabel}:emergencyRepair:-${fmt(w.amount)}`;
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
