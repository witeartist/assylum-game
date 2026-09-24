/**
 * Minimal typed event bus. Systems announce state changes here (a key was picked up, a
 * runner was caught…) and everyone interested — HUD, effects, network sync — subscribes,
 * so a feature is implemented once and never calls into unrelated systems.
 */
export class EventBus<M extends object> {
  private handlers = new Map<keyof M, Set<(payload: never) => void>>();

  on<K extends keyof M>(event: K, fn: (payload: M[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); }
    set.add(fn as (payload: never) => void);
    return () => { set!.delete(fn as (payload: never) => void); };
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) (fn as (p: M[K]) => void)(payload);
  }

  clear(): void { this.handlers.clear(); }
}
