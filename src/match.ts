import type { KeyEvent } from './index';

/** `metaState` bits. */
export const Meta = {
  SHIFT: 0x1,
  ALT: 0x2,
  CTRL: 0x1000,
  META: 0x10000,
} as const;

/** Modifier bits compared by default; lock and left/right bits are ignored. */
export const MODIFIERS = Meta.SHIFT | Meta.ALT | Meta.CTRL | Meta.META;

export interface KeyMatch {
  /** Android `KEYCODE_*`; omit for any key. */
  keyCode?: number;
  /** Required modifier bits (see `Meta`); default none, so only the unmodified key matches. */
  metaState?: number;
  /** Which bits of `metaState` to compare; default shift|alt|ctrl|meta. */
  metaMask?: number;
}

/**
 * Whether a key event matches `match`, with the same semantics as `consumeKeys` rules.
 * Auto-repeat events (`repeatCount > 0`) never match unless `repeat` is true.
 */
export function matchesKey(event: Pick<KeyEvent, 'keyCode' | 'metaState' | 'repeatCount'>, match: KeyMatch, repeat = false): boolean {
  if (!repeat && event.repeatCount > 0) return false;
  if (match.keyCode != null && match.keyCode !== event.keyCode) return false;
  const mask = match.metaMask ?? MODIFIERS;
  return (event.metaState & mask) === ((match.metaState ?? 0) & mask);
}

/**
 * Android key code of a letter (A-Z, either case) or digit (0-9), or `undefined` for anything else.
 * Digits are the main-row keys (`KEYCODE_0`..`9`), not the numpad.
 */
export function keyCodeFor(char: string): number | undefined {
  if (char.length !== 1) return undefined;
  const c = char.toUpperCase().charCodeAt(0);
  if (c >= 65 && c <= 90) return 29 + (c - 65); // KEYCODE_A..Z
  if (c >= 48 && c <= 57) return 7 + (c - 48); // KEYCODE_0..9
  return undefined;
}

/** Inverse of `keyCodeFor`: `'A'`..`'Z'` or `'0'`..`'9'` (uppercase), or `undefined` for any other key code. */
export function charForKeyCode(keyCode: number): string | undefined {
  if (keyCode >= 29 && keyCode <= 54) return String.fromCharCode(65 + (keyCode - 29));
  if (keyCode >= 7 && keyCode <= 16) return String.fromCharCode(48 + (keyCode - 7));
  return undefined;
}
