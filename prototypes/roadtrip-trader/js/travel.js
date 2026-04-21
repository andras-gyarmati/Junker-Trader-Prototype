function startRunInCity() {
  state.currentCity = pick(CITY_POOL);
  state.cityModifier = state.currentCity;
  state.citiesReached = 1;
  state.day = 1;
  state.routeHistory = [state.currentCity.name];
  state.cityTravelChoices = [];
  state.pendingRoadEvent = null;
  state.travelPendingDestination = null;
  state.runStatus = "active";
  generateCityTravelChoices();
}

function generateCityTravelChoices() {
  const count = randInt(CONFIG.travel.minChoices, CONFIG.travel.maxChoices);
  const candidates = CITY_POOL.filter((c) => c.name !== state.currentCity.name);
  state.cityTravelChoices = [];

  while (state.cityTravelChoices.length < count && candidates.length > 0) {
    const city = pick(candidates);
    const distanceKm = randInt(CONFIG.travel.minDistanceKm, CONFIG.travel.maxDistanceKm);
    const roadRisk = clamp(0.82 + Math.random() * 0.45, 0.75, 1.4);
    state.cityTravelChoices.push({ city, distanceKm, roadRisk });
    const idx = candidates.findIndex((x) => x.name === city.name);
    if (idx >= 0) {
      candidates.splice(idx, 1);
    }
  }
}

function addFaultIfMissing(car, faultId, visible = true) {
  if (car.visibleFaults.includes(faultId) || car.hiddenFaults.includes(faultId)) {
    return false;
  }
  if (visible || car.inspected) {
    car.visibleFaults.push(faultId);
  } else {
    car.hiddenFaults.push(faultId);
  }
  return true;
}

function unresolvedTravelRisk(car) {
  const unresolved = unresolvedFaults(car);
  let wearMult = 1;
  let breakRisk = 0;

  unresolved.forEach((f) => {
    if (f === "engine") {
      wearMult += 0.22;
      breakRisk += 0.18;
    } else if (f === "transmission") {
      wearMult += 0.2;
      breakRisk += 0.16;
    } else if (f === "tires") {
      wearMult += 0.16;
      breakRisk += 0.12;
    } else if (f === "electrical") {
      wearMult += 0.08;
      breakRisk += 0.09;
    } else if (f === "rust") {
      wearMult += 0.1;
      breakRisk += 0.07;
    } else if (f === "interior") {
      wearMult += 0.02;
      breakRisk += 0.01;
    }
  });

  return { unresolved, wearMult, breakRisk };
}

function emergencyRepairCost(car) {
  const risk = unresolvedTravelRisk(car);
  const base = 450 + (100 - car.durability) * 8 + risk.unresolved.length * 170;
  return Math.round(base * state.cityModifier.repairMult * 1.15);
}

function removeCarFromInventory(carId) {
  state.inventory = state.inventory.filter((c) => c.id !== carId);
  if (state.selectedInventoryId === carId) {
    state.selectedInventoryId = state.inventory[0]?.id || null;
  }
  if (state.currentCarId === carId) {
    state.currentCarId = null;
  }
}

function getNonTravelCars() {
  return state.inventory.filter((car) => car.id !== state.currentCarId);
}

function disposeNonTravelCar(carId, method) {
  const car = state.inventory.find((c) => c.id === carId);
  if (!car || car.id === state.currentCarId) {
    return false;
  }

  if (method === "junkyard") {
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
      buyerType: "Travel Junkyard",
      mode: "travel_junkyard",
      faultsFixed: [...car.repairedFaults],
      allFaultsAtSale: allFaults(car),
      unresolvedAtSale: unresolvedFaults(car),
      referenceValueAtSale: car.baseMarketValue + (car.cosmeticCondition - 50) * 35,
      workLog: [...car.actionHistory]
    });
    removeCarFromInventory(car.id);
    log(`Travel constraint: sold extra car ${car.name} to junkyard for ${fmt(payout)}.`);
    trackAction("travel_junkyard_sale", { carId: car.id, name: car.name, payout, invested: car.totalInvested, dealProfit }, true);
  } else if (method === "abandon") {
    car.actionHistory.push({ kind: "abandon", day: state.day });
    removeCarFromInventory(car.id);
    log(`Travel constraint: abandoned extra car ${car.name}.`);
    trackAction("travel_abandon_car", { carId: car.id, name: car.name }, true);
  } else {
    return false;
  }

  if (!state.selectedInventoryId) {
    state.selectedInventoryId = state.inventory[0]?.id || null;
  }
  recordSeriesPoint();
  renderGraphs();
  renderDealHistory();
  renderTopbar();
  return true;
}

