function syncSliderRangesFromConfig() {
  el.offerSlider.min = String(Math.round(CONFIG.negotiation.customMinRatio * 100));
  el.offerSlider.max = String(Math.round(CONFIG.negotiation.customMaxRatio * 100));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function fmt(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function balanceDelta() {
  return state.money - CONFIG.startingMoney;
}

function trackAction(type, data = {}, persistAfter = false) {
  state.actions.push({
    t: new Date().toISOString(),
    day: state.day,
    type,
    ...data
  });
  if (persistAfter) {
    schedulePersistence();
  }
}
