import type { Polygon, Rect } from '../geom/polygon';
import type { VehicleState } from '../sim/model';

export type ObstacleKind = 'wall' | 'kerb' | 'car' | 'line';

export interface Obstacle {
  polygon: Polygon;
  height: number;
  kind: ObstacleKind;
}

export interface Scene {
  bounds: Rect;
  obstacles: Obstacle[];
  /** The spot: parked = body fully inside. Convex. */
  target: Polygon;
  start: VehicleState;
}

export interface ParamDef {
  key: string;
  label: string;
  /** 'flag' is a boolean modelled as 0/1 (min 0, max 1, step 1). */
  unit: 'm' | 'deg' | 'flag';
  min: number;
  max: number;
  step: number;
  default: number;
}

export type Params = Record<string, number>;

export interface PresetDef {
  id: string;
  name: string;
  params: ParamDef[];
  build(p: Params): Scene;
}

export const isCollidable = (kind: ObstacleKind): boolean => kind !== 'line';

export const NEIGHBOUR_CAR = { length: 4.5, width: 1.85 } as const;
export const BOUNDS_PAD = 1.5;
