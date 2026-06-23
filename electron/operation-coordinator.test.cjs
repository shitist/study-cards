const assert = require("node:assert/strict");
const test = require("node:test");
const { createOperationCoordinator } = require("./operation-coordinator.cjs");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("sync waits for an already-started save", async () => {
  const coordinator = createOperationCoordinator();
  const saveGate = deferred();
  const order = [];

  const save = coordinator.runSave(async () => {
    order.push("save-start");
    await saveGate.promise;
    order.push("save-end");
    return "saved";
  });
  const sync = coordinator.runSync(async () => {
    order.push("sync");
    return "synced";
  });

  await Promise.resolve();
  assert.deepEqual(order, ["save-start"]);
  saveGate.resolve();

  assert.equal(await save, "saved");
  assert.equal(await sync, "synced");
  assert.deepEqual(order, ["save-start", "save-end", "sync"]);
});

test("save is rejected while sync is active instead of writing a stale renderer snapshot", async () => {
  const coordinator = createOperationCoordinator();
  const syncGate = deferred();
  const sync = coordinator.runSync(() => syncGate.promise);

  await assert.rejects(
    coordinator.runSave(async () => "should-not-run"),
    /正在同步/
  );

  syncGate.resolve("synced");
  assert.equal(await sync, "synced");
});

test("a failed save rejects its caller but does not poison the next save", async () => {
  const coordinator = createOperationCoordinator();
  const first = coordinator.runSave(async () => {
    throw new Error("disk full");
  });
  const second = coordinator.runSave(async () => "saved later");

  await assert.rejects(first, /disk full/);
  assert.equal(await second, "saved later");
});
