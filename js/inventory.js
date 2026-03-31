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
  if (car.cleanedOnce) {
    log(`Cosmetic cleaning already used on ${car.name}.`);
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
  car.cleanedOnce = true;
  car.actionHistory.push({ kind: "clean", day: state.day, amount: CONFIG.cosmeticCleanCost });
  car.cosmeticCondition = clamp(car.cosmeticCondition + 10, 0, 100);
  log(`Quick cleaning done on ${car.name} for ${fmt(CONFIG.cosmeticCleanCost)}.`);
  trackAction("clean", { carId: car.id, name: car.name, cost: CONFIG.cosmeticCleanCost }, true);
  recordSeriesPoint();
  renderGraphs();
  renderGarage();
}