function cheapestTravelFuelForCar(car) {
  if (!car || !state.currentCity) {
    return Infinity;
  }
  const choices = state.cityTravelChoices.length
    ? state.cityTravelChoices
    : [{ distanceKm: CONFIG.travel.minDistanceKm }];
  let min = Infinity;
  choices.forEach((choice) => {
    const fuel = Math.round(choice.distanceKm * CONFIG.travel.fuelCostPerKm * car.fuelCostModifier * state.currentCity.fuelMult);
    if (fuel < min) {
      min = fuel;
    }
  });
  return min;
}

function canContinueRun() {
  const usableCars = state.inventory.filter((car) => !car.brokenDown && car.durability > 0);
  const liquidity = state.money + state.inventory.reduce((sum, car) => sum + calcJunkyardPrice(car), 0);
  const canFundAnyTravel = usableCars.some((car) => liquidity >= cheapestTravelFuelForCar(car));
  if (canFundAnyTravel) {
    return true;
  }

  if (state.inventory.some((car) => car.brokenDown && state.money >= emergencyRepairCost(car))) {
    return true;
  }

  if (canAffordAnyCar()) {
    return true;
  }

  return false;
}

function collapseRun(reason) {
  state.runOver = true;
  state.runStatus = "collapsed";
  renderTopbar();
  showPanel(el.marketPanel);
  el.marketCars.innerHTML = `
    <div class="card">
      <strong>Run Collapsed</strong><br>
      Cities reached: ${state.citiesReached}<br>
      Current city: ${state.currentCity ? state.currentCity.name : "N/A"}<br>
      Money left: ${fmt(state.money)}<br>
      Reason: ${reason}
    </div>
    <button id="restart-btn">Restart Run</button>
  `;
  document.getElementById("restart-btn").addEventListener("click", () => window.location.reload());
  log(`Run collapsed: ${reason}`);
  schedulePersistence();
}

function arriveAtCity(city, via = "travel") {
  state.currentCity = city;
  state.cityModifier = city;
  state.citiesReached += 1;
  state.day += 1;
  state.routeHistory.push(city.name);
  state.travelPendingDestination = null;
  state.pendingRoadEvent = null;

  applyDailyEvent();
  generateDayCars();
  generateCityTravelChoices();
  recordSeriesPoint();
  renderGraphs();
  renderTopbar();
  renderMarket();
  showPanel(el.marketPanel);
  log(`Arrived in ${city.name} via ${via}. ${state.dayCars.length} local junkers listed.`);

  if (state.citiesReached >= CONFIG.maxCities) {
    state.runOver = true;
    state.runStatus = "finished";
    showPanel(el.marketPanel);
    el.marketCars.innerHTML = `
      <div class="card">
        <strong>Run Finished</strong><br>
        You reached ${state.citiesReached} cities.<br>
        Cash: ${fmt(state.money)}<br>
        Route: ${state.routeHistory.join(" -> ")}
      </div>
      <button id="restart-btn">Restart Run</button>
    `;
    document.getElementById("restart-btn").addEventListener("click", () => window.location.reload());
    log(`Run finished after reaching ${state.citiesReached} cities.`);
    schedulePersistence();
    return;
  }

  if (!canContinueRun()) {
    collapseRun("No usable car and no affordable recovery options.");
  }
}

