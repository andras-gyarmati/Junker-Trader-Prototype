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

function getSellMultiplierFromSlider() {
  return Number(el.sellSlider.value) / 100;
}

function updateSellSliderLabel() {
  const car = getSelectedInventoryCar();
  const buyer = getCurrentBuyer();
  if (!car || !buyer) {
    el.sellSliderLabel.textContent = "No car selected.";
    el.sellCustomBtn.textContent = "Offer Custom Price";
    return;
  }
  const trueValue = calcTrueValue(car) * state.dailyEvent.saleModifier * state.cityModifier.buyerRichness;
  const multiplier = getSellMultiplierFromSlider();
  const listPrice = Math.round(trueValue * multiplier);
  el.sellSliderLabel.textContent = `List: ${fmt(listPrice)} (${Math.round(multiplier * 100)}% of internal value ${fmt(trueValue)})`;
  el.sellCustomBtn.textContent = `Offer Custom (${fmt(listPrice)}, fee ${fmt(CONFIG.sellAttemptFee)})`;
}

function updateSellModeButtons() {
  const car = getSelectedInventoryCar();
  if (!car) {
    el.sellQuickBtn.textContent = "Sell Quick";
    el.sellFairBtn.textContent = "Sell Fair";
    el.sellPremiumBtn.textContent = "Sell Premium";
    el.sellJunkyardBtn.textContent = "Sell To Junkyard";
    return;
  }

  const base = calcTrueValue(car) * state.dailyEvent.saleModifier * state.cityModifier.buyerRichness;
  const quickPrice = Math.round(base * CONFIG.selling.quickMultiplier);
  const fairPrice = Math.round(base * CONFIG.selling.fairMultiplier);
  const premiumPrice = Math.round(base * CONFIG.selling.premiumMultiplier);

  el.sellQuickBtn.textContent = `Sell Quick (${fmt(quickPrice)}, fee ${fmt(CONFIG.sellAttemptFee)})`;
  el.sellFairBtn.textContent = `Sell Fair (${fmt(fairPrice)}, fee ${fmt(CONFIG.sellAttemptFee)})`;
  el.sellPremiumBtn.textContent = `Sell Premium (${fmt(premiumPrice)}, fee ${fmt(CONFIG.sellAttemptFee)})`;
  el.sellJunkyardBtn.textContent = `Sell To Junkyard (+${fmt(calcJunkyardPrice(car))}, no fee)`;
}

function estimateExpectedSalePrice(car, buyer, priceMode = "fair", customMultiplier = null) {
  if (!buyer) {
    return 0;
  }
  const multiplier = customMultiplier ?? salePriceMultiplierForMode(priceMode);
  const trueValue = calcTrueValue(car) * state.dailyEvent.saleModifier * state.cityModifier.buyerRichness;
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

  const repairCost = Math.round(FAULTS[faultId].repairCost * state.dailyEvent.inspectModifier * state.cityModifier.repairMult);
  const expectedSale = estimateExpectedSalePrice(simulated, buyer, "fair");
  const projectedProfit = expectedSale - (car.totalInvested + repairCost + CONFIG.sellAttemptFee);
  return {
    expectedSale,
    projectedProfit,
    repairCost
  };
}

