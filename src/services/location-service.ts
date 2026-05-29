import { ApiError } from '../errors/api-error.js';
import { DatabaseUnavailableError } from '../errors/database-error.js';
import type { Location } from '../schemas/location.js';
import type {
  CreateOrReplaceResult,
  LocationRepository,
} from '../repositories/location-repository.js';
import type { SpatialIndex, SpatialSearchHit } from '../spatial/spatial-index.js';
import type { Coordinates } from '../schemas/coordinates.js';
import type { ReadinessState } from '../state/readiness.js';
import { PerIdMutex } from '../utils/per-id-mutex.js';

export class LocationService {
  private readonly mutex: PerIdMutex;

  constructor(
    private readonly repo: LocationRepository,
    private readonly index: SpatialIndex,
    private readonly readiness: ReadinessState,
    mutex?: PerIdMutex,
  ) {
    this.mutex = mutex ?? new PerIdMutex();
  }

  search(point: Coordinates): SpatialSearchHit[] {
    this.ensureReady();
    return this.index.search(point);
  }

  async findById(id: string): Promise<Location | null> {
    this.ensureReady();
    try {
      return await this.repo.findById(id);
    } catch (err) {
      this.handleDbError(err);
      throw err;
    }
  }

  async createOrReplace(location: Location): Promise<CreateOrReplaceResult> {
    this.ensureReady();
    return this.mutex.run(location.id, async () => {
      this.ensureReady();
      let result: CreateOrReplaceResult;
      try {
        result = await this.repo.createOrReplace(location);
      } catch (err) {
        this.handleDbError(err);
        throw err;
      }
      try {
        this.index.upsert(location);
      } catch (indexError) {
        await this.recoverIndex(indexError);
        throw indexError;
      }
      return result;
    });
  }

  private ensureReady(): void {
    if (!this.readiness.isReady()) {
      throw ApiError.serviceUnavailable();
    }
  }

  private handleDbError(err: unknown): void {
    if (err instanceof DatabaseUnavailableError) {
      this.readiness.set('not_ready');
    }
  }

  private async recoverIndex(indexError: unknown): Promise<void> {
    try {
      const all = await this.repo.findAll();
      this.index.rebuild(all);
    } catch {
      this.readiness.set('not_ready');
      throw indexError;
    }
  }
}
