import RBush from 'rbush';
import type { Coordinates } from '../schemas/coordinates.js';
import type { Location } from '../schemas/location.js';

type IndexedEntry = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  name: string;
  x: number;
  y: number;
  radiusSquared: number;
};

export type SpatialSearchHit = {
  id: string;
  name: string;
  coordinates: Coordinates;
  distanceSquared: number;
};

export class SpatialIndex {
  private readonly tree: RBush<IndexedEntry>;
  private readonly entriesById: Map<string, IndexedEntry>;

  constructor(locations: Iterable<Location> = []) {
    this.tree = new RBush<IndexedEntry>();
    this.entriesById = new Map();
    this.loadInitial(locations);
  }

  search(point: Coordinates): SpatialSearchHit[] {
    const candidates = this.tree.search({
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    });

    const hits: SpatialSearchHit[] = [];
    for (const entry of candidates) {
      const dx = entry.x - point.x;
      const dy = entry.y - point.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= entry.radiusSquared) {
        hits.push({
          id: entry.id,
          name: entry.name,
          coordinates: { x: entry.x, y: entry.y },
          distanceSquared,
        });
      }
    }

    hits.sort((a, b) => {
      if (a.distanceSquared !== b.distanceSquared) {
        return a.distanceSquared - b.distanceSquared;
      }
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    return hits;
  }

  upsert(location: Location): void {
    const existing = this.entriesById.get(location.id);
    if (existing) {
      this.tree.remove(existing);
    }
    const entry = toEntry(location);
    this.tree.insert(entry);
    this.entriesById.set(location.id, entry);
  }

  rebuild(locations: Iterable<Location>): void {
    this.tree.clear();
    this.entriesById.clear();
    this.loadInitial(locations);
  }

  size(): number {
    return this.entriesById.size;
  }

  private loadInitial(locations: Iterable<Location>): void {
    const entries: IndexedEntry[] = [];
    for (const location of locations) {
      const entry = toEntry(location);
      entries.push(entry);
      this.entriesById.set(location.id, entry);
    }
    if (entries.length > 0) {
      this.tree.load(entries);
    }
  }
}

function toEntry(location: Location): IndexedEntry {
  const { x, y } = location.coordinates;
  const r = location.radius;
  return {
    id: location.id,
    name: location.name,
    x,
    y,
    radiusSquared: r * r,
    minX: x - r,
    minY: y - r,
    maxX: x + r,
    maxY: y + r,
  };
}
