function calcTrueValue(car) {
  let val = car.baseMarketValue;
  allFaults(car).forEach((f) => {
    if (!car.repairedFaults.has(f)) {
      val -= FAULTS[f].valueHit;
    }
  });
  val += (car.cosmeticCondition - 50) * 35;
  return Math.max(650, val);
}

function carComparableData(car) {
  return {
    name: car.name,
    age: car.age,
    mileage: car.mileage,
    cosmeticCondition: car.cosmeticCondition,
    visibleFaultCount: car.visibleFaults.length
  };
}

function notebookEstimateRange(car) {
  if (state.saleHistory.length < CONFIG.notebook.minSamplesForEstimate) {
    return null;
  }

  const probe = carComparableData(car);
  let weightedSum = 0;
  let totalWeight = 0;
  const weightedPrices = [];
  let matchedSamples = 0;
  let strongestWeight = 0;

  state.saleHistory.forEach((entry) => {
    const namePenalty = entry.name === probe.name ? 0 : 1.2;
    const agePenalty = Math.abs(entry.age - probe.age) * 0.08;
    const mileagePenalty = Math.abs(entry.mileage - probe.mileage) / 60000;
    const cosmeticPenalty = Math.abs(entry.cosmeticCondition - probe.cosmeticCondition) / 30;
    const visiblePenalty = Math.abs(entry.visibleFaultCount - probe.visibleFaultCount) * 0.35;
    const dist = namePenalty + agePenalty + mileagePenalty + cosmeticPenalty + visiblePenalty;
    const weight = 1 / (1 + dist);

    weightedSum += entry.finalPrice * weight;
    totalWeight += weight;
    weightedPrices.push({ price: entry.finalPrice, weight });
    if (weight >= 0.22) {
      matchedSamples += 1;
    }
    strongestWeight = Math.max(strongestWeight, weight);
  });

  if (totalWeight <= 0) {
    return null;
  }

  const mean = weightedSum / totalWeight;
  let variance = 0;
  weightedPrices.forEach((x) => {
    variance += ((x.price - mean) ** 2) * x.weight;
  });
  variance /= totalWeight;

  const stdDev = Math.sqrt(variance);
  const totalSamples = state.saleHistory.length;
  const effectiveSamples = Math.max(1, totalWeight);
  const confidence = clamp((effectiveSamples / 8) + (matchedSamples / 14), 0.08, 0.98);
  const slowConvergeFactor = clamp(1.95 - Math.log(totalSamples + 1) * 0.24, 0.8, 1.95);
  const minHalfRange = 280 * slowConvergeFactor;
  const halfRange = Math.max(minHalfRange, stdDev * (0.95 + 2.8 / Math.sqrt(effectiveSamples))) * slowConvergeFactor;

  return {
    low: Math.max(300, mean - halfRange),
    high: mean + halfRange,
    mean,
    sampleCount: totalSamples,
    matchedSamples,
    strongestWeight,
    confidence
  };
}
