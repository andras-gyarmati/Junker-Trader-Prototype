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
  el.offerSlider.value = String(Math.round(CONFIG.negotiation.fairRatio * 100));
  updateOfferSliderLabel();
  updateNegotiationButtons();
  showPanel(el.negotiationPanel);
}

function getOfferFromSlider() {
  const car = state.selectedCar;
  if (!car) {
    return 0;
  }
  const ratio = Number(el.offerSlider.value) / 100;
  return Math.round(car.askingPrice * ratio);
}

function updateOfferSliderLabel() {
  const car = state.selectedCar;
  if (!car) {
    el.offerSliderLabel.textContent = "No car selected.";
    el.offerCustom.textContent = "Submit Custom Offer";
    return;
  }
  const offer = getOfferFromSlider();
  const pct = Number(el.offerSlider.value);
  el.offerSliderLabel.textContent = `Offer: ${fmt(offer)} (${pct}% of asking ${fmt(car.askingPrice)})`;
  el.offerCustom.textContent = `Submit Custom Offer (${fmt(offer)}, no fee)`;
}

function updateNegotiationButtons() {
  const car = state.selectedCar;
  if (!car) {
    el.offerLowball.textContent = "Lowball";
    el.offerFair.textContent = "Fair Offer";
    el.offerAsking.textContent = "Pay Asking";
    return;
  }
  const lowball = Math.round(car.askingPrice * CONFIG.negotiation.lowballRatio);
  const fair = Math.round(car.askingPrice * CONFIG.negotiation.fairRatio);
  el.offerLowball.textContent = `Lowball (${fmt(lowball)}, no fee)`;
  el.offerFair.textContent = `Fair Offer (${fmt(fair)}, no fee)`;
  el.offerAsking.textContent = `Pay Asking (${fmt(car.askingPrice)}, no fee)`;
}

function attemptOffer(type, customOffer = null) {
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

  let offer = Math.round(car.askingPrice * ratio);
  if (type === "custom" && Number.isFinite(customOffer)) {
    offer = Math.round(customOffer);
  }
  trackAction("offer", {
    carId: car.id,
    name: car.name,
    type,
    offer,
    asking: car.askingPrice,
    reservePrice: car.reservePrice
  }, true);
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

  if (offer >= car.askingPrice || offer >= car.reservePrice) {
    buyCar(car, offer);
    log("Seller accepted immediately because offer met seller expectation.");
    trackAction("offer_accept_auto", { carId: car.id, offer, reservePrice: car.reservePrice }, true);
    return;
  }

  if (Math.random() < acceptChance) {
    buyCar(car, offer);
    trackAction("offer_accept", { carId: car.id, offer, acceptChance }, true);
    return;
  }

  car.lastRejectedOffer = offer;
  car.offended += 1;
  const badRatio = offer / Math.max(1, car.askingPrice);
  const leaveChance = clamp(
    CONFIG.negotiation.offendedLeaveBaseChance +
      (car.sellerPersonality.patience - 1) * 0.28 +
      Math.max(0, 0.84 - badRatio) * 0.75 +
      car.offended * 0.08,
    0.04,
    0.92
  );

  if (badRatio <= 0.84 && Math.random() < leaveChance) {
    state.dayCars = state.dayCars.filter((c) => c.id !== car.id);
    log(`Seller got offended by ${fmt(offer)} and left with ${car.name}.`);
    trackAction("offer_offended_leave", { carId: car.id, offer, leaveChance, offended: car.offended }, true);
    state.selectedCar = null;
    renderMarket();
    showPanel(el.marketPanel);
    return;
  }

  log(`Seller rejected ${fmt(offer)} for ${car.name}.`);
  trackAction("offer_reject", { carId: car.id, offer, acceptChance, offended: car.offended }, true);
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
    cleanedOnce: false,
    sellFees: 0,
    saleAttempts: 0,
    actionHistory: [{ kind: "buy", day: state.day, amount: price }],
    inspected: false,
    repairedFaults: new Set(),
    purchaseDay: state.day,
    brokenDown: false
  };

  state.money -= price;
  state.totalSpent += price;
  state.totalProfit = state.totalRevenue;
  state.inventory.push(ownedCar);
  state.selectedInventoryId = ownedCar.id;
  if (!state.currentCarId) {
    state.currentCarId = ownedCar.id;
  }
  state.dayCars = state.dayCars.filter((c) => c.id !== car.id);

  log(`Bought ${car.name} for ${fmt(price)}. Durability ${ownedCar.durability}/100, reliability ${(ownedCar.reliability * 100).toFixed(0)}%.`);
  trackAction("buy", { carId: car.id, name: car.name, price }, true);
  recordSeriesPoint();
  renderGraphs();
  renderMarket();
  showPanel(el.marketPanel);
}
