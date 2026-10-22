import { describe, it, expect } from '@jest/globals';

import { Meta, charForKeyCode, keyCodeFor, matchesKey } from './match';

const F = 34;
const ev = (keyCode: number, metaState = 0, repeatCount = 0) => ({ keyCode, metaState, repeatCount });
const CTRL_ALT = Meta.CTRL | Meta.ALT;

describe('matchesKey', () => {
  it('matches key and exact modifiers', () => {
    expect(matchesKey(ev(F, CTRL_ALT), { keyCode: F, metaState: CTRL_ALT })).toBe(true);
    expect(matchesKey(ev(F, CTRL_ALT | Meta.SHIFT), { keyCode: F, metaState: CTRL_ALT })).toBe(false);
    expect(matchesKey(ev(F, Meta.CTRL), { keyCode: F, metaState: CTRL_ALT })).toBe(false);
    expect(matchesKey(ev(35, CTRL_ALT), { keyCode: F, metaState: CTRL_ALT })).toBe(false);
  });

  it('ignores lock and side bits', () => {
    expect(matchesKey(ev(F, CTRL_ALT | 0x2000 | 0x40), { keyCode: F, metaState: CTRL_ALT })).toBe(true);
  });

  it('matches an unmodified key by default and any key without keyCode', () => {
    expect(matchesKey(ev(F), { keyCode: F })).toBe(true);
    expect(matchesKey(ev(F, Meta.CTRL), { keyCode: F })).toBe(false);
    expect(matchesKey(ev(F, Meta.CTRL), { metaState: Meta.CTRL })).toBe(true);
  });

  it('honours metaMask', () => {
    const rule = { keyCode: F, metaState: CTRL_ALT, metaMask: CTRL_ALT };
    expect(matchesKey(ev(F, CTRL_ALT | Meta.SHIFT), rule)).toBe(true);
  });

  it('skips auto-repeat unless asked', () => {
    expect(matchesKey(ev(F, 0, 2), { keyCode: F })).toBe(false);
    expect(matchesKey(ev(F, 0, 2), { keyCode: F }, true)).toBe(true);
  });
});

describe('keyCodeFor', () => {
  it('maps letters, either case', () => {
    expect(keyCodeFor('A')).toBe(29);
    expect(keyCodeFor('f')).toBe(34);
    expect(keyCodeFor('z')).toBe(54);
  });

  it('maps digits', () => {
    expect(keyCodeFor('0')).toBe(7);
    expect(keyCodeFor('9')).toBe(16);
  });

  it('returns undefined for anything else', () => {
    expect(keyCodeFor('')).toBeUndefined();
    expect(keyCodeFor('ab')).toBeUndefined();
    expect(keyCodeFor('-')).toBeUndefined();
    expect(keyCodeFor('é')).toBeUndefined();
  });
});

describe('charForKeyCode', () => {
  it('maps key codes to uppercase letters and digits', () => {
    expect(charForKeyCode(29)).toBe('A');
    expect(charForKeyCode(34)).toBe('F');
    expect(charForKeyCode(54)).toBe('Z');
    expect(charForKeyCode(7)).toBe('0');
    expect(charForKeyCode(16)).toBe('9');
  });

  it('returns undefined for other key codes', () => {
    expect(charForKeyCode(4)).toBeUndefined();
    expect(charForKeyCode(66)).toBeUndefined();
    expect(charForKeyCode(17)).toBeUndefined();
    expect(charForKeyCode(55)).toBeUndefined();
  });

  it('round-trips with keyCodeFor', () => {
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') expect(charForKeyCode(keyCodeFor(c)!)).toBe(c);
  });
});