function maybeTriggerRoadEvent(car, choice) {
  const roll = Math.random();
  if (roll > 0.46) {
    return false;
  }

  const risk = unresolvedTravelRisk(car);
  const pool = ["flat_tire", "overheat", "cheap_mechanic", "scam_tow", "fuel_spike", "hidden_fault"];
  const type = pick(pool);

  if (type === "flat_tire") {
    addFaultIfMissing(car, "tires", true);
    car.durability = clamp(car.durability - randInt(6, 12), 0, 100);
    log(`Road event: Flat tire near ${choice.city.name}. Tire issue added.`);
    return true;
  }

  if (type === "overheat") {
    addFaultIfMissing(car, "engine", true);
    car.durability = clamp(car.durability - randInt(8, 15), 0, 100);
    log(`Road event: Engine overheated on route to ${choice.city.name}.`);
    return true;
  }

  if (type === "fuel_spike") {
    choice.city.fuelMult = clamp(choice.city.fuelMult + 0.12, 0.85, 1.4);
    log(`Road event: Fuel price spike expected in ${choice.city.name}.`);
    return true;
  }

  if (type === "hidden_fault") {
    if (car.hiddenFaults.length > 0 && !car.inspected) {
      const revealed = pick(car.hiddenFaults);
      if (!car.visibleFaults.includes(revealed)) {
        car.visibleFaults.push(revealed);
      }
      log(`Road event: Hidden fault surfaced on road (${FAULTS[revealed].label}).`);
    } else {
      addFaultIfMissing(car, pick(["electrical", "rust", "interior"]), true);
      log("Road event: New minor fault emerged during travel.");
    }
    return true;
  }

  if (type === "cheap_mechanic") {
    const fixable = risk.unresolved;
    if (!fixable.length) {
      log("Road event: Found cheap mechanic, but nothing urgent to fix.");
      return true;
    }
    const faultId = pick(fixable);
    const cheapCost = Math.round(FAULTS[faultId].repairCost * 0.55);
    state.pendingRoadEvent = {
      kind: "cheap_mechanic",
      title: "Road Event: Cheap Local Mechanic",
      text: `A roadside mechanic offers to patch ${FAULTS[faultId].label} for ${fmt(cheapCost)} before entering ${choice.city.name}.`,
      options: [
        { id: "accept_cheap_mech", label: `Pay ${fmt(cheapCost)} and fix it` },
        { id: "skip_cheap_mech", label: "Skip and keep driving" }
      ],
      data: { cost: cheapCost, faultId, destination: choice.city }
    };
    renderRoadEventPanel();
    showPanel(el.eventPanel);
    return true;
  }

  if (type === "scam_tow") {
    const towCost = randInt(260, 420);
    state.pendingRoadEvent = {
      kind: "scam_tow",
      title: "Road Event: Sketchy Tow Driver",
      text: `A tow driver blocks the lane and demands ${fmt(towCost)} to "escort" you safely to ${choice.city.name}.`,
      options: [
        { id: "pay_scam_tow", label: `Pay ${fmt(towCost)}` },
        { id: "refuse_scam_tow", label: "Refuse and risk extra damage" }
      ],
      data: { towCost, destination: choice.city }
    };
    renderRoadEventPanel();
    showPanel(el.eventPanel);
    return true;
  }

  return false;
}

function triggerBreakdown(choice, breakdownChance) {
  const car = getCurrentCar();
  if (!car) {
    return;
  }
  car.brokenDown = true;
  state.travelPendingDestination = choice.city;

  const emergencyCost = emergencyRepairCost(car);
  const roadsidePayout = Math.round(calcJunkyardPrice(car) * 0.45);
  state.pendingRoadEvent = {
    kind: "breakdown",
    title: `Breakdown on road to ${choice.city.name}`,
    text: `${car.name} died mid-route. Breakdown risk roll ${(breakdownChance * 100).toFixed(0)}%. Choose how to survive this leg.`,
    options: [
      { id: "breakdown_emergency_repair", label: `Emergency repair (${fmt(emergencyCost)})` },
      { id: "breakdown_limp", label: "Try limping to city" },
      { id: "breakdown_roadside_sale", label: `Sell roadside for ${fmt(roadsidePayout)}` },
      { id: "breakdown_abandon", label: `Abandon car and pay taxi (${fmt(CONFIG.abandonTaxiCost)})` }
    ],
    data: { emergencyCost, roadsidePayout, destination: choice.city }
  };
  renderRoadEventPanel();
  showPanel(el.eventPanel);
}

