"use strict";
// Holds the PC awake while the dashboard says it should be. Windows decides
// "idle" by keyboard and mouse, so a game server full of friends looks idle
// and the host goes to sleep under them; and after a wake timer fires with
// nobody at the keyboard, Windows goes back to sleep within a couple of
// minutes unless something asks it not to.
//
// Pure controller: the dashboard lookup, the power-save blocker and the timer
// are injected so the logic is unit-testable (see __tests__/keepAwake.test.js).

const DEFAULT_INTERVAL_MS = 20000;

// "prevent-app-suspension" keeps the system awake but lets the display turn
// off — the right trade for a machine hosting a server overnight.
const BLOCKER_TYPE = "prevent-app-suspension";

function createKeepAwake({
  fetchDecision,
  blocker,
  setTimer = setInterval,
  clearTimer = clearInterval,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxFailures = 3,
  log = () => {},
}) {
  let blockerId = null;
  let timer = null;
  let failures = 0;
  let inFlight = false;

  function hold(reasons) {
    if (blockerId !== null) return;
    blockerId = blocker.start(BLOCKER_TYPE);
    log(`keep-awake on: ${(reasons && reasons.join("; ")) || "requested"}`);
  }

  function release(why) {
    if (blockerId === null) return;
    blocker.stop(blockerId);
    blockerId = null;
    log(`keep-awake off: ${why}`);
  }

  async function poll() {
    if (inFlight) return;
    inFlight = true;
    try {
      const decision = await fetchDecision();
      failures = 0;
      if (decision && decision.keepAwake) hold(decision.reasons);
      else release("nothing needs this PC awake");
    } catch (err) {
      // Fail toward letting the PC sleep: a dashboard that has stopped
      // answering must not pin the machine awake forever. A few misses are
      // tolerated so one slow request doesn't drop the hold mid-game.
      failures += 1;
      if (failures >= maxFailures) release("the dashboard stopped answering");
    } finally {
      inFlight = false;
    }
  }

  return {
    start() {
      if (timer !== null) return;
      poll();
      timer = setTimer(poll, intervalMs);
    },
    stop() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      release("RealmSwap is quitting");
    },
    pollNow: poll,
    isHolding: () => blockerId !== null,
  };
}

// The dashboard lookup used in production: the loopback route guarded by the
// per-launch internal token.
async function fetchKeepAwakeDecision(port, token) {
  const res = await fetch(`http://127.0.0.1:${port}/api/system/keep-awake`, {
    headers: { "x-internal-token": token },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`keep-awake lookup failed: ${res.status}`);
  return res.json();
}

module.exports = { createKeepAwake, fetchKeepAwakeDecision, BLOCKER_TYPE };
