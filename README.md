# @actualwave/react-native-keyboard

Hardware keyboard support for React Native on **Android** (phones, tablets, Chromebooks, Android TV).

- **Presence:** is a physical keyboard attached right now, live, from the first render.
- **Devices:** which keyboard-capable input devices exist, with the flags to apply your own rule.
- **Key events:** every key press and release with Android `keyCode`, `metaState` and `repeatCount`.
- **Consuming keys:** keep chosen shortcuts from reaching the app and its views (a `stopPropagation` for keys), so each shortcut is handled in one place.
- **Helpers:** `matchesKey()`, `keyCodeFor()`, `charForKeyCode()`, `KeyCode`, `Meta`.

> **Android only.** Nothing here works on iOS or web. On other platforms every function is a safe no-op: presence reads `false`, device lists are empty, no events fire and `isAvailable` is `false`. The package is a plain React Native native module with no Expo dependency, no `MainActivity` changes and no manifest entries.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Keyboard presence](#keyboard-presence)
- [Input devices](#input-devices)
- [Key events](#key-events)
- [Matching keys](#matching-keys)
- [Consuming keys](#consuming-keys)
- [Key codes](#key-codes)
- [Recipes](#recipes)
- [API reference](#api-reference)
- [How it works](#how-it-works)
- [Limitations](#limitations)

## Install

```sh
npm install @actualwave/react-native-keyboard
```

Autolinking picks the module up; rebuild the native app afterwards (`npx react-native run-android`). The package is a classic
native module (the legacy native-module API), which React Native's New Architecture runs through its interop layer. Expo projects
need a development build or `expo prebuild`, as for any native module; there is no config plugin to add.

Requirements: React Native with autolinking; the library's default `minSdkVersion` is 24.

## Quick start

```tsx
import { useKeyboardConnected, useKeyDown, useConsumeKeys, matchesKey, keyCodeFor, Meta } from '@actualwave/react-native-keyboard';

const SAVE = { keyCode: keyCodeFor('s'), metaState: Meta.CTRL };   // Ctrl+S
const RULES = [SAVE];                                               // keep the reference stable

export function Editor() {
  const hasKeyboard = useKeyboardConnected();   // live; false until the first answer

  useConsumeKeys(RULES);                        // the editor and the rest of the app never see Ctrl+S
  useKeyDown((e) => {
    if (matchesKey(e, SAVE)) save();            // handled once, here
  });

  return <Text>{hasKeyboard ? 'Ctrl+S saves' : 'Tap Save'}</Text>;
}
```

## Keyboard presence

A device counts as a **keyboard** when it is not virtual and reports an alphabetic layout:

- Touchscreens report the keyboard source, and Android adds a virtual alphabetic device to every system. Neither counts.
- TV remotes report a non-alphabetic layout and do not count.
- An RF air-mouse remote that exposes a real keyboard interface does count, because it has one.

Tracking starts when the module loads and runs for the app's whole lifetime, so the first answer is correct even if no key has
been pressed yet. It does not depend on the activity being resumed.

```ts
import { isKeyboardConnected, addKeyboardListener, useKeyboardConnected } from '@actualwave/react-native-keyboard';

// one-shot
const connected: boolean = await isKeyboardConnected();

// subscription (fires when presence flips, not on every device change)
const off = addKeyboardListener(({ present, keyboards }) => {
  console.log(present ? `keyboard: ${keyboards.map((k) => k.name).join(', ')}` : 'keyboard removed');
});
off(); // unsubscribe

// hook: false until the first native answer (one bridge round trip), then live
const hasKeyboard = useKeyboardConnected();
```

Plugging a second keyboard in while one is attached, or unplugging one of two, does not fire `addKeyboardListener`: `present`
did not change. Use `getKeyboards()` if you need the current list.

## Input devices

```ts
import { getKeyboards, getInputDevices } from '@actualwave/react-native-keyboard';

const keyboards = await getKeyboards();      // devices matching the rule above
const everything = await getInputDevices();  // every device that has the keyboard source, with flags
```

Both return `KeyboardDevice[]`:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `number` | Android input device id (changes across reconnects) |
| `name` | `string` | Device name |
| `vendorId`, `productId` | `number` | USB / Bluetooth ids |
| `descriptor` | `string` | Stable device descriptor |
| `virtual` | `boolean` | Created by the system, not hardware |
| `alphabetic` | `boolean` | Reports a full alphabetic layout |
| `keyboard` | `boolean` | `!virtual && alphabetic`: what `isKeyboardConnected()` uses |

If the default rule is wrong for your hardware (a numpad-only or media keyboard reports non-alphabetic), apply your own on
`getInputDevices()`:

```ts
const devices = await getInputDevices();
const hasAnyExternalKeys = devices.some((d) => !d.virtual);
```

## Key events

Subscribe to key presses and releases. The events come from the activity's window, so they cover every connected device,
including a TV remote's D-pad and media keys, and they include auto-repeat of a held key.

```ts
import { addKeyDownListener, addKeyUpListener, useKeyDown, Meta, KeyCode } from '@actualwave/react-native-keyboard';

const off = addKeyDownListener((e) => {
  if (e.repeatCount > 0) return;                              // 0 on the first press, > 0 while held
  if (e.keyCode === KeyCode.ENTER && e.metaState & Meta.CTRL) run();
});
off();

// hook: subscribes while mounted, always calls the latest handler, no resubscribe when the handler changes
useKeyDown((e) => { /* … */ });
useKeyDown((e) => { /* … */ }, isFocused);                    // second argument: enabled
```

`KeyEvent`:

| Field | Type | Meaning |
| --- | --- | --- |
| `keyCode` | `number` | Android `KeyEvent.KEYCODE_*` (see [Key codes](#key-codes)) |
| `metaState` | `number` | Modifier bit mask, test with `Meta` |
| `repeatCount` | `number` | `0` first press, `> 0` auto-repeat |
| `deviceId` | `number` | Source input device, matches `KeyboardDevice.id` |
| `eventTime` | `number` | `SystemClock.uptimeMillis()` of the event |
| `consumed` | `boolean` | A [consume rule](#consuming-keys) swallowed it |

`Meta` constants: `SHIFT` `0x1`, `ALT` `0x2`, `CTRL` `0x1000`, `META` `0x10000` (Windows/Command key). `metaState` also carries
lock and left/right bits; mask what you test.

Native code emits events only while at least one key listener is subscribed; with none, a key press costs nothing extra.

## Matching keys

`matchesKey(event, match, repeat?)` answers "is this event that shortcut?" with one call:

```ts
import { matchesKey, keyCodeFor, Meta } from '@actualwave/react-native-keyboard';

const FORMAT = { keyCode: keyCodeFor('f'), metaState: Meta.CTRL | Meta.ALT };   // Ctrl+Alt+F

addKeyDownListener((e) => {
  if (matchesKey(e, FORMAT)) format();
});
```

`KeyMatch` (the second argument, also the shape of consume rules):

| Field | Default | Meaning |
| --- | --- | --- |
| `keyCode` | any key | Android key code |
| `metaState` | `0` | Modifier bits that must be held |
| `metaMask` | Shift, Alt, Ctrl, Meta | Which bits of `metaState` are compared |

- With the defaults the match is **exact**: `Ctrl+Alt+F` does not match `Ctrl+Alt+Shift+F`.
- Lock bits (Caps/Num Lock) and left/right bits are ignored, because they are outside the default mask.
- To ignore Shift, narrow the mask: `{ keyCode, metaState: Meta.CTRL, metaMask: Meta.CTRL | Meta.ALT }`.
- Auto-repeat events (`repeatCount > 0`) never match, so a held shortcut fires once. Pass `true` as the third argument to include them.

## Consuming keys

JavaScript cannot veto a key event it receives: events cross the bridge asynchronously, after the app already handled them. So
consumption is **declarative**. You register rules, and native code decides per event, before the app, its views and any WebView
see the key.

```ts
import { consumeKeys, useConsumeKeys, keyCodeFor, KeyCode, Meta } from '@actualwave/react-native-keyboard';

const stop = consumeKeys([
  { keyCode: keyCodeFor('s'), metaState: Meta.CTRL },     // Ctrl+S
  { keyCode: KeyCode.F6 },                                // F6, unmodified
]);
stop();                                                    // remove this call's rules

// hook: consumes while mounted and enabled; pass a stable (module-level or memoized) rules array
useConsumeKeys(RULES, isEditorFocused);
```

- Rules use the same [`KeyMatch`](#matching-keys) fields. Omit `keyCode` to match every key (use with a `metaState`).
- Down, auto-repeat and up events of a matching key are all swallowed.
- Rules from every `consumeKeys` call are merged; each returned function removes only its own rules.
- A consumed key is still delivered to key listeners, with `consumed: true`. One handler can therefore react without the app also reacting: **intercept and handle in one place**.
- Consuming a key removes its native behaviour everywhere: consuming Ctrl+A stops select-all in every `TextInput`, WebView and editor, so handle it yourself (or enable the rule only while your view is focused).
- Do not consume bare printable keys unless you mean to block typing.

## Key codes

Android key codes are not exposed by React Native. This package provides them:

```ts
import { KeyCode, keyNameOf, keyCodeFor, charForKeyCode } from '@actualwave/react-native-keyboard';

KeyCode.ENTER;          // 66
KeyCode.DPAD_UP;        // 19
KeyCode.F6;             // 135
keyNameOf(66);          // 'ENTER'

keyCodeFor('f');        // 34   letters (either case) and main-row digits
keyCodeFor('7');        // 14
keyCodeFor('-');        // undefined
charForKeyCode(34);     // 'F'  uppercase; undefined for other keys
```

- `KeyCode` lists every `KeyEvent.KEYCODE_*` of the device's own Android version, by name without the `KEYCODE_` prefix.
  It is read from native, so it is empty when the module is not linked, and typed as `Record<string, number>` (a misspelled name gives `undefined`, not a compile error).
- `keyCodeFor` / `charForKeyCode` are pure: they work anywhere, including in tests. Digits are the main-row keys, not the numpad.

## Recipes

### Disable on-screen UI when a keyboard is present

```tsx
const hasKeyboard = useKeyboardConnected();
return hasKeyboard ? <ShortcutHints /> : <TouchToolbar />;
```

### A single shortcut table, handled in one place

```tsx
const SHORTCUTS = [
  { name: 'save',   match: { keyCode: keyCodeFor('s'), metaState: Meta.CTRL },                 run: save },
  { name: 'format', match: { keyCode: keyCodeFor('f'), metaState: Meta.CTRL | Meta.ALT },      run: format },
  { name: 'palette', match: { keyCode: keyCodeFor('p'), metaState: Meta.CTRL | Meta.SHIFT },   run: openPalette },
];
const RULES = SHORTCUTS.map((s) => s.match);

function Shortcuts() {
  useConsumeKeys(RULES);
  useKeyDown((e) => SHORTCUTS.find((s) => matchesKey(e, s.match))?.run());
  return null;
}
```

### Rebinding shortcuts at runtime

```tsx
function Shortcuts({ bindings }: { bindings: KeyMatch[] }) {
  useConsumeKeys(bindings);   // re-registered whenever `bindings` changes identity: memoize it
  // …
}
```

### Record a key combination (for a "change shortcut" screen)

```tsx
const MODIFIER_CODES = new Set([KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT, KeyCode.CTRL_LEFT, KeyCode.CTRL_RIGHT, KeyCode.ALT_LEFT, KeyCode.ALT_RIGHT, KeyCode.META_LEFT, KeyCode.META_RIGHT]);

function Recorder({ onDone }: { onDone: (m: KeyMatch) => void }) {
  // no consume rules are needed: the raw combination arrives at the listener
  useKeyDown((e) => {
    if (e.repeatCount > 0 || MODIFIER_CODES.has(e.keyCode)) return;
    onDone({ keyCode: e.keyCode, metaState: e.metaState & (Meta.SHIFT | Meta.ALT | Meta.CTRL | Meta.META) });
  });
  return <Text>Press a combination…</Text>;
}
```

### Hold-to-repeat game controls

```ts
addKeyDownListener((e) => { if (e.keyCode === KeyCode.DPAD_LEFT) move(-1, e.repeatCount); });
addKeyUpListener((e) => { if (e.keyCode === KeyCode.DPAD_LEFT) stop(); });
```

### Log what a device sends

```ts
addKeyDownListener((e) => console.log(keyNameOf(e.keyCode) ?? e.keyCode, e.metaState.toString(16), e.deviceId));
```

## API reference

| Export | Signature |
| --- | --- |
| `isAvailable` | `boolean`: the native module is linked (Android build that includes this package) |
| `isKeyboardConnected()` | `() => Promise<boolean>` |
| `addKeyboardListener(cb)` | `(cb: (c: KeyboardChange) => void) => () => void` |
| `useKeyboardConnected()` | `() => boolean` |
| `getKeyboards()` | `() => Promise<KeyboardDevice[]>` |
| `getInputDevices()` | `() => Promise<KeyboardDevice[]>` |
| `addKeyDownListener(cb)` | `(cb: (e: KeyEvent) => void) => () => void` |
| `addKeyUpListener(cb)` | `(cb: (e: KeyEvent) => void) => () => void` |
| `useKeyDown(handler, enabled?)` | `(…) => void` |
| `consumeKeys(rules)` | `(rules: KeyMatch[]) => () => void` |
| `useConsumeKeys(rules, enabled?)` | `(…) => void` |
| `matchesKey(event, match, repeat?)` | `(…) => boolean` |
| `keyCodeFor(char)` | `(char: string) => number \| undefined` |
| `charForKeyCode(code)` | `(code: number) => string \| undefined` |
| `KeyCode` | `Readonly<Record<string, number>>` |
| `keyNameOf(code)` | `(code: number) => string \| undefined` |
| `Meta` | `{ SHIFT, ALT, CTRL, META }` modifier bits |
| Types | `KeyboardDevice`, `KeyboardChange`, `KeyEvent`, `KeyMatch`, `ConsumeRule` (alias of `KeyMatch`) |

Every `add…` function and `consumeKeys` returns its own unsubscribe function; calling it twice is safe.

## How it works

- **Presence:** the module registers an `InputManager.InputDeviceListener` when it loads and recomputes the keyboard list on every device change, emitting only when presence flips.
- **Key events and consumption:** on activity resume the module wraps the activity window's `Window.Callback`. Its `dispatchKeyEvent` runs before the view hierarchy; it reports the event to JS (while there are key listeners) and, when a consume rule matches, returns `true` without passing the event on. Every other `Window.Callback` method, including `onProvideKeyboardShortcuts` and `onPointerCaptureChanged`, is forwarded to the activity's original callback. No `MainActivity` code is needed, and the wrapper survives a JS reload by always talking to the newest module instance.
- **Key codes:** `KeyCode` is built by reflecting over `android.view.KeyEvent`'s `KEYCODE_*` fields when the module initializes.

## Limitations

- **Android only.** No iOS, no web.
- **Works only in the main activity's window.** Modals (React Native's `Modal`, which is a separate Android `Dialog` window), `Alert`, popups, menus and any other window never reach this library: keys pressed while one is showing are neither reported nor consumable. Covering them is out of scope; if you need it, fork the library and extend the `Window.Callback` wrapping to those windows.
- Keys the system takes first (Home, power, volume on some devices) never reach this library either.
- Soft (on-screen) keyboard typing generally does not produce hardware key events; this is for physical keys.
- Consuming is decided from rules set in JS, so a rule change takes effect after one bridge hop.
- `useKeyboardConnected()` returns `false` for the first moments after mount; use `isKeyboardConnected()` if you must wait for the real answer.

## License

MIT
