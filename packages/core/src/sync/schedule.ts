import { SYNC_POLICY } from "./protocol";

/** Pure deadlines, not timers: sleep/wake never catches up a backlog of callbacks. */
export class SyncSchedule {
  firstPending: number | undefined;
  lastActivity = 0;
  lastStarted = -Infinity;
  retryAt = 0;
  failures = 0;
  paused = false;
  online = true;
  inFlight = false;
  changed(now: number) {
    this.firstPending ??= now;
    this.lastActivity = now;
  }
  activity(now: number) {
    this.lastActivity = now;
  }
  deadline(manual = false) {
    if (
      this.paused ||
      !this.online ||
      this.inFlight ||
      this.firstPending === undefined
    )
      return Infinity;
    return Math.max(
      this.retryAt,
      manual
        ? 0
        : Math.max(
            Math.min(
              this.lastActivity + SYNC_POLICY.quietMs,
              this.firstPending + SYNC_POLICY.maxWaitMs,
            ),
            this.lastStarted + SYNC_POLICY.throttleMs,
          ),
    );
  }
  started(now: number) {
    this.lastStarted = now;
    this.inFlight = true;
  }
  succeeded() {
    this.inFlight = false;
    this.failures = 0;
    this.retryAt = 0;
  }
  clear() {
    this.firstPending = undefined;
  }
  failed(now: number, retryAfter = 0, random = Math.random()) {
    this.inFlight = false;
    const delay =
      SYNC_POLICY.retryMs[
        Math.min(this.failures++, SYNC_POLICY.retryMs.length - 1)
      ];
    this.retryAt =
      now +
      Math.max(
        retryAfter,
        delay * (0.8 + Math.max(0, Math.min(1, random)) * 0.4),
      );
  }
}
