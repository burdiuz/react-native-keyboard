---
name: react-native-keyboard
description: Use when working with @actualwave/react-native-keyboard — Android-only hardware keyboard presence, key events, and native key consumption in React Native.
---

# @actualwave/react-native-keyboard

Android only (no-ops elsewhere). This is a quick reference; **read README.md for detailed API descriptions, types, examples and recipes** (sections: Key events, Matching keys, Consuming keys, Recipes, API reference). Needs a native rebuild after install; `isAvailable` tells whether the native module is linked.

- Presence: `isKeyboardConnected()`, `addKeyboardListener(cb)` (fires only when presence flips), `useKeyboardConnected()` (`false` until the first answer arrives), `getKeyboards()`, `getInputDevices()`.
- Events: `addKeyDownListener` / `addKeyUpListener` / `useKeyDown(handler, enabled?)` give `{ keyCode, metaState, repeatCount, deviceId, eventTime, consumed }`.
- Consume (stopPropagation for keys): `consumeKeys(rules)` / `useConsumeKeys(rules, enabled?)`; rules are `{ keyCode?, metaState?, metaMask? }` (omitted `keyCode` = any key; modifiers Shift/Alt/Ctrl/Meta are compared unless `metaMask` says otherwise). JS cannot veto events, so rules are declarative and applied natively. Consumed keys still reach key listeners with `consumed: true`.
- Match: `matchesKey(event, match, repeat?)` (exact on Shift/Alt/Ctrl/Meta by default, ignores auto-repeat).
- Helpers: `keyCodeFor('f')`, `charForKeyCode(34)`, `KeyCode.ENTER`, `keyNameOf(66)`, `Meta.CTRL`.
- Every `add…`/`consumeKeys` returns an unsubscribe function; hooks clean up on unmount. Keep rules arrays referentially stable.
- Limits: works only in the main activity's window (no Modal, `Alert`, dialogs, popups); system keys (Home, power) cannot be consumed. `KeyCode.X` is `number | undefined` under strict typing.
