function createOperationCoordinator(options = {}) {
  const syncBlockedMessage =
    options.syncBlockedMessage || "Google Drive 正在同步，请等待同步完成后再保存卡片。";
  let syncInFlight = null;
  let saveInFlight = null;

  function runSave(operation) {
    if (syncInFlight) {
      return Promise.reject(new Error(syncBlockedMessage));
    }

    const previousSave = saveInFlight;
    const queued = (previousSave ? previousSave.catch(() => undefined) : Promise.resolve()).then(operation);
    const tracked = queued.finally(() => {
      if (saveInFlight === tracked) saveInFlight = null;
    });
    saveInFlight = tracked;
    return tracked;
  }

  function runSync(operation) {
    if (syncInFlight) return syncInFlight;

    const previousSave = saveInFlight;
    const queued = (async () => {
      if (previousSave) await previousSave;
      return operation();
    })();
    const tracked = queued.finally(() => {
      if (syncInFlight === tracked) syncInFlight = null;
    });
    syncInFlight = tracked;
    return tracked;
  }

  return {
    runSave,
    runSync
  };
}

module.exports = { createOperationCoordinator };
