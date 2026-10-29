/** Bounded presentation cache for already-persisted local reads. No collection. */
export interface LocalReadState<T> {
  data?: T;
  pending: boolean;
  error: string;
  updatedAt: number;
}
interface Entry<T> {
  state: LocalReadState<T>;
  listeners: Set<() => void>;
  request?: Promise<T>;
  generation: number;
}
export class LocalReadCache<T> {
  private entries = new Map<string, Entry<T>>();
  constructor(
    private capacity = 128,
    private now = Date.now,
  ) {}
  private entry(key: string): Entry<T> {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        state: { pending: false, error: "", updatedAt: 0 },
        listeners: new Set(),
        generation: 0,
      };
      this.entries.set(key, entry);
      this.trim(key);
    }
    return entry;
  }
  private trim(protect?: string) {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.capacity) break;
      if (key !== protect && !entry.listeners.size && !entry.request)
        this.entries.delete(key);
    }
  }
  private publish(entry: Entry<T>, state: LocalReadState<T>) {
    entry.state = state;
    for (const listener of entry.listeners) listener();
  }
  snapshot(key: string) {
    return this.entry(key).state;
  }
  subscribe(key: string, listener: () => void) {
    const entry = this.entry(key);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
      this.trim();
    };
  }
  seed(key: string, data: T, updatedAt = this.now()) {
    const entry = this.entry(key);
    // A page seed must not overwrite a newer exact lookup.
    if (entry.state.updatedAt > updatedAt) return;
    entry.generation++;
    this.publish(entry, {
      ...entry.state,
      data,
      pending: false,
      updatedAt,
      error: "",
    });
  }
  read(key: string, read: () => Promise<T>, maxAge = 60000): Promise<T> {
    const entry = this.entry(key);
    if (entry.request) return entry.request;
    if (
      entry.state.data !== undefined &&
      this.now() - entry.state.updatedAt < maxAge
    )
      return Promise.resolve(entry.state.data);
    const generation = ++entry.generation;
    this.publish(entry, { ...entry.state, pending: true, error: "" });
    const request = Promise.resolve()
      .then(read)
      .then(
        (data) => {
          if (entry.generation === generation)
            this.publish(entry, {
              data,
              pending: false,
              error: "",
              updatedAt: this.now(),
            });
          return data;
        },
        (error: unknown) => {
          if (entry.generation === generation)
            this.publish(entry, {
              ...entry.state,
              pending: false,
              error: "Local data unavailable",
            });
          throw error;
        },
      )
      .finally(() => {
        if (entry.request === request) entry.request = undefined;
        this.trim();
      });
    entry.request = request;
    return request;
  }
}