function getPaidRepairCost(car, faultId) {
  const entries = car.actionHistory.filter((w) => w.kind === "repair" && w.faultId === faultId);
  if (!entries.length) {
    return null;
  }
  return entries[entries.length - 1].amount;
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

function getCounterofferAmount() {
  if (!state.pendingSale) {
    return 0;
  }
  const ratio = Number(el.counterofferSlider.value) / 100;
  return Math.round(state.pendingSale.finalPrice * ratio);
}

function updateCounterofferLabel() {
  if (!state.pendingSale) {
    el.counterofferSliderLabel.textContent = "No buyer offer to counter.";
    return;
  }
  const amount = getCounterofferAmount();
  const pct = Number(el.counterofferSlider.value);
  el.counterofferSliderLabel.textContent = `Counter: ${fmt(amount)} (${pct}% of buyer offer ${fmt(state.pendingSale.finalPrice)})`;
}

function attemptSale(priceMode, customMultiplier = null) {
  const car = getSelectedInventoryCar();
  const buyer = getCurrentBuyer();
  if (!car || !buyer) {
    return;
  }

  if (state.buyersRemainingToday <= 0) {
    log("No buyers left today. End day for the next market batch.");
    return;
  }
  if (state.money < CONFIG.sellAttemptFee) {
    log(`Cannot list for sale: need ${fmt(CONFIG.sellAttemptFee)} listing fee.`);
    return;
  }

  const multiplier = customMultiplier ?? salePriceMultiplierForMode(priceMode);

  const trueValue = calcTrueValue(car) * state.dailyEvent.saleModifier * state.cityModifier.buyerRichness;
  let listPrice = Math.round(trueValue * multiplier);

  const unresolved = unresolvedFaults(car);
  if (car.brokenDown) {
    log(`${car.name} is broken down. Repair first or junk/swap cars.`);
    return;
  }
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

  if (finalPrice <= 0) {
    car.actionHistory.push({ kind: "sell_fail", day: state.day, mode: priceMode });
    state.totalProfit = state.totalRevenue;
    log(`${buyer.name} ${outcome}: ${car.name} not sold. Car stays in inventory.`);
    trackAction("sell_fail", { carId: car.id, name: car.name, buyer: buyer.name, mode: priceMode, listPrice }, true);
    state.pendingSale = null;
  } else {
    state.pendingSale = {
      carId: car.id,
      buyer,
      priceMode,
      multiplier,
      listPrice,
      finalPrice,
      trueValue,
      unresolved,
      outcome
    };
    trackAction("sell_offer_received", {
      carId: car.id,
      name: car.name,
      buyer: buyer.name,
      mode: priceMode,
      listPrice,
      finalPrice,
      outcome
    }, true);
    log(`${buyer.name} offered ${fmt(finalPrice)} for ${car.name}. Decide to accept or reject.`);
  }

  state.buyersRemainingToday = Math.max(0, state.buyersRemainingToday - 1);
  advanceBuyerQueue();
  log(`${state.buyersRemainingToday} buyer(s) left today.`);
  recordSeriesPoint();
  renderGraphs();
  renderDealHistory();

  const pendingText = state.pendingSale
    ? `<br><strong>Buyer offer:</strong> ${fmt(finalPrice)} (not final until you accept)`
    : "";

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
      ${finalPrice > 0 ? `Proposed final sale price: ${fmt(finalPrice)}` : "No sale"}
      ${pendingText}
    </div>
  `;

  el.acceptSaleBtn.style.display = state.pendingSale ? "inline-block" : "none";
  el.rejectSaleBtn.style.display = state.pendingSale ? "inline-block" : "none";
  el.counterofferPanel.style.display = state.pendingSale ? "block" : "none";
  if (state.pendingSale) {
    el.counterofferSlider.value = "105";
    updateCounterofferLabel();
  }
  el.continueBtn.disabled = Boolean(state.pendingSale);
  renderTopbar();
  showPanel(el.salePanel);
}

function attemptCounterOffer() {
  const pending = state.pendingSale;
  if (!pending) {
    return;
  }
  const car = state.inventory.find((c) => c.id === pending.carId);
  if (!car) {
    state.pendingSale = null;
    el.counterofferPanel.style.display = "none";
    return;
  }

  const buyer = pending.buyer;
  const counter = getCounterofferAmount();
  const increase = Math.max(0, counter - pending.finalPrice);
  const increaseRatio = increase / Math.max(1, pending.finalPrice);

  if (counter <= pending.finalPrice) {
    pending.finalPrice = counter;
    updateCounterofferLabel();
    log(`Counteroffer lowered to ${fmt(counter)} for ${car.name}.`);
    trackAction("counteroffer_lowered", { carId: car.id, name: car.name, buyer: buyer.name, counter }, true);
    return;
  }

  const acceptChance = clamp(
    0.62 +
      (buyer.tolerance - 1) * 0.55 +
      buyer.haggleChance * 0.16 -
      increaseRatio * 1.55,
    0.03,
    0.95
  );

  if (Math.random() < acceptChance) {
    pending.finalPrice = counter;
    log(`${buyer.name} accepted your counteroffer: ${fmt(counter)} for ${car.name}.`);
    trackAction("counteroffer_accept", { carId: car.id, name: car.name, buyer: buyer.name, counter, acceptChance }, true);
    updateCounterofferLabel();
    return;
  }

  const walkChance = clamp(0.12 + increaseRatio * 1.2 - buyer.haggleChance * 0.22, 0.04, 0.9);
  if (Math.random() < walkChance) {
    state.pendingSale = null;
    el.counterofferPanel.style.display = "none";
    el.acceptSaleBtn.style.display = "none";
    el.rejectSaleBtn.style.display = "none";
    el.continueBtn.disabled = false;
    log(`${buyer.name} walked away from ${car.name} after your counteroffer.`);
    trackAction("counteroffer_walkaway", { carId: car.id, name: car.name, buyer: buyer.name, counter, walkChance }, true);
    renderGarage();
    showPanel(el.garagePanel);
    return;
  }

  log(`${buyer.name} rejected counteroffer ${fmt(counter)}. Original offer ${fmt(pending.finalPrice)} still stands.`);
  trackAction("counteroffer_reject", { carId: car.id, name: car.name, buyer: buyer.name, counter, acceptChance }, true);
}

function resolvePendingSale(accept) {
  const pending = state.pendingSale;
  if (!pending) {
    return;
  }
  const car = state.inventory.find((c) => c.id === pending.carId);
  if (!car) {
    state.pendingSale = null;
    renderGarage();
    showPanel(el.garagePanel);
    return;
  }

  if (!accept) {
    trackAction("sell_offer_rejected", {
      carId: car.id,
      name: car.name,
      buyer: pending.buyer.name,
      finalPrice: pending.finalPrice,
      mode: pending.priceMode
    }, true);
    log(`Rejected ${pending.buyer.name} offer ${fmt(pending.finalPrice)} for ${car.name}.`);
    state.pendingSale = null;
    el.counterofferPanel.style.display = "none";
    el.acceptSaleBtn.style.display = "none";
    el.rejectSaleBtn.style.display = "none";
    el.continueBtn.disabled = false;
    renderTopbar();
    renderGarage();
    showPanel(el.garagePanel);
    return;
  }

  car.actionHistory.push({ kind: "sell_success", day: state.day, amount: pending.finalPrice, mode: pending.priceMode });
  state.money += pending.finalPrice;
  state.totalRevenue += pending.finalPrice;
  state.totalProfit = state.totalRevenue;
  state.saleHistory.push({ ...carComparableData(car), finalPrice: pending.finalPrice });
  const dealProfit = pending.finalPrice - car.totalInvested;
  state.completedDeals.unshift({
    id: car.id,
    name: car.name,
    purchaseDay: car.purchaseDay,
    sellDay: state.day,
    boughtFor: car.boughtFor,
    invested: car.totalInvested,
    salePrice: pending.finalPrice,
    dealProfit,
    saleAttempts: car.saleAttempts,
    buyerType: pending.buyer.name,
    mode: pending.priceMode,
    faultsFixed: [...car.repairedFaults],
    allFaultsAtSale: allFaults(car),
    unresolvedAtSale: pending.unresolved,
    referenceValueAtSale: car.baseMarketValue + (car.cosmeticCondition - 50) * 35,
    workLog: [...car.actionHistory]
  });
  state.inventory = state.inventory.filter((c) => c.id !== car.id);
  if (state.selectedInventoryId === car.id) {
    state.selectedInventoryId = state.inventory[0]?.id || null;
  }
  if (state.currentCarId === car.id) {
    state.currentCarId = null;
  }
  trackAction("sell_success", {
    carId: car.id,
    name: car.name,
    buyer: pending.buyer.name,
    mode: pending.priceMode,
    listPrice: pending.listPrice,
    finalPrice: pending.finalPrice,
    invested: car.totalInvested,
    dealProfit
  }, true);
  log(`${pending.buyer.name} deal accepted: ${car.name} sold for ${fmt(pending.finalPrice)}.`);
  state.pendingSale = null;
  el.counterofferPanel.style.display = "none";
  el.acceptSaleBtn.style.display = "none";
  el.rejectSaleBtn.style.display = "none";
  el.continueBtn.disabled = false;
  recordSeriesPoint();
  renderGraphs();
  renderDealHistory();
  renderTopbar();
  renderGarage();
  showPanel(el.garagePanel);
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
  if (state.currentCarId === car.id) {
    state.currentCarId = null;
  }
  log(`Sold ${car.name} to junkyard for ${fmt(payout)} (${dealProfit >= 0 ? "+" : ""}${fmt(dealProfit)}).`);
  trackAction("junkyard_sale", { carId: car.id, name: car.name, payout, invested: car.totalInvested, dealProfit }, true);

  recordSeriesPoint();
  renderGraphs();
  renderDealHistory();
  renderGarage();
}
