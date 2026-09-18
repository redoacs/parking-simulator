import taos from './vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './vehicle/validate';
import { deriveVehicle } from './vehicle/derive';
import { getPreset, defaultParams } from './scene/presets';
import { Renderer } from './render/renderer';
import { scenePolygons, vehiclePolygons } from './render/scenePolys';
import { WebGpuUnavailableError } from './render/gpu';
import { transformPolygon } from './geom/polygon';

async function main(): Promise<void> {
  const canvas = document.getElementById('gpu') as HTMLCanvasElement;
  const fatal = document.getElementById('fatal') as HTMLDivElement;
  const vehicle = deriveVehicle(validateVehicleSpec(taos));
  const preset = getPreset('parallel')!;
  const scene = preset.build(defaultParams(preset));
  let renderer: Renderer;
  try {
    renderer = await Renderer.create(canvas);
  } catch (e) {
    fatal.hidden = false;
    fatal.textContent = e instanceof WebGpuUnavailableError ? `${e.message} Use Chrome/Edge 113+, Safari 26+, or Firefox 141+.` : String(e);
    return;
  }
  renderer.camera.fit(scene.bounds);
  const staticPolys = scenePolygons(scene);
  let first = true;
  const draw = (): void => {
    renderer.resize();
    const footprints = first ? [transformPolygon(vehicle.body, { ...scene.start, x: scene.start.x - 3 })] : [];
    first = false;
    renderer.frame({
      staticPolys,
      staticVersion: 1,
      dynamicPolys: vehiclePolygons(vehicle, scene.start, true),
      rings: [],
      newFootprints: footprints,
      envelopeBounds: scene.bounds,
      envelopeVersion: 1,
    });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

void main();
