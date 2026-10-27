// Keep scheduling in the main process: hiding or reloading the UI cannot stop it.
export class DesktopAlarms {
  constructor(store, announce) { this.store = store; this.announce = announce; this.seen = new Set(); }
  tick() {
    const tasks = this.store.due().filter(task => !task.notifiedAt);
    const active = new Set(tasks.map(task => `${task.id}:${task.reminderAt}`));
    for (const key of this.seen) if (!active.has(key)) this.seen.delete(key);
    for (const task of tasks) {
      const key = `${task.id}:${task.reminderAt}`;
      if (this.seen.has(key)) continue;
      // Mark only after delivery: a failed window restore can be retried next tick.
      this.announce(task);
      this.seen.add(key);
    }
  }
}
