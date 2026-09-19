import { describe, expect, it } from 'vitest';
import { StateHistory } from './history';
import type { VehicleState } from './model';

const st = (x: number): VehicleState => ({ x, y: 0, theta: 0, steer: 0, speed: 0 });

describe('StateHistory', () => {
  it('pushes, reads back, pops', () => {
    const h = new StateHistory(4);
    h.push(st(1));
    h.push(st(2));
    expect(h.length).toBe(2);
    expect(h.last()?.x).toBe(2);
    expect(h.at(0).x).toBe(1);
    expect(h.pop()?.x).toBe(2);
    expect(h.length).toBe(1);
  });

  it('drops the oldest when full', () => {
    const h = new StateHistory(3);
    for (let i = 1; i <= 5; i++) h.push(st(i));
    expect(h.length).toBe(3);
    expect(h.at(0).x).toBe(3);
    expect(h.last()?.x).toBe(5);
  });

  it('clear empties it', () => {
    const h = new StateHistory(3);
    h.push(st(1));
    h.clear();
    expect(h.length).toBe(0);
    expect(h.last()).toBeUndefined();
    expect(h.pop()).toBeUndefined();
  });

  it('forEach iterates oldest to newest', () => {
    const h = new StateHistory(2);
    h.push(st(1));
    h.push(st(2));
    h.push(st(3));
    const xs: number[] = [];
    h.forEach((s) => xs.push(s.x));
    expect(xs).toEqual([2, 3]);
  });

  it('counts evictions so evicted + length is an absolute position', () => {
    const h = new StateHistory(3);
    for (let i = 1; i <= 5; i++) h.push(st(i));
    expect(h.evicted).toBe(2);
    h.pop();
    expect(h.evicted + h.length).toBe(4);
    h.clear();
    expect(h.evicted).toBe(0);
  });
});
