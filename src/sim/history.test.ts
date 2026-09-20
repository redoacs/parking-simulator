import { describe, expect, it } from 'vitest';
import { StateHistory } from './history';
import type { VehicleState } from './model';

const st = (x: number): VehicleState => ({ x, y: 0, theta: 0, steer: 0, speed: 0 });

describe('StateHistory', () => {
  it('pushes, reads back, pops', () => {
    const h = new StateHistory(4);
    h.push(st(1), 1 * 2);
    h.push(st(2), 2 * 2);
    expect(h.length).toBe(2);
    expect(h.last()?.state.x).toBe(2);
    expect(h.last()?.time).toBe(4);
    expect(h.at(0).state.x).toBe(1);
    expect(h.pop()?.state.x).toBe(2);
    expect(h.length).toBe(1);
  });

  it('drops the oldest when full', () => {
    const h = new StateHistory(3);
    for (let i = 1; i <= 5; i++) h.push(st(i), i * 2);
    expect(h.length).toBe(3);
    expect(h.at(0).state.x).toBe(3);
    expect(h.last()?.state.x).toBe(5);
    expect(h.at(0).time).toBe(6);
    expect(h.last()?.time).toBe(10);
  });

  it('clear empties it', () => {
    const h = new StateHistory(3);
    h.push(st(1), 1 * 2);
    h.clear();
    expect(h.length).toBe(0);
    expect(h.last()).toBeUndefined();
    expect(h.pop()).toBeUndefined();
  });

  it('forEach iterates oldest to newest', () => {
    const h = new StateHistory(2);
    h.push(st(1), 1 * 2);
    h.push(st(2), 2 * 2);
    h.push(st(3), 3 * 2);
    const xs: number[] = [];
    h.forEach(({ state }) => xs.push(state.x));
    expect(xs).toEqual([2, 3]);
  });

  it('counts evictions so evicted + length is an absolute position', () => {
    const h = new StateHistory(3);
    for (let i = 1; i <= 5; i++) h.push(st(i), i * 2);
    expect(h.evicted).toBe(2);
    h.pop();
    expect(h.evicted + h.length).toBe(4);
    h.clear();
    expect(h.evicted).toBe(0);
  });
});
