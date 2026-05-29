import type { Location } from '../schemas/location.js';

export type CreateOrReplaceResult =
  | { status: 'created'; location: Location }
  | { status: 'replaced'; location: Location };

export interface LocationRepository {
  findAll(): Promise<Location[]>;
  findById(id: string): Promise<Location | null>;
  createOrReplace(location: Location): Promise<CreateOrReplaceResult>;
}