function resolveTravelToChoice(choiceIndex) {
  if (state.runOver || state.runStatus !== "active") {
    return;
  }

  const choice = state.cityTravelChoices[choiceIndex];
  if (!choice) {
    return;
  }

  const car = getCurrentCar();
  if (!car) {
    log("No road car selected. Choose or buy a car before traveling.");
    return;
  }
  const extras = getNonTravelCars();
  if (extras.length > 0) {
    log("You can only travel with one car. Sell or abandon all extra cars first.");
    renderTravelPanel();
    showPanel(el.travelPanel);
    return;
  }

  if (car.brokenDown || car.durability <= 0) {
    log(`${car.name} is not roadworthy. Repair, replace, or abandon it.`);
    return;
  }

  const fuelCost = Math.round(choice.distanceKm * CONFIG.travel.fuelCostPerKm * car.fuelCostModifier * state.currentCity.fuelMult);
  if (state.money < fuelCost) {
    log(`Not enough cash for fuel (${fmt(fuelCost)}).`);
    if (!canContinueRun()) {
      collapseRun("Could not afford travel fuel and no recovery path.");
    }
    return;
  }

  state.money -= fuelCost;
  state.totalSpent += fuelCost;
  state.totalProfit = state.totalRevenue;
  car.totalInvested += fuelCost;
  car.actionHistory.push({ kind: "travel", day: state.day, amount: fuelCost, to: choice.city.name, km: choice.distanceKm });

  const risk = unresolvedTravelRisk(car);
  const wear = Math.round((choice.distanceKm / 100) * CONFIG.travel.baseWearPer100Km * choice.roadRisk * risk.wearMult);
  car.durability = clamp(car.durability - wear, 0, 100);

  if (Math.random() < CONFIG.travel.hiddenFaultRevealChance && car.hiddenFaults.length > 0 && !car.inspected) {
    const reveal = pick(car.hiddenFaults);
    if (!car.visibleFaults.includes(reveal)) {
      car.visibleFaults.push(reveal);
    }
    log(`Road stress revealed hidden issue: ${FAULTS[reveal].label}.`);
  }

  if (Math.random() < CONFIG.travel.newFaultChance * choice.roadRisk) {
    addFaultIfMissing(car, pick(["tires", "electrical", "rust"]), true);
    log("Road damage introduced a new fault.");
  }

  const durabilityRisk = clamp((55 - car.durability) / 100, 0, 0.45);
  const reliabilityRisk = clamp(0.4 - car.reliability, 0, 0.28);
  const breakdownChance = clamp(CONFIG.travel.baseBreakdownChance + risk.breakRisk + durabilityRisk + reliabilityRisk, 0.02, 0.93);

  trackAction("travel", {
    from: state.currentCity.name,
    to: choice.city.name,
    distanceKm: choice.distanceKm,
    fuelCost,
    wear,
    breakdownChance,
    carId: car.id,
    carName: car.name
  }, true);

  log(`Traveling ${choice.distanceKm}km from ${state.currentCity.name} to ${choice.city.name}. Fuel ${fmt(fuelCost)}, wear ${wear}.`);
  recordSeriesPoint();
  renderGraphs();

  if (Math.random() < breakdownChance || car.durability <= 0) {
    triggerBreakdown(choice, breakdownChance);
    return;
  }

  const blockedByEvent = maybeTriggerRoadEvent(car, choice);
  if (!blockedByEvent) {
    arriveAtCity(choice.city, "road trip");
  }

}

