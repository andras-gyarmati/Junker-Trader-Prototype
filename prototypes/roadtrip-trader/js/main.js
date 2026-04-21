function endDay() {
  if (state.runOver) {
    return;
  }
  if (!canContinueRun()) {
    collapseRun("No usable car and no affordable path before starting a new day.");
    return;
  }

  state.day += 1;
  state.selectedCar = null;
  for (let i = 0; i < state.buyersRemainingToday; i += 1) {
    advanceBuyerQueue();
  }
  generateDayCars();
  trackAction("end_day", {
    nextDay: state.day,
    city: state.currentCity ? state.currentCity.name : "N/A",
    event: state.dailyEvent.name,
    buyer: getCurrentBuyer().name
  }, true);
  recordSeriesPoint();
  renderGraphs();
  renderMarket();
  showPanel(el.marketPanel);
  log(`Spent a day in ${state.currentCity.name}. ${state.dayCars.length} junkers listed. Buyer now: ${getCurrentBuyer().name}. Event: ${state.dailyEvent.name}.`);
  if (!canContinueRun()) {
    collapseRun("No usable car and no affordable path after day rollover.");
  }
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
el.toTravelBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "to-travel-btn" }, true);
  renderTravelPanel();
  showPanel(el.travelPanel);
});
el.toTravelFromGarageBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "to-travel-from-garage-btn" }, true);
  renderTravelPanel();
  showPanel(el.travelPanel);
});
el.travelBackMarketBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "travel-back-market-btn" }, true);
  renderMarket();
  showPanel(el.marketPanel);
});
el.travelChoices.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const action = target.dataset.action;
  const actionCarId = target.dataset.carId;
  if (action === "set-road-car" && actionCarId) {
    trackAction("ui_click", { control: "travel-set-road-car", carId: actionCarId }, true);
    setCurrentCar(actionCarId);
    const car = state.inventory.find((c) => c.id === actionCarId);
    if (car) {
      log(`${car.name} selected as travel car.`);
    }
    renderTravelPanel();
    return;
  }
  if (action === "travel-dispose-junkyard" && actionCarId) {
    trackAction("ui_click", { control: "travel-dispose-junkyard", carId: actionCarId }, true);
    disposeNonTravelCar(actionCarId, "junkyard");
    renderTravelPanel();
    return;
  }
  if (action === "travel-dispose-abandon" && actionCarId) {
    trackAction("ui_click", { control: "travel-dispose-abandon", carId: actionCarId }, true);
    disposeNonTravelCar(actionCarId, "abandon");
    renderTravelPanel();
    return;
  }
  const choiceIndex = target.dataset.choiceIndex;
  if (choiceIndex != null) {
    trackAction("ui_click", { control: "travel-choice", choiceIndex: Number(choiceIndex) }, true);
    resolveTravelToChoice(Number(choiceIndex));
    return;
  }
  if (action === "abandon-run") {
    trackAction("ui_click", { control: "abandon-run" }, true);
    abandonRun();
  }
});
el.eventActions.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const optionId = target.dataset.eventOption;
  if (!optionId) {
    return;
  }
  trackAction("ui_click", { control: "road-event-option", optionId }, true);
  resolveRoadEventOption(optionId);
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
el.offerSlider.addEventListener("input", () => {
  trackAction("ui_input", { control: "offer-slider", value: Number(el.offerSlider.value) }, true);
  updateOfferSliderLabel();
});
el.offerCustom.addEventListener("click", () => {
  const offer = getOfferFromSlider();
  trackAction("ui_click", { control: "offer-custom", offer }, true);
  attemptOffer("custom", offer);
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
el.setCurrentCarBtn.addEventListener("click", () => {
  const car = getSelectedInventoryCar();
  if (!car) {
    return;
  }
  setCurrentCar(car.id);
  log(`${car.name} set as current road car.`);
  renderGarage();
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
el.sellSlider.addEventListener("input", () => {
  trackAction("ui_input", { control: "sell-slider", value: Number(el.sellSlider.value) }, true);
  updateSellSliderLabel();
});
el.sellCustomBtn.addEventListener("click", () => {
  const mult = getSellMultiplierFromSlider();
  trackAction("ui_click", { control: "sell-custom-btn", multiplier: mult }, true);
  attemptSale("custom", mult);
});
el.sellJunkyardBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "sell-junkyard-btn" }, true);
  sellSelectedToJunkyard();
});
el.counterofferSlider.addEventListener("input", () => {
  trackAction("ui_input", { control: "counteroffer-slider", value: Number(el.counterofferSlider.value) }, true);
  updateCounterofferLabel();
});
el.counterofferBtn.addEventListener("click", () => {
  const counter = getCounterofferAmount();
  trackAction("ui_click", { control: "counteroffer-btn", counter }, true);
  attemptCounterOffer();
});
el.acceptSaleBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "accept-sale-btn" }, true);
  resolvePendingSale(true);
});
el.rejectSaleBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "reject-sale-btn" }, true);
  resolvePendingSale(false);
});
el.continueBtn.addEventListener("click", () => {
  trackAction("ui_click", { control: "continue-btn" }, true);
  renderGarage();
  showPanel(el.garagePanel);
});

// ==== Init ====
function init() {
  syncSliderRangesFromConfig();
  el.counterofferPanel.style.display = "none";
  el.acceptSaleBtn.style.display = "none";
  el.rejectSaleBtn.style.display = "none";
  el.continueBtn.disabled = false;

  ensureBuyerQueue();
  startRunInCity();
  generateDayCars();

  recordSeriesPoint();
  renderGraphs();
  renderDealHistory();
  renderMarket();
  showPanel(el.marketPanel);

  log(`Run started in ${state.currentCity.name} with ${fmt(state.money)}. Road-trip target: reach as many cities as possible.`);
  trackAction("run_start", {
    money: state.money,
    city: state.currentCity.name,
    buyer: getCurrentBuyer().name,
    event: state.dailyEvent.name
  });
  schedulePersistence();
}

init();
