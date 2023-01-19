import {
  ActionHash,
  AgentPubKey,
  CellId,
  DnaHash,
  EntryHash,
  HoloHash,
} from "@holochain/client";
import flatMap from "lodash-es/flatMap";
import pickBy from "lodash-es/pickBy";

export interface ReadHoloHashMap<T extends HoloHash, U> {
  get(key: T): U;
  keys(): Array<T>;
  values(): Array<U>;
  entries(): Array<[T, U]>;
  select(keys: T[]): ReadHoloHashMap<T, U>;
}

export class HoloHashMap<T extends HoloHash, U>
  implements ReadHoloHashMap<T, U>
{
  _values: Record<string, { hash: T; value: U }> = {};

  constructor(initialEntries?: Array<[T, U]>) {
    if (initialEntries) {
      for (const [cellId, value] of initialEntries) {
        this.put(cellId, value);
      }
    }
  }

  has(key: T): boolean {
    return !!this._values[this.stringify(key)];
  }

  get(key: T): U {
    return this._values[this.stringify(key)]?.value;
  }

  put(key: T, value: U) {
    this._values[this.stringify(key)] = {
      hash: key,
      value,
    };
  }

  delete(key: T) {
    const str = this.stringify(key);
    if (this._values[str]) {
      this._values[str] = undefined as any;
      delete this._values[str];
    }
  }

  keys() {
    return Object.values(this._values).map((v) => v.hash);
  }

  values(): U[] {
    return Object.values(this._values).map((v) => v.value);
  }

  entries(): Array<[T, U]> {
    return Object.entries(this._values).map(([_key, value]) => [
      value.hash,
      value.value,
    ]);
  }

  // Create a new slice of this map that contains only the given keys
  select(keys: T[]): HoloHashMap<T, U> {
    return this.pick(
      (key) => !!keys.find((k) => k.toString() === key.toString())
    );
  }

  pick(filter: (key: T) => boolean): HoloHashMap<T, U> {
    const values = pickBy(this._values, (s) => filter(s.hash));

    return new HoloHashMap(
      Object.values(values).map(({ hash, value }) => [hash, value])
    );
  }

  pickBy(filter: (value: U, key: T) => boolean): HoloHashMap<T, U> {
    const values = pickBy(this._values, (s) => filter(s.value, s.hash));

    return new HoloHashMap(
      Object.values(values).map(({ hash, value }) => [hash, value])
    );
  }

  map<R>(mapFn: (value: U, key: T) => R): HoloHashMap<T, R> {
    const mappedMap = new HoloHashMap<T, R>();

    for (const [key, value] of this.entries()) {
      mappedMap.put(key, mapFn(value, key));
    }
    return mappedMap;
  }

  private stringify(hash: Uint8Array): string {
    // We remove the first two bytes to be able to compare the hashes
    // of different types (Entry and Agents) and be them return the same
    return hash.toString();
  }
}

export class EntryHashMap<T> extends HoloHashMap<EntryHash, T> {}
export class ActionHashMap<T> extends HoloHashMap<ActionHash, T> {}
export class AgentPubKeyMap<T> extends HoloHashMap<AgentPubKey, T> {}
export class DnaHashMap<T> extends HoloHashMap<DnaHash, T> {}

export class CellMap<T> {
  // Segmented by DnaHash / AgentPubKey
  #cellMap: HoloHashMap<DnaHash, HoloHashMap<AgentPubKey, T>> =
    new HoloHashMap();

  constructor(initialEntries?: Array<[CellId, T]>) {
    if (initialEntries) {
      for (const [cellId, value] of initialEntries) {
        this.put(cellId, value);
      }
    }
  }

  get([dnaHash, agentPubKey]: CellId): T | undefined {
    return this.#cellMap.get(dnaHash)
      ? this.#cellMap.get(dnaHash).get(agentPubKey)
      : undefined;
  }

  has(cellId: CellId): boolean {
    return !!this.get(cellId);
  }

  valuesForDna(dnaHash: DnaHash): Array<T> {
    const dnaMap = this.#cellMap.get(dnaHash);
    return dnaMap ? dnaMap.values() : [];
  }

  agentsForDna(dnaHash: DnaHash): Array<AgentPubKey> {
    const dnaMap = this.#cellMap.get(dnaHash);
    return dnaMap ? dnaMap.keys() : [];
  }

  put([dnaHash, agentPubKey]: CellId, value: T) {
    if (!this.#cellMap.get(dnaHash))
      this.#cellMap.put(dnaHash, new HoloHashMap());
    this.#cellMap.get(dnaHash).put(agentPubKey, value);
  }

  delete([dnaHash, agentPubKey]: CellId) {
    if (this.#cellMap.get(dnaHash)) {
      this.#cellMap.get(dnaHash).delete(agentPubKey);

      if (this.#cellMap.get(dnaHash).keys().length === 0) {
        this.#cellMap.delete(dnaHash);
      }
    }
  }

  entries(): Array<[CellId, T]> {
    return this.cellIds().map(
      (cellId) => [cellId, this.get(cellId)] as [CellId, T]
    );
  }

  filter(fn: (value: T) => boolean): CellMap<T> {
    const entries = this.entries();

    const mappedValues = entries.filter(([id, v]) => fn(v));

    return new CellMap(mappedValues);
  }

  map<R>(fn: (value: T) => R): CellMap<R> {
    const entries = this.entries();

    const mappedValues = entries.map(([id, v]) => [id, fn(v)] as [CellId, R]);

    return new CellMap(mappedValues);
  }

  values(): Array<T> {
    return this.cellIds().map((cellId) => this.get(cellId) as T);
  }

  cellIds(): Array<CellId> {
    const dnaHashes = this.#cellMap.keys();

    return flatMap(dnaHashes, (dnaHash) =>
      this.#cellMap
        .get(dnaHash)
        .keys()
        .map((agentPubKey) => [dnaHash, agentPubKey] as CellId)
    );
  }
}

export class LazyHoloHashMap<T extends HoloHash, U>
  implements ReadHoloHashMap<T, U>
{
  holoHashMap = new HoloHashMap<T, U>();
  constructor(protected newValue: (hash: T) => U) {}

  get(hash: T): U {
    if (!this.holoHashMap.has(hash)) {
      this.holoHashMap.put(hash, this.newValue(hash));
    }
    return this.holoHashMap.get(hash);
  }

  keys() {
    return this.holoHashMap.keys();
  }

  values() {
    return this.holoHashMap.values();
  }

  entries() {
    return this.holoHashMap.entries();
  }

  select(keys: T[]): ReadHoloHashMap<T, U> {
    const newMap = new HoloHashMap<T, U>();

    for (const key of keys) {
      newMap.put(key, this.get(key));
    }
    return newMap;
  }
}