function resolveRoadEventOption(optionId) {
  const evt = state.pendingRoadEvent;
  if (!evt) {
    showPanel(el.travelPanel);
    return;
  }

  const car = getCurrentCar();

  if (evt.kind === "cheap_mechanic") {
    if (optionId === "accept_cheap_mech") {
      if (state.money < evt.data.cost) {
        log(`Could not pay cheap mechanic (${fmt(evt.data.cost)}).`);
      } else {
      state.money -= evt.data.cost;
      state.totalSpent += evt.data.cost;
      state.totalProfit = state.totalRevenue;
      if (car) {
          car.totalInvested += evt.data.cost;
          car.repairedFaults.add(evt.data.faultId);
          car.brokenDown = false;
          car.durability = clamp(car.durability + 6, 0, 100);
          car.reliability = clamp(car.reliability + 0.03, 0.12, 0.96);
          car.actionHistory.push({ kind: "roadside_repair", day: state.day, amount: evt.data.cost, faultId: evt.data.faultId });
        }
        log(`Cheap mechanic fixed ${FAULTS[evt.data.faultId].label} for ${fmt(evt.data.cost)}.`);
      }
    } else {
      log("Skipped cheap mechanic.");
    }
    state.pendingRoadEvent = null;
    arriveAtCity(evt.data.destination, "road event");
    return;
  }

  if (evt.kind === "scam_tow") {
    if (optionId === "pay_scam_tow") {
      if (state.money < evt.data.towCost) {
        log(`Could not pay tow scam ${fmt(evt.data.towCost)}; took damage instead.`);
        if (car) car.durability = clamp(car.durability - 16, 0, 100);
      } else {
        state.money -= evt.data.towCost;
        state.totalSpent += evt.data.towCost;
        state.totalProfit = state.totalRevenue;
        if (car) car.totalInvested += evt.data.towCost;
        log(`Paid sketchy tow ${fmt(evt.data.towCost)} and reached city.`);
      }
    } else {
      if (car) {
        car.durability = clamp(car.durability - randInt(10, 20), 0, 100);
      }
      log("Refused tow scam, took extra road damage.");
    }
    state.pendingRoadEvent = null;
    arriveAtCity(evt.data.destination, "road event");
    return;
  }

  if (evt.kind === "breakdown") {
    if (!car) {
      state.pendingRoadEvent = null;
      arriveAtCity(evt.data.destination, "stranded transfer");
      return;
    }

    if (optionId === "breakdown_emergency_repair") {
      if (state.money < evt.data.emergencyCost) {
        log(`Cannot afford emergency repair ${fmt(evt.data.emergencyCost)}.`);
        return;
      }
      state.money -= evt.data.emergencyCost;
      state.totalSpent += evt.data.emergencyCost;
      state.totalProfit = state.totalRevenue;
      car.totalInvested += evt.data.emergencyCost;
      car.brokenDown = false;
      car.durability = clamp(car.durability + 24, 0, 100);
      car.reliability = clamp(car.reliability + 0.06, 0.12, 0.97);
      car.actionHistory.push({ kind: "emergency_repair", day: state.day, amount: evt.data.emergencyCost });
      log(`Emergency repair paid. ${car.name} limps back to life.`);
      state.pendingRoadEvent = null;
      arriveAtCity(evt.data.destination, "emergency repair");
      return;
    }

    if (optionId === "breakdown_limp") {
      const limpChance = clamp(0.35 + car.reliability * 0.35 + car.durability / 240, 0.08, 0.92);
      if (Math.random() < limpChance) {
        car.brokenDown = false;
        car.durability = clamp(car.durability - randInt(12, 22), 0, 100);
        addFaultIfMissing(car, pick(["engine", "transmission", "electrical"]), true);
        log(`Limped into ${evt.data.destination.name} with heavy damage.`);
      } else {
        car.brokenDown = true;
        car.durability = 0;
        log(`Limp attempt failed. ${car.name} is dead on arrival.`);
      }
      state.pendingRoadEvent = null;
      arriveAtCity(evt.data.destination, "limp attempt");
      return;
    }

    if (optionId === "breakdown_roadside_sale") {
      state.money += evt.data.roadsidePayout;
      state.totalRevenue += evt.data.roadsidePayout;
      state.totalSpent += CONFIG.roadsideScrapPenalty;
      state.money = Math.max(0, state.money - CONFIG.roadsideScrapPenalty);
      state.totalProfit = state.totalRevenue;
      removeCarFromInventory(car.id);
      log(`Sold broken ${car.name} roadside for ${fmt(evt.data.roadsidePayout)} and paid recovery fees.`);
      state.pendingRoadEvent = null;
      arriveAtCity(evt.data.destination, "roadside sale");
      return;
    }

    if (optionId === "breakdown_abandon") {
      state.totalSpent += CONFIG.abandonTaxiCost;
      state.money = Math.max(0, state.money - CONFIG.abandonTaxiCost);
      state.totalProfit = state.totalRevenue;
      removeCarFromInventory(car.id);
      log(`Abandoned ${car.name} and took a taxi to ${evt.data.destination.name}.`);
      state.pendingRoadEvent = null;
      arriveAtCity(evt.data.destination, "abandon + taxi");
      return;
    }
  }

  state.pendingRoadEvent = null;
  showPanel(el.travelPanel);
}

function abandonRun() {
  if (state.runOver) {
    return;
  }
  state.runOver = true;
  state.runStatus = "abandoned";
  showPanel(el.marketPanel);
  el.marketCars.innerHTML = `
    <div class="card">
      <strong>Run Abandoned</strong><br>
      Cities reached: ${state.citiesReached}<br>
      Cash left: ${fmt(state.money)}<br>
      Route: ${state.routeHistory.join(" -> ")}
    </div>
    <button id="restart-btn">Restart Run</button>
  `;
  document.getElementById("restart-btn").addEventListener("click", () => window.location.reload());
  log("Run abandoned by player.");
  schedulePersistence();
}
