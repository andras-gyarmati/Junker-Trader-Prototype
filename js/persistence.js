async function ensureOpfsReady() {
  if (state.opfsReady) {
    return true;
  }
  if (!navigator.storage || !navigator.storage.getDirectory) {
    state.persistenceMode = "localStorage";
    return false;
  }
  try {
    state.opfsDir = await navigator.storage.getDirectory();
    state.opfsReady = true;
    state.persistenceMode = "opfs";
    return true;
  } catch (_err) {
    state.persistenceMode = "localStorage";
    return false;
  }
}

async function persistRunDataNow() {
  const payload = buildExportData();
  const json = JSON.stringify(payload);
  const ndjson = state.actions.map((a) => JSON.stringify(a)).join("\n");

  if (await ensureOpfsReady()) {
    const runFile = await state.opfsDir.getFileHandle(`${state.saveSuggestedName}.json`, { create: true });
    const writable = await runFile.createWritable();
    await writable.write(json);
    await writable.close();
    const actionsFile = await state.opfsDir.getFileHandle(`${state.saveSuggestedName}-actions.ndjson`, { create: true });
    const actionsWritable = await actionsFile.createWritable();
    await actionsWritable.write(ndjson);
    await actionsWritable.close();
    renderPersistenceLinks(json, ndjson);
    return;
  }

  localStorage.setItem("junker_trader_latest_run", json);
  renderPersistenceLinks(json, ndjson);
}

function schedulePersistence() {
  state.savePending = true;
  if (state.saveInFlight) {
    return;
  }

  state.saveInFlight = true;
  setTimeout(async () => {
    while (state.savePending) {
      state.savePending = false;
      try {
        await persistRunDataNow();
      } catch (_err) {
        state.persistenceMode = "localStorage";
        try {
          localStorage.setItem("junker_trader_latest_run", JSON.stringify(buildExportData()));
        } catch (_err2) {
          // best effort only
        }
      }
    }
    state.saveInFlight = false;
  }, 0);
}

function log(msg) {
  state.logLines.unshift(`[Day ${state.day}] ${msg}`);
  el.log.textContent = state.logLines.join("\n");
  trackAction("log", { msg });
}

function renderPersistenceLinks(runJson, actionsNdjson) {
  if (!el.runLogLink || !el.actionsLogLink || !el.persistenceStatus) {
    return;
  }

  if (state.runBlobUrl) {
    URL.revokeObjectURL(state.runBlobUrl);
  }
  if (state.actionsBlobUrl) {
    URL.revokeObjectURL(state.actionsBlobUrl);
  }

  state.runBlobUrl = URL.createObjectURL(new Blob([runJson], { type: "application/json" }));
  state.actionsBlobUrl = URL.createObjectURL(new Blob([actionsNdjson], { type: "application/x-ndjson" }));

  const runName = `${state.saveSuggestedName}.json`;
  const actionsName = `${state.saveSuggestedName}-actions.ndjson`;

  el.runLogLink.href = state.runBlobUrl;
  el.runLogLink.download = runName;
  el.runLogLink.textContent = runName;

  el.actionsLogLink.href = state.actionsBlobUrl;
  el.actionsLogLink.download = actionsName;
  el.actionsLogLink.textContent = actionsName;

  el.persistenceStatus.textContent = `Persistence: ${state.persistenceMode}`;
}

function buildExportData() {
  return {
    meta: {
      exportedAt: new Date().toISOString(),
      runStartedAt: state.runStartedAt,
      day: state.day,
      runOver: state.runOver
    },
    summary: {
      startingMoney: CONFIG.startingMoney,
      money: state.money,
      revenue: state.totalRevenue,
      spent: state.totalSpent,
      balanceDelta: balanceDelta(),
      inventoryCount: state.inventory.length,
      persistenceMode: state.persistenceMode
    },
    series: state.series,
    completedDeals: state.completedDeals,
    saleHistory: state.saleHistory,
    inventorySnapshot: state.inventory.map((car) => ({
      id: car.id,
      name: car.name,
      purchaseDay: car.purchaseDay,
      boughtFor: car.boughtFor,
      totalInvested: car.totalInvested,
      saleAttempts: car.saleAttempts,
      inspected: car.inspected,
      visibleFaults: car.visibleFaults,
      hiddenFaults: car.hiddenFaults,
      repairedFaults: [...car.repairedFaults]
    })),
    logs: state.logLines,
    actions: state.actions
  };
}
