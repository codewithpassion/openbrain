import { describe, expect, test } from "bun:test";
import { createLocalActiveScopeStore } from "../../src/lib/active-scope";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

describe("active-scope store", () => {
  test("read returns null when nothing pinned", () => {
    const store = createLocalActiveScopeStore(new MemoryStorage());
    expect(store.read()).toBeNull();
  });

  test("write then read round-trips", () => {
    const store = createLocalActiveScopeStore(new MemoryStorage());
    store.write("work");
    expect(store.read()).toBe("work");
  });

  test("write(null) clears", () => {
    const store = createLocalActiveScopeStore(new MemoryStorage());
    store.write("work");
    store.write(null);
    expect(store.read()).toBeNull();
  });

  test("subscribe fires on write", () => {
    const store = createLocalActiveScopeStore(new MemoryStorage());
    let fired = 0;
    const unsub = store.subscribe(() => {
      fired += 1;
    });
    store.write("a");
    store.write("b");
    store.write(null);
    expect(fired).toBe(3);
    unsub();
    store.write("c");
    expect(fired).toBe(3);
  });

  test("absent storage (SSR) is a safe no-op", () => {
    const store = createLocalActiveScopeStore(undefined);
    expect(store.read()).toBeNull();
    store.write("work");
    expect(store.read()).toBeNull();
  });
});
