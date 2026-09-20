import { describe, expect, it } from 'vitest';
import { dubins } from './dubins';
import { SIM_DT, stepVehicle } from '../sim/model';

const params = { wheelbase: 2.7, maxSteer: 0.6, steerRate: 0.8, maxSpeed: 2 };
const radius = params.wheelbase / Math.tan(params.maxSteer);
describe('same-gear connections', () => {
  for (const gear of [1, -1] as const)
    it(`closes every generated word through the rate-limited simulator, gear ${gear}`, () => {
      for (const x of [-8, 0, 5])
        for (const y of [-6, 0, 7])
          for (const theta of [-Math.PI, -0.7, 0, Math.PI / 2]) {
            const from = { x: 1.1, y: -1.2, theta: 0.3, steer: 0, speed: 0 },
              to = { x, y, theta };
            const words = dubins(from, to, radius, params.maxSteer, gear);
            expect(words.length).toBeGreaterThan(0);
            for (const legs of words) {
              let s = from;
              for (const leg of legs) {
                const settle = Math.ceil(Math.abs(leg.steer - s.steer) / params.steerRate / SIM_DT);
                for (let i = 0; i < settle; i++) s = stepVehicle(s, { steer: leg.steer, speed: 0 }, params, SIM_DT);
                let remain = Math.abs(leg.distance);
                while (remain > 1e-10) {
                  const d = Math.min(remain, SIM_DT);
                  s = stepVehicle(s, { steer: leg.steer, speed: (gear * d) / SIM_DT }, params, SIM_DT);
                  remain -= d;
                }
              }
              expect(Math.hypot(s.x - x, s.y - y)).toBeLessThan(1e-8);
              expect(Math.abs(Math.atan2(Math.sin(s.theta - theta), Math.cos(s.theta - theta)))).toBeLessThan(1e-8);
            }
          }
    });
  it('includes a straight connection without a loop for aligned poses', () => {
    const paths = dubins({ x: 0, y: 0, theta: 0 }, { x: 5, y: 0, theta: 0 }, radius, params.maxSteer, 1);
    expect(paths.some((p) => p.length === 1 && p[0]!.steer === 0 && Math.abs(p[0]!.distance - 5) < 1e-10)).toBe(true);
  });
});
