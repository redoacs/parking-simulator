import { describe, expect, it } from 'vitest';
import { DriveInput, keyFromEvent } from './input';
import type { SimParams, VehicleState } from '../sim/model';

const p: SimParams = { wheelbase: 2.689, maxSteer: 0.6, steerRate: 1, maxSpeed: 2 };
const s: VehicleState = { x: 0, y: 0, theta: 0, steer: 0.25, speed: 0 };

describe('DriveInput.control', () => {
  it('holds the current steer with no steer key', () => {
    const i = new DriveInput();
    expect(i.control(s, p)).toEqual({ steer: 0.25, speed: 0 });
  });
  it('left steers to +maxSteer, right to -maxSteer, both cancel to hold', () => {
    const i = new DriveInput();
    i.setKey('left', true);
    expect(i.control(s, p).steer).toBe(0.6);
    i.setKey('right', true);
    expect(i.control(s, p).steer).toBe(0.25);
    i.setKey('left', false);
    expect(i.control(s, p).steer).toBe(-0.6);
  });
  it('centre targets zero and wins over left/right', () => {
    const i = new DriveInput();
    i.setKey('left', true);
    i.setKey('centre', true);
    expect(i.control(s, p).steer).toBe(0);
  });
  it('forward/reverse set speed; stop or both cancel to zero', () => {
    const i = new DriveInput();
    i.setKey('forward', true);
    expect(i.control(s, p).speed).toBe(2);
    i.setKey('reverse', true);
    expect(i.control(s, p).speed).toBe(0);
    i.setKey('forward', false);
    expect(i.control(s, p).speed).toBe(-2);
    i.setKey('stop', true);
    expect(i.control(s, p).speed).toBe(0);
  });
  it('reset and fit are one-shot', () => {
    const i = new DriveInput();
    i.setKey('reset', true);
    expect(i.takeReset()).toBe(true);
    expect(i.takeReset()).toBe(false);
    i.setKey('fit', true);
    expect(i.takeFit()).toBe(true);
    expect(i.takeFit()).toBe(false);
  });
  it('maps key codes', () => {
    const i = new DriveInput();
    i.handleKey('ArrowUp', true);
    i.handleKey('KeyA', true);
    expect(i.control(s, p)).toEqual({ steer: 0.6, speed: 2 });
    i.handleKey('KeyZ', true);
    expect(i.rewindHeld).toBe(true);
    expect(i.handleKey('KeyQ', true)).toBe(false); // unmapped → not handled
  });
  it('ignores modified combos so browser shortcuts still work', () => {
    expect(keyFromEvent({ code: 'KeyR' })).toBe('reset');
    expect(keyFromEvent({ code: 'KeyR', ctrlKey: true })).toBeUndefined();
    expect(keyFromEvent({ code: 'KeyS', metaKey: true })).toBeUndefined();
    expect(keyFromEvent({ code: 'ArrowLeft', altKey: true })).toBeUndefined();
    expect(keyFromEvent({ code: 'KeyQ' })).toBeUndefined();
  });
});
