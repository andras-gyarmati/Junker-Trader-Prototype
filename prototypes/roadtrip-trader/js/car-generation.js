function generateCar() {
  const age = randInt(6, 23);
  const mileage = randInt(70000, 280000);
  const cosmeticCondition = randInt(20, 95);
  const riskScoreModifier = Math.random();

  let baseMarketValue = 14500 - age * 265 - mileage * 0.025 + randInt(-1200, 1200);
  baseMarketValue = clamp(baseMarketValue, 1300, 12000);

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
  askingPrice = clamp(askingPrice, 550, baseMarketValue * 1.08);
  const reserveRatio = clamp(
    0.68 + sellerPersonality.patience * 0.16 + (Math.random() * 0.1 - 0.05),
    0.66,
    1.04
  );
  const reservePrice = Math.round(askingPrice * reserveRatio);

  return {
    id: makeId(),
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
    lastRejectedOffer: 0,
    reservePrice,
    offended: 0,
    durability: randInt(45, 95),
    reliability: clamp(0.42 + Math.random() * 0.44 - riskScoreModifier * 0.12, 0.18, 0.92),
    fuelCostModifier: clamp(0.88 + Math.random() * 0.42 + riskScoreModifier * 0.08, 0.78, 1.45),
    brokenDown: false
  };
}

function applyDailyEvent() {
  const roll = Math.random();
  state.dailyEvent = { name: "None", desc: "No major market shift.", askModifier: 1, saleModifier: 1, inspectModifier: 1 };

  if (roll < 0.2) {
    state.dailyEvent = {
      name: "Rainy Market",
      desc: "Rusty heaps flood listings. More rust faults.",
      askModifier: 0.97,
      saleModifier: 1,
      inspectModifier: 1
    };
  } else if (roll < 0.38) {
    state.dailyEvent = {
      name: "Tax Panic",
      desc: "Sellers drop prices to unload quickly.",
      askModifier: 0.9,
      saleModifier: 1,
      inspectModifier: 1
    };
  } else if (roll < 0.56) {
    state.dailyEvent = {
      name: "Weekend Hype",
      desc: "Buyers pay a bit more today.",
      askModifier: 1,
      saleModifier: 1.06,
      inspectModifier: 1
    };
  } else if (roll < 0.72) {
    state.dailyEvent = {
      name: "Mechanic Strike",
      desc: "Engine/transmission/tire repairs are blocked today; other work costs more.",
      askModifier: 1,
      saleModifier: 1,
      inspectModifier: 1.25
    };
  }
}

function generateDayCars() {
  applyDailyEvent();
  rollDailyBuyerDemand();
  const count = randInt(CONFIG.carsPerDayMin, CONFIG.carsPerDayMax);
  state.dayCars = Array.from({ length: count }, () => {
    const car = generateCar();

    if (state.dailyEvent.name === "Rainy Market" && Math.random() < 0.45 && !car.visibleFaults.includes("rust") && !car.hiddenFaults.includes("rust")) {
      car.visibleFaults.push("rust");
      car.askingPrice = Math.max(450, car.askingPrice - 300);
    }

    car.askingPrice = Math.round(car.askingPrice * state.dailyEvent.askModifier * state.cityModifier.carPriceMult);
    if (state.cityModifier.qualityShift < 0) {
      car.durability = clamp(car.durability + Math.round(state.cityModifier.qualityShift * 30), 20, 100);
      car.reliability = clamp(car.reliability + state.cityModifier.qualityShift * 0.25, 0.12, 0.92);
    } else {
      car.durability = clamp(car.durability + Math.round(state.cityModifier.qualityShift * 20), 25, 100);
      car.reliability = clamp(car.reliability + state.cityModifier.qualityShift * 0.2, 0.12, 0.95);
    }
    if (Math.random() < state.cityModifier.shadySeller) {
      car.hiddenFaults.push(pick(Object.keys(FAULTS)));
      car.hiddenFaults = [...new Set(car.hiddenFaults)];
    }
    return car;
  });
}
