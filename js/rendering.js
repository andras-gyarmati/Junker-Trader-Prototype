function renderRunStatusPanel() {
  const cityName = state.currentCity ? state.currentCity.name : "N/A";
  const routePreview = state.routeHistory.length
    ? state.routeHistory.slice(-6).join(" -> ")
    : "none";

  el.runStatusPanel.innerHTML = `
    <strong>Run:</strong> ${state.runStatus}
    | <strong>City:</strong> ${cityName}
    | <strong>Cities Reached:</strong> ${state.citiesReached}/${CONFIG.maxCities}
    | <strong>Route:</strong> ${routePreview}
  `;
}

function renderCurrentCarPanel() {
  const car = getCurrentCar();
  if (!car) {
    el.currentCarPanel.innerHTML = "<strong>Road Car:</strong> none selected";
    return;
  }

  const unresolved = unresolvedFaults(car).length;
  const status = car.brokenDown || car.durability <= 0 ? "BROKEN" : "roadworthy";
  el.currentCarPanel.innerHTML = `
    <strong>Road Car:</strong> ${car.name}
    | <strong>Status:</strong> ${status}
    | <strong>Durability:</strong> ${car.durability}/100
    | <strong>Reliability:</strong> ${(car.reliability * 100).toFixed(0)}%
    | <strong>Fuel Mod:</strong> x${car.fuelCostModifier.toFixed(2)}
    | <strong>Unresolved Faults:</strong> ${unresolved}
  `;
}

function renderTopbar() {
  const buyer = getCurrentBuyer();
  const nextBuyer = state.buyerQueue[1];
  const eventName = state.dailyEvent ? state.dailyEvent.name : "None";

  el.topbar.innerHTML = `
    <strong>Step:</strong> ${state.day}
    | <strong>Cash:</strong> ${fmt(state.money)}
    | <strong>Revenue:</strong> ${fmt(state.totalRevenue)}
    | <strong>Spent:</strong> ${fmt(state.totalSpent)}
    | <strong>Balance Delta:</strong> ${fmt(balanceDelta())}
    | <strong>Inventory:</strong> ${state.inventory.length}
    | <strong>Buyer Now:</strong> ${buyer ? buyer.name : "N/A"}
    ${nextBuyer ? `| <strong>Next:</strong> ${nextBuyer.name}` : ""}
    | <strong>Buyers Left:</strong> ${state.buyersRemainingToday}/${state.dayBuyerDemand}
    | <strong>City Event:</strong> ${eventName}
  `;

  renderRunStatusPanel();
  renderCurrentCarPanel();
  renderBuyerForecast();
}

function renderBuyerForecast() {
  const buyer = getCurrentBuyer();
  const cityName = state.currentCity ? state.currentCity.name : "N/A";
  const preview = state.buyerQueue
    .slice(0, CONFIG.buyerPreviewCount)
    .map((b, idx) => `${idx === 0 ? "Now" : `Next ${idx}`}: ${b.name}`)
    .join(" | ");
  const availability = state.buyersRemainingToday > 0
    ? `${state.buyersRemainingToday} buyer(s) left in ${cityName}`
    : `No buyers left in ${cityName}. Use End Day for new local buyers.`;
  const dailyEventText = state.dailyEvent
    ? `${state.dailyEvent.name} - ${state.dailyEvent.desc}`
    : "No city event.";

  el.buyerForecast.innerHTML = `
    <strong>Selling Desk (${cityName}):</strong> ${preview}<br>
    <strong>Current buyer profile:</strong> ${buyer ? buyer.profile : "N/A"}<br>
    <strong>Availability:</strong> ${availability}<br>
    <strong>City Event:</strong> ${dailyEventText}
  `;
}

