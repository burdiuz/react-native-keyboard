/**
 * @actualwave/react-native-keyboard: hardware keyboard presence and raw key events for Android.
 * Android only; on other platforms every call resolves to "no keyboard" and no events fire.
 */
import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export interface KeyboardDevice {
  id: number;
  name: string;
  vendorId: number;
  productId: number;
  descriptor: string;
  /** Software-created device (every touchscreen device gets one). */
  virtual: boolean;
  /** Reports an alphabetic (full) keyboard layout; TV remotes do not. */
  alphabetic: boolean;
  /** `!virtual && alphabetic`: the rule behind `isKeyboardConnected()`. */
  keyboard: boolean;
}

export interface KeyboardChange {
  present: boolean;
  keyboards: KeyboardDevice[];
}

export interface KeyEvent {
  /** Android `KeyEvent.KEYCODE_*`. */
  keyCode: number;
  /** Android `KeyEvent.META_*` bit mask; see `Meta`. */
  metaState: number;
  /** 0 for the first press, > 0 for auto-repeat of a held key. */
  repeatCount: number;
  deviceId: number;
  /** `SystemClock.uptimeMillis()` of the event. */
  eventTime: number;
  /** A `consumeKeys` rule swallowed it: the app never saw it. */
  consumed: boolean;
}

export { Meta, matchesKey, keyCodeFor, charForKeyCode } from './match';
import { MODIFIERS } from './match';
import type { KeyMatch } from './match';
export type { KeyMatch };

interface KeyboardNative {
  KEYCODE?: Record<string, number>;
  isKeyboardConnected(): Promise<boolean>;
  getKeyboards(): Promise<KeyboardDevice[]>;
  getInputDevices(): Promise<KeyboardDevice[]>;
  setKeyEventsEnabled(enabled: boolean): void;
  setConsumedKeys(rules: { keyCode: number; metaMask: number; metaState: number }[]): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const native: KeyboardNative | undefined =
  Platform.OS === 'android' ? NativeModules.ActualwaveKeyboard : undefined;

/** True when the native module is linked (Android build that includes this package). */
export const isAvailable = native != null;

/**
 * Android `KeyEvent.KEYCODE_*` values by name without the prefix: `KeyCode.ENTER` is 66, `KeyCode.DPAD_UP` 19.
 * Read from the device's own `KeyEvent` class, so it always matches its API level. Empty when the module is
 * not linked, so names are looked up at runtime (`KeyCode.ENTER` is `number | undefined` under strict indexing).
 */
export const KeyCode: Readonly<Record<string, number>> = native?.KEYCODE ?? {};

const keyNames = new Map<number, string>(Object.entries(KeyCode).map(([name, code]) => [code, name]));

/** Name of a key code without the prefix (`66` -> `'ENTER'`), or `undefined` if unknown. */
export function keyNameOf(keyCode: number): string | undefined {
  return keyNames.get(keyCode);
}

const emitter = native ? new NativeEventEmitter(native) : undefined;

/** Whether a physical alphabetic keyboard is attached now. */
export async function isKeyboardConnected(): Promise<boolean> {
  return native ? native.isKeyboardConnected() : false;
}

/** Attached physical keyboards (the `keyboard` rule). */
export async function getKeyboards(): Promise<KeyboardDevice[]> {
  return native ? native.getKeyboards() : [];
}

/** Every input device with the keyboard source plus flags, for apps that apply their own rule. */
export async function getInputDevices(): Promise<KeyboardDevice[]> {
  return native ? native.getInputDevices() : [];
}

/**
 * Called when a keyboard is attached or the last one is removed (not on every device change).
 * Returns the unsubscribe function.
 */
export function addKeyboardListener(listener: (change: KeyboardChange) => void): () => void {
  const sub = emitter?.addListener('keyboardChanged', listener);
  return () => sub?.remove();
}

let keyListeners = 0;

function subscribeKey(event: 'keyDown' | 'keyUp', listener: (e: KeyEvent) => void): () => void {
  if (!native || !emitter) return () => {};
  const sub = emitter.addListener(event, listener);
  if (++keyListeners === 1) native.setKeyEventsEnabled(true);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    sub.remove();
    if (--keyListeners === 0) native.setKeyEventsEnabled(false);
  };
}

/** Every key press reaching the activity (any device, auto-repeat included). Returns the unsubscribe function. */
export function addKeyDownListener(listener: (e: KeyEvent) => void): () => void {
  return subscribeKey('keyDown', listener);
}

export function addKeyUpListener(listener: (e: KeyEvent) => void): () => void {
  return subscribeKey('keyUp', listener);
}

/** Live "a physical keyboard is attached". `false` until the first answer arrives. */
export function useKeyboardConnected(): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    let live = true;
    const off = addKeyboardListener((c) => live && setPresent(c.present));
    isKeyboardConnected().then((p) => live && setPresent(p));
    return () => {
      live = false;
      off();
    };
  }, []);
  return present;
}

/** Subscribes `handler` to key presses while mounted; the latest handler is always used. */
export function useKeyDown(handler: (e: KeyEvent) => void, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return addKeyDownListener((e) => ref.current(e));
  }, [enabled]);
}

export type ConsumeRule = KeyMatch;

const consumers = new Set<ConsumeRule[]>();

function syncConsumers() {
  native?.setConsumedKeys(
    [...consumers].flat().map((r) => ({
      keyCode: r.keyCode ?? -1,
      metaMask: r.metaMask ?? MODIFIERS,
      metaState: r.metaState ?? 0,
    }))
  );
}

/**
 * Keeps matching keys from reaching the app (the `stopPropagation` of this library). Decided natively, per
 * event, before the app sees it, so it cannot depend on a JS handler. Key down, repeats and key up all match.
 * Matching events are still delivered to key listeners with `consumed: true`. Rules from every call are
 * merged; the returned function removes this call's rules.
 *
 * Note: only keys that pass through the activity are covered; the system handles some (Home, power) earlier.
 */
export function consumeKeys(rules: ConsumeRule[]): () => void {
  const entry = [...rules];
  consumers.add(entry);
  syncConsumers();
  return () => {
    if (consumers.delete(entry)) syncConsumers();
  };
}

/** `consumeKeys` while mounted and `enabled`. Pass a stable `rules` array (or memoize it). */
export function useConsumeKeys(rules: ConsumeRule[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    return consumeKeys(rules);
  }, [rules, enabled]);
}
