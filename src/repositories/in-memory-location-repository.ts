import type { Location } from '../schemas/location.js';
import type { CreateOrReplaceResult, LocationRepository } from './location-repository.js';

export class InMemoryLocationRepository implements LocationRepository {
  private readonly store: Map<string, Location>;

  constructor(initial: Iterable<Location> = []) {
    this.store = new Map();
    for (const location of initial) {
      if (this.store.has(location.id)) {
        throw new Error(`Duplicate location id during initialization: ${location.id}`);
      }
      this.store.set(location.id, clone(location));
    }
  }

  findAll(): Promise<Location[]> {
    return Promise.resolve([...this.store.values()].map(clone));
  }

  findById(id: string): Promise<Location | null> {
    const value = this.store.get(id);
    return Promise.resolve(value ? clone(value) : null);
  }

  createOrReplace(location: Location): Promise<CreateOrReplaceResult> {
    const existed = this.store.has(location.id);
    const stored = clone(location);
    this.store.set(location.id, stored);
    return Promise.resolve({
      status: existed ? 'replaced' : 'created',
      location: clone(stored),
    });
  }
}

function clone(location: Location): Location {
  return {
    ...location,
    coordinates: { ...location.coordinates },
  };
}
