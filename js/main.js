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