function renderMarket() {
  renderTopbar();
  el.marketCars.innerHTML = "";

  if (state.dayCars.length === 0) {
    el.marketCars.innerHTML = "<p>No cars listed in this city right now.</p>";
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
      Durability: ${car.durability}/100 | Reliability: ${(car.reliability * 100).toFixed(0)}% | Fuel mod: x${car.fuelCostModifier.toFixed(2)}<br>
      Cosmetic: ${car.cosmeticCondition}/100 | Seller: ${car.sellerPersonality.name}<br>
      Visible faults: ${visible}<br>
      Asking: ${fmt(car.askingPrice)}<br>
      Notebook estimate: ${estimate ? `${fmt(estimate.low)} - ${fmt(estimate.high)}` : "insufficient history"}<br>
      Notebook basis: ${estimate ? `${estimate.matchedSamples} strong matches / ${estimate.sampleCount} total sales` : "sell more cars to train notebook"}
    `;

    const btn = document.createElement("button");
    btn.textContent = "Negotiate (no fee)";
    btn.addEventListener("click", () => {
      trackAction("ui_click", { control: "negotiate-btn", carId: car.id, name: car.name }, true);
      startNegotiation(car.id);
    });

    card.appendChild(document.createElement("br"));
    card.appendChild(btn);
    el.marketCars.appendChild(card);
  });
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
    const isRoadCar = state.currentCarId === car.id;
    const breakdownLabel = car.brokenDown || car.durability <= 0 ? "BROKEN" : "usable";

    card.innerHTML = `
      <strong>${car.name}</strong>
      ${isRoadCar ? "| ROAD CAR" : ""}
      | Bought: ${fmt(car.boughtFor)}
      | Dur: ${car.durability}/100
      | Rel: ${(car.reliability * 100).toFixed(0)}%
      | Fuel: x${car.fuelCostModifier.toFixed(2)}
      | Unresolved: ${unresolved.length}
      | ${breakdownLabel}
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
    const cityName = state.currentCity ? state.currentCity.name : "N/A";
    el.garageContent.innerHTML = `<div class="card">No car selected. City: ${cityName}. Current buyer: ${buyer ? buyer.name : "N/A"}.</div>`;
    el.repairActions.innerHTML = "";
    el.inspectBtn.disabled = true;
    el.inspectBtn.textContent = "Inspect";
    el.sellQuickBtn.disabled = true;
    el.sellFairBtn.disabled = true;
    el.sellPremiumBtn.disabled = true;
    el.sellCustomBtn.disabled = true;
    el.sellJunkyardBtn.disabled = true;
    el.setCurrentCarBtn.disabled = true;
    el.sellSliderLabel.textContent = "No car selected.";
    updateSellModeButtons();
    return;
  }

  const knownFaults = discoveredFaults(car);
  const unresolvedKnown = knownFaults.filter((f) => !car.repairedFaults.has(f));
  const notebook = notebookEstimateRange(car);

  el.garageContent.innerHTML = `
    <div class="card">
      <strong>${car.name}</strong> ${state.currentCarId === car.id ? "(current road car)" : ""}<br>
      Bought for: ${fmt(car.boughtFor)} (step ${car.purchaseDay})<br>
      Durability: ${car.durability}/100 | Reliability: ${(car.reliability * 100).toFixed(0)}% | Fuel mod: x${car.fuelCostModifier.toFixed(2)}<br>
      Status: ${car.brokenDown || car.durability <= 0 ? "BROKEN" : "roadworthy"}<br>
      Cosmetic: ${car.cosmeticCondition}/100<br>
      Known faults: ${knownFaults.length ? knownFaults.map((f) => FAULTS[f].label).join(", ") : "none"}<br>
      Hidden faults: ${car.inspected ? "revealed" : "unknown"}<br>
      Notebook estimate: ${notebook ? `${fmt(notebook.low)} - ${fmt(notebook.high)}` : "insufficient history"}<br>
      Notebook basis: ${notebook ? `${notebook.matchedSamples} strong matches / ${notebook.sampleCount} total sales` : "sell more cars to train notebook"}<br>
      Invested so far: ${fmt(car.totalInvested)}<br>
      Cleaning status: ${car.cleanedOnce ? "already used" : "available"}<br>
      Work log: ${summarizeWorkLog(car.actionHistory)}<br>
      Today buyer: ${buyer ? buyer.name : "N/A"} (${buyer ? buyer.profile : "-"})
    </div>
  `;

  el.repairActions.innerHTML = "";
  knownFaults.forEach((faultId) => {
    const fault = FAULTS[faultId];
    const learned = estimateRepairValueGain(faultId);
    const wrapped = document.createElement("div");
    wrapped.className = "card";
    if (car.repairedFaults.has(faultId)) {
      const paid = getPaidRepairCost(car, faultId);
      wrapped.innerHTML = `${fault.label} | Repaired | Paid: ${paid != null ? fmt(paid) : "n/a"} | Learned value gain: ~${fmt(learned.gain)} (${learned.confidence}, ${learned.samples} sample${learned.samples === 1 ? "" : "s"})`;
    } else {
      const projected = projectedDealProfitAfterRepair(car, faultId);
      wrapped.innerHTML = `${fault.label} | Repair cost: ${fmt(Math.round(fault.repairCost * state.dailyEvent.inspectModifier * state.cityModifier.repairMult))} | Value gain if fixed: ~${fmt(learned.gain)} (${learned.confidence}, ${learned.samples} sample${learned.samples === 1 ? "" : "s"})<br>
      Projected fair-mode sale P/L after this repair: ${projected.projectedProfit >= 0 ? "+" : ""}${fmt(projected.projectedProfit)}`;
    }

    const btn = document.createElement("button");
    if (car.repairedFaults.has(faultId)) {
      btn.disabled = true;
      btn.textContent = "Already Repaired";
    } else if (state.dailyEvent.name === "Mechanic Strike" && MECHANICAL_FAULTS.has(faultId)) {
      btn.disabled = true;
      btn.textContent = "Blocked By Mechanic Strike";
    } else {
      const repairCost = Math.round(fault.repairCost * state.dailyEvent.inspectModifier * state.cityModifier.repairMult);
      btn.textContent = `Repair ${fault.label} (-${fmt(repairCost)})`;
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
  cleanRow.innerHTML = `Cosmetic cleaning | Cost: ${fmt(CONFIG.cosmeticCleanCost)} | Helps impulse/picky buyers | One-time`;
  const cleanBtn = document.createElement("button");
  cleanBtn.textContent = car.cleanedOnce ? "Already Cleaned" : `Cheap Clean (-${fmt(CONFIG.cosmeticCleanCost)})`;
  cleanBtn.disabled = car.cleanedOnce;
  if (!car.cleanedOnce) {
    cleanBtn.addEventListener("click", () => {
      trackAction("ui_click", { control: "cheap-clean-btn", carId: car.id }, true);
      cleanSelectedCarCosmetic();
    });
  }
  cleanRow.appendChild(document.createElement("br"));
  cleanRow.appendChild(cleanBtn);
  el.repairActions.appendChild(cleanRow);

  const inspectCost = Math.round(CONFIG.inspectCost * state.dailyEvent.inspectModifier * state.cityModifier.repairMult);
  el.inspectBtn.disabled = car.inspected;
  el.inspectBtn.textContent = car.inspected ? "Inspect (already done)" : `Inspect (-${fmt(inspectCost)})`;
  const disableSaleButtons = state.buyersRemainingToday <= 0;
  el.sellQuickBtn.disabled = disableSaleButtons;
  el.sellFairBtn.disabled = disableSaleButtons;
  el.sellPremiumBtn.disabled = disableSaleButtons;
  el.sellCustomBtn.disabled = disableSaleButtons;
  el.sellJunkyardBtn.disabled = false;
  el.setCurrentCarBtn.disabled = state.currentCarId === car.id;
  el.setCurrentCarBtn.textContent = state.currentCarId === car.id ? "Set As Road Car (selected)" : "Set As Road Car (no fee)";
  updateSellSliderLabel();
  updateSellModeButtons();
  if (disableSaleButtons) {
    el.repairActions.insertAdjacentHTML("afterbegin", "<div class=\"notice\">No buyers left in this city. End day in Market to refresh buyers. Junkyard is still available.</div>");
  }

  if (unresolvedKnown.length > 0 && !car.inspected) {
    // intentionally no-op: keeps pressure to inspect before sale
  }
}

function renderTravelPanel() {
  renderTopbar();
  el.travelChoices.innerHTML = "";

  const cityName = state.currentCity ? state.currentCity.name : "N/A";
  if (!state.currentCity) {
    el.travelChoices.innerHTML = "<div class=\"card\">No city loaded yet.</div>";
    return;
  }

  const roadCar = getCurrentCar();
  const nonTravelCars = state.inventory.filter((car) => car.id !== state.currentCarId);
  const header = document.createElement("div");
  header.className = "card";
  header.innerHTML = `
    <strong>Departing city:</strong> ${cityName}<br>
    ${roadCar ? `Road car: ${roadCar.name} | Durability ${roadCar.durability}/100 | Reliability ${(roadCar.reliability * 100).toFixed(0)}%` : "No road car selected yet."}<br>
    <strong>Travel rule:</strong> pick exactly one car to travel with and dispose of all others.
  `;
  el.travelChoices.appendChild(header);

  if (state.inventory.length > 0) {
    state.inventory.forEach((car) => {
      const card = document.createElement("div");
      card.className = "card";
      const isRoad = state.currentCarId === car.id;
      card.innerHTML = `
        <strong>${car.name}</strong> ${isRoad ? "(selected for travel)" : ""}<br>
        Durability ${car.durability}/100 | Reliability ${(car.reliability * 100).toFixed(0)}% | Broken: ${car.brokenDown ? "yes" : "no"}<br>
        Invested: ${fmt(car.totalInvested)} | Junkyard est: ${fmt(calcJunkyardPrice(car))}
      `;

      const pickBtn = document.createElement("button");
      pickBtn.textContent = isRoad ? "Travel Car Selected" : "Use As Travel Car";
      pickBtn.disabled = isRoad;
      pickBtn.dataset.action = "set-road-car";
      pickBtn.dataset.carId = car.id;
      card.appendChild(pickBtn);

      if (!isRoad) {
        const junkBtn = document.createElement("button");
        junkBtn.textContent = `Sell To Junkyard (+${fmt(calcJunkyardPrice(car))}, no fee)`;
        junkBtn.dataset.action = "travel-dispose-junkyard";
        junkBtn.dataset.carId = car.id;
        card.appendChild(junkBtn);

        const abandonBtn = document.createElement("button");
        abandonBtn.textContent = "Abandon Car (no payout)";
        abandonBtn.dataset.action = "travel-dispose-abandon";
        abandonBtn.dataset.carId = car.id;
        card.appendChild(abandonBtn);
      }

      el.travelChoices.appendChild(card);
    });
  }

  if (!roadCar) {
    const warn = document.createElement("div");
    warn.className = "notice";
    warn.textContent = "Choose a travel car before driving.";
    el.travelChoices.appendChild(warn);
  }
  if (nonTravelCars.length > 0) {
    const warn = document.createElement("div");
    warn.className = "notice";
    warn.textContent = `${nonTravelCars.length} extra car(s) must be sold or abandoned before you can drive.`;
    el.travelChoices.appendChild(warn);
  }

  state.cityTravelChoices.forEach((choice, idx) => {
    const card = document.createElement("div");
    card.className = "card";

    const riskText = choice.roadRisk < 0.95 ? "easy roads" : choice.roadRisk > 1.15 ? "rough roads" : "mixed roads";
    const fuelEstimate = roadCar
      ? Math.round(choice.distanceKm * CONFIG.travel.fuelCostPerKm * roadCar.fuelCostModifier * state.currentCity.fuelMult)
      : null;

    card.innerHTML = `
      <strong>${choice.city.name}</strong><br>
      Distance: ${choice.distanceKm} km | Road profile: ${riskText}<br>
      Local modifiers: cars x${choice.city.carPriceMult.toFixed(2)}, repairs x${choice.city.repairMult.toFixed(2)}, buyers x${choice.city.buyerRichness.toFixed(2)}<br>
      ${fuelEstimate != null ? `Estimated fuel: ${fmt(fuelEstimate)}` : "Fuel estimate unavailable (no road car)"}
    `;

    const btn = document.createElement("button");
    const fuelLabel = fuelEstimate != null ? ` (fuel -${fmt(fuelEstimate)})` : "";
    btn.textContent = `Drive To ${choice.city.name}${fuelLabel}`;
    btn.dataset.choiceIndex = String(idx);
    btn.disabled = !roadCar || nonTravelCars.length > 0;
    card.appendChild(document.createElement("br"));
    card.appendChild(btn);
    el.travelChoices.appendChild(card);
  });

  const abandonCard = document.createElement("div");
  abandonCard.className = "card";
  abandonCard.innerHTML = "Run exit option if the situation is hopeless.";
  const abandonBtn = document.createElement("button");
  abandonBtn.textContent = "Abandon Run";
  abandonBtn.dataset.action = "abandon-run";
  abandonCard.appendChild(document.createElement("br"));
  abandonCard.appendChild(abandonBtn);
  el.travelChoices.appendChild(abandonCard);
}

function renderRoadEventPanel() {
  const evt = state.pendingRoadEvent;
  if (!evt) {
    el.eventContent.innerHTML = "<div class=\"card\">No road event.</div>";
    el.eventActions.innerHTML = "";
    return;
  }

  el.eventContent.innerHTML = `
    <div class="card">
      <strong>${evt.title}</strong><br>
      ${evt.text}
    </div>
  `;

  el.eventActions.innerHTML = "";
  evt.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.textContent = opt.label;
    btn.dataset.eventOption = opt.id;
    el.eventActions.appendChild(btn);
  });
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
          Work log: ${summarizeWorkLog(deal.workLog)}
        </div>
      `;
    })
    .join("");
}

function recordSeriesPoint() {
  state.series.money.push(state.money);
  state.series.spent.push(state.totalSpent);
  state.series.profit.push(state.totalRevenue);
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

function renderDualSpark(svgEl, dataA, colorA, dataB, colorB) {
  const width = 700;
  const height = 130;
  svgEl.innerHTML = "";
  if (dataA.length < 2 || dataB.length < 2) {
    return;
  }

  const n = Math.min(dataA.length, dataB.length);
  const a = dataA.slice(dataA.length - n);
  const b = dataB.slice(dataB.length - n);
  const combined = [...a, ...b];
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  const range = Math.max(1, max - min);

  const toPts = (arr) => arr.map((v, i) => {
    const x = (i / (arr.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 12) - 6;
    return { x, y, v };
  });
  const ptsA = toPts(a);
  const ptsB = toPts(b);

  const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axis.setAttribute("x1", "0");
  axis.setAttribute("y1", String(height - 6));
  axis.setAttribute("x2", String(width));
  axis.setAttribute("y2", String(height - 6));
  axis.setAttribute("stroke", "#ccc");
  axis.setAttribute("stroke-width", "1");
  svgEl.appendChild(axis);

  const draw = (pts, color) => {
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", color);
    poly.setAttribute("stroke-width", "2");
    svgEl.appendChild(poly);
    pts.forEach((p) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", "2");
      c.setAttribute("fill", color);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
      t.textContent = `${Math.round(p.v).toLocaleString()}`;
      c.appendChild(t);
      svgEl.appendChild(c);
    });
  };
  draw(ptsA, colorA);
  draw(ptsB, colorB);
}

function renderGraphs() {
  renderSpark(el.moneyGraph, state.series.money, "#3b82f6");
  renderDualSpark(el.economyGraph, state.series.spent, "#ef4444", state.series.profit, "#16a34a");
}
