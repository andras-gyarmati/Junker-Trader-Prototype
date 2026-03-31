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
  renderBuyerForecast();
}

function renderBuyerForecast() {
  const buyer = getCurrentBuyer();
  const preview = state.buyerQueue
    .slice(0, CONFIG.buyerPreviewCount)
    .map((b, idx) => `${idx === 0 ? "Now" : `Next ${idx}`}: ${b.name}`)
    .join(" | ");
  const availability = state.buyersRemainingToday > 0
    ? `${state.buyersRemainingToday} buyer(s) left today`
    : "No buyers left today. End day in Market to refresh.";

  el.buyerForecast.innerHTML = `
    <strong>Selling Desk (buyers for selling):</strong> ${preview}<br>
    <strong>Current buyer need:</strong> ${buyer ? buyer.profile : "N/A"}<br>
    <strong>Availability:</strong> ${availability}<br>
    <strong>Today Event:</strong> ${state.dailyEvent.name} - ${state.dailyEvent.desc}
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
    el.sellCustomBtn.disabled = true;
    el.sellJunkyardBtn.disabled = true;
    el.sellSliderLabel.textContent = "No car selected.";
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
      Cleaning status: ${car.cleanedOnce ? "already used" : "available"}<br>
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
    const wrapped = document.createElement("div");
    wrapped.className = "card";
    if (car.repairedFaults.has(faultId)) {
      const paid = getPaidRepairCost(car, faultId);
      wrapped.innerHTML = `${fault.label} | Repaired | Paid: ${paid != null ? fmt(paid) : "n/a"} | Learned value gain: ~${fmt(learned.gain)} (${learned.confidence}, ${learned.samples} sample${learned.samples === 1 ? "" : "s"})`;
    } else {
      const projected = projectedDealProfitAfterRepair(car, faultId);
      wrapped.innerHTML = `${fault.label} | Repair cost: ${fmt(Math.round(fault.repairCost * state.dailyEvent.inspectModifier))} | Value gain if fixed: ~${fmt(learned.gain)} (${learned.confidence}, ${learned.samples} sample${learned.samples === 1 ? "" : "s"})<br>
      Projected fair-mode deal P/L after this repair: ${projected.projectedProfit >= 0 ? "+" : ""}${fmt(projected.projectedProfit)}`;
    }

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
  cleanRow.innerHTML = `Cosmetic cleaning | Cost: ${fmt(CONFIG.cosmeticCleanCost)} | Helps impulse/picky buyers | One-time`;
  const cleanBtn = document.createElement("button");
  cleanBtn.textContent = car.cleanedOnce ? "Already Cleaned" : "Cheap Clean";
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

  el.inspectBtn.disabled = car.inspected;
  const disableSaleButtons = state.buyersRemainingToday <= 0;
  el.sellQuickBtn.disabled = disableSaleButtons;
  el.sellFairBtn.disabled = disableSaleButtons;
  el.sellPremiumBtn.disabled = disableSaleButtons;
  el.sellCustomBtn.disabled = disableSaleButtons;
  el.sellJunkyardBtn.disabled = false;
  updateSellSliderLabel();
  if (disableSaleButtons) {
    el.repairActions.insertAdjacentHTML("afterbegin", "<div class=\"notice\">No buyers left today. End day in Market to continue selling. Junkyard is still available.</div>");
  }

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
