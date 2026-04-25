export type EventMap = Record<string, unknown>;

type Listener<T> = (payload: T) => void;

export class EventBus<TEvents extends EventMap> {
  private listeners = new Map<keyof TEvents, Set<Listener<unknown>>>();

  on<TKey extends keyof TEvents>(event: TKey, listener: Listener<TEvents[TKey]>): () => void {
    const bucket = this.listeners.get(event) ?? new Set<Listener<unknown>>();
    bucket.add(listener as Listener<unknown>);
    this.listeners.set(event, bucket);
    return () => this.off(event, listener);
  }

  off<TKey extends keyof TEvents>(event: TKey, listener: Listener<TEvents[TKey]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<TKey extends keyof TEvents>(event: TKey, payload: TEvents[TKey]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}
