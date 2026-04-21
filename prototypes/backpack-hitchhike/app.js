const CITY_POOL = [
  "Lisbon", "Madrid", "Barcelona", "Paris", "Brussels", "Amsterdam", "Berlin", "Prague", "Vienna", "Budapest", "Warsaw", "Milan", "Copenhagen"
];

const TRANSPORT_TYPES = {
  train: { costPer100: 8, fatigue: 10, risk: 0.08, label: "Train" },
  bus: { costPer100: 5, fatigue: 14, risk: 0.12, label: "Bus" },
  hitchhike: { costPer100: 1, fatigue: 20, risk: 0.2, label: "Hitchhike" }
};

const state = {
  day: 1,
  city: CITY_POOL[Math.floor(Math.random() * CITY_POOL.length)],
  citiesVisited: 1,
  money: 120,
  energy: 100,
  morale: 60,
  runOver: false,
  log: [],
  choices: []
};

const el = {
  status: document.getElementById("status"),
  choices: document.getElementById("choices"),
  event: document.getElementById("event"),
  log: document.getElementById("log"),
  restBtn: document.getElementById("rest-btn")
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function addLog(msg) {
  state.log.unshift(`[Day ${state.day}] ${msg}`);
  el.log.textContent = state.log.join("\n");
}

function pickNewCity() {
  const options = CITY_POOL.filter((c) => c !== state.city);
  return options[randInt(0, options.length - 1)];
}

function generateChoices() {
  state.choices = [];
  const count = randInt(2, 3);
  for (let i = 0; i < count; i += 1) {
    const destination = pickNewCity();
    const km = randInt(120, 760);
    state.choices.push({ destination, km });
  }
}

function renderStatus() {
  el.status.innerHTML = `
    <strong>City:</strong> ${state.city}
    | <strong>Visited:</strong> ${state.citiesVisited}
    | <strong>Money:</strong> €${state.money}
    | <strong>Energy:</strong> ${state.energy}
    | <strong>Morale:</strong> ${state.morale}
    | <strong>Day:</strong> ${state.day}
  `;
}

function renderChoices() {
  el.choices.innerHTML = "";
  if (state.runOver) {
    el.choices.innerHTML = "<div class='card'><strong>Run Over</strong></div>";
    return;
  }

  state.choices.forEach((choice, idx) => {
    const card = document.createElement("div");
    card.className = "card";

    const buttons = Object.entries(TRANSPORT_TYPES)
      .map(([id, t]) => {
        const fare = Math.round((choice.km / 100) * t.costPer100);
        return `<button data-choice='${idx}' data-transport='${id}'>${t.label} (cost €${fare}, fatigue ${t.fatigue})</button>`;
      })
      .join("<br>");

    card.innerHTML = `
      <strong>${choice.destination}</strong><br>
      Distance: ${choice.km} km<br>
      ${buttons}
    `;

    el.choices.appendChild(card);
  });
}

function endRun(reason) {
  state.runOver = true;
  addLog(`Run over: ${reason}. Visited ${state.citiesVisited} cities.`);
  el.event.textContent = `Run over: ${reason}`;
  renderChoices();
}

function resolveTravel(choiceIndex, transportId) {
  if (state.runOver) return;

  const choice = state.choices[choiceIndex];
  const t = TRANSPORT_TYPES[transportId];
  if (!choice || !t) return;

  const cost = Math.round((choice.km / 100) * t.costPer100);
  if (state.money < cost) {
    addLog(`Cannot afford ${t.label} to ${choice.destination}. Need €${cost}.`);
    return;
  }

  state.money -= cost;
  state.energy = clamp(state.energy - t.fatigue - Math.floor(choice.km / 90), 0, 100);
  state.morale = clamp(state.morale - randInt(1, 5), 0, 100);

  let eventText = "Smooth ride.";
  if (Math.random() < t.risk) {
    const roll = Math.random();
    if (roll < 0.4) {
      state.money = Math.max(0, state.money - 12);
      eventText = "Got scammed at a station kiosk (-€12).";
    } else if (roll < 0.75) {
      state.energy = clamp(state.energy - 18, 0, 100);
      eventText = "Long delay and rough weather (-18 energy).";
    } else {
      state.morale = clamp(state.morale + 10, 0, 100);
      eventText = "Met cool travelers (+10 morale).";
    }
  }

  state.city = choice.destination;
  state.citiesVisited += 1;
  state.day += 1;

  addLog(`${t.label} to ${choice.destination} (${choice.km}km), paid €${cost}. ${eventText}`);
  el.event.textContent = eventText;

  if (state.energy <= 0) {
    endRun("exhaustion");
    return;
  }
  if (state.money <= 0 && Math.random() < 0.35) {
    endRun("ran out of cash buffer");
    return;
  }

  generateChoices();
  renderStatus();
  renderChoices();
}

function rest() {
  if (state.runOver) return;
  state.day += 1;
  state.energy = clamp(state.energy + 22, 0, 100);
  state.morale = clamp(state.morale + 4, 0, 100);
  state.money = Math.max(0, state.money - 6);
  addLog("Rested in city (+22 energy, +4 morale, -€6). ");
  if (state.money <= 0 && state.energy < 30) {
    endRun("too broke and exhausted");
    return;
  }
  renderStatus();
}

document.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;

  const choice = target.dataset.choice;
  const transport = target.dataset.transport;
  if (choice != null && transport) {
    resolveTravel(Number(choice), transport);
  }
});

el.restBtn.addEventListener("click", rest);

generateChoices();
renderStatus();
renderChoices();
addLog(`Trip started in ${state.city}.`);
