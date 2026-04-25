import type { Camera } from '../camera';

export interface StarLayerConfig { count: number; scrollFactor: number; }

export function renderNebulae(_ctx: CanvasRenderingContext2D, _camera: Camera): void {
  throw new Error('not implemented');
}

export function renderStarLayer(_ctx: CanvasRenderingContext2D, _camera: Camera, _config: StarLayerConfig): void {
  throw new Error('not implemented');
}
