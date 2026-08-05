import { MemoryStore } from './memory-store.js';
import type { IStore } from './types.js';

export * from './types.js';
export { MemoryStore, hashApiKey } from './memory-store.js';
export { PostgresStore } from './postgres-store.js';

let activeStore: IStore = new MemoryStore();

export function getStore(): IStore {
  return activeStore;
}

export function setStore(store: IStore): void {
  activeStore = store;
}
