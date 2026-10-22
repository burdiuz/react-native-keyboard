package com.actualwave.keyboard

import android.content.Context
import android.hardware.input.InputManager
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.Menu
import android.view.Window
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Hardware keyboard presence (tracked from InputManager for the module's lifetime, no activity
 * patching) and raw key events (a Window.Callback wrapper installed on the current activity).
 */
class KeyboardModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {
  override fun getName() = "ActualwaveKeyboard"

  companion object {
    const val ANY_KEY = -1

    /** The wrapper outlives a JS reload (it stays on the window), so it always talks to the newest module. */
    @Volatile private var active: KeyboardModule? = null
  }

  private val main = Handler(Looper.getMainLooper())
  private val inputManager get() = context.getSystemService(Context.INPUT_SERVICE) as InputManager

  @Volatile private var keyEvents = false
  @Volatile private var lastPresent: Boolean? = null

  private val deviceListener = object : InputManager.InputDeviceListener {
    override fun onInputDeviceAdded(deviceId: Int) = refresh()
    override fun onInputDeviceRemoved(deviceId: Int) = refresh()
    override fun onInputDeviceChanged(deviceId: Int) = refresh()
  }

  override fun initialize() {
    super.initialize()
    active = this
    inputManager.registerInputDeviceListener(deviceListener, main)
    context.addLifecycleEventListener(this)
    if (context.currentActivity != null) main.post { installKeyCallback() }
  }

  override fun invalidate() {
    inputManager.unregisterInputDeviceListener(deviceListener)
    context.removeLifecycleEventListener(this)
    if (active === this) active = null
    super.invalidate()
  }

  override fun onHostResume() {
    installKeyCallback()
    refresh()
  }

  override fun onHostPause() {}
  override fun onHostDestroy() {}

  /** Every `KeyEvent.KEYCODE_*` of this Android version, by name without the prefix (`ENTER` -> 66). */
  override fun getConstants(): Map<String, Any> {
    val codes = HashMap<String, Any>()
    for (field in KeyEvent::class.java.fields) {
      if (field.type == Int::class.javaPrimitiveType && field.name.startsWith("KEYCODE_")) {
        codes[field.name.removePrefix("KEYCODE_")] = field.getInt(null)
      }
    }
    return mapOf("KEYCODE" to codes)
  }

  // --- presence ---------------------------------------------------------------------------

  private fun inputDevices(): List<InputDevice> =
    InputDevice.getDeviceIds().mapNotNull { InputDevice.getDevice(it) }
      .filter { (it.sources and InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD }

  /** Every touchscreen reports the KEYBOARD source and the system adds a virtual alphabetic device, so neither counts. */
  private fun isPhysicalKeyboard(d: InputDevice) =
    !d.isVirtual && d.keyboardType == InputDevice.KEYBOARD_TYPE_ALPHABETIC

  private fun describe(d: InputDevice): WritableMap = Arguments.createMap().apply {
    putInt("id", d.id)
    putString("name", d.name)
    putInt("vendorId", d.vendorId)
    putInt("productId", d.productId)
    putString("descriptor", d.descriptor)
    putBoolean("virtual", d.isVirtual)
    putBoolean("alphabetic", d.keyboardType == InputDevice.KEYBOARD_TYPE_ALPHABETIC)
    putBoolean("keyboard", isPhysicalKeyboard(d))
  }

  private fun keyboardsArray(): WritableArray = Arguments.createArray().apply {
    inputDevices().filter(::isPhysicalKeyboard).forEach { pushMap(describe(it)) }
  }

  private fun refresh() {
    val keyboards = keyboardsArray()
    val present = keyboards.size() > 0
    if (lastPresent == present) return
    lastPresent = present
    emit("keyboardChanged", Arguments.createMap().apply {
      putBoolean("present", present)
      putArray("keyboards", keyboards)
    })
  }

  @ReactMethod
  fun isKeyboardConnected(promise: Promise) {
    promise.resolve(inputDevices().any(::isPhysicalKeyboard))
  }

  /** Physical keyboards (the default rule). */
  @ReactMethod
  fun getKeyboards(promise: Promise) {
    promise.resolve(keyboardsArray())
  }

  /** Every device with the keyboard source, with flags, so apps can apply their own rule. */
  @ReactMethod
  fun getInputDevices(promise: Promise) {
    promise.resolve(Arguments.createArray().apply { inputDevices().forEach { pushMap(describe(it)) } })
  }

  // --- key events -------------------------------------------------------------------------

  /** JS turns this on while it has key listeners, so idle apps pay nothing per key press. */
  @ReactMethod
  fun setKeyEventsEnabled(enabled: Boolean) {
    keyEvents = enabled
  }

  private class Rule(val keyCode: Int, val metaMask: Int, val metaState: Int) {
    fun matches(e: KeyEvent) =
      (keyCode == ANY_KEY || keyCode == e.keyCode) && (e.metaState and metaMask) == (metaState and metaMask)
  }

  @Volatile private var consumeRules: List<Rule> = emptyList()

  /**
   * Keys the app must not see. keyCode -1 = any key; a rule matches when `metaState & metaMask` equals the
   * event's masked state (JS defaults: mask = shift|alt|ctrl|meta, state = 0, i.e. unmodified only).
   */
  @ReactMethod
  fun setConsumedKeys(rules: ReadableArray) {
    consumeRules = (0 until rules.size()).map {
      val r = rules.getMap(it)!!
      Rule(r.getInt("keyCode"), r.getInt("metaMask"), r.getInt("metaState"))
    }
  }

  private class KeyCallback(private val base: Window.Callback) : Window.Callback by base {
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      val module = active
      val consumed = module?.handleKey(event) ?: false
      return if (consumed) true else base.dispatchKeyEvent(event)
    }

    // `by base` does not forward Java default methods, so without these two the activity's own handling is lost.
    override fun onProvideKeyboardShortcuts(data: MutableList<KeyboardShortcutGroup>, menu: Menu?, deviceId: Int) =
      base.onProvideKeyboardShortcuts(data, menu, deviceId)

    override fun onPointerCaptureChanged(hasCapture: Boolean) = base.onPointerCaptureChanged(hasCapture)
  }

  /** Reports the event to JS; returns whether a consume rule swallows it. */
  private fun handleKey(event: KeyEvent): Boolean {
    val consumed = consumeRules.any { it.matches(event) }
    onKey(event, consumed)
    return consumed
  }

  private fun installKeyCallback() {
    val window = context.currentActivity?.window ?: return
    main.post {
      val current = window.callback ?: return@post
      if (current is KeyCallback) return@post
      window.callback = KeyCallback(current)
    }
  }

  private fun onKey(event: KeyEvent, consumed: Boolean) {
    if (!keyEvents) return
    val down = event.action == KeyEvent.ACTION_DOWN
    if (!down && event.action != KeyEvent.ACTION_UP) return
    emit(if (down) "keyDown" else "keyUp", Arguments.createMap().apply {
      putInt("keyCode", event.keyCode)
      putInt("metaState", event.metaState)
      putInt("repeatCount", event.repeatCount)
      putInt("deviceId", event.deviceId)
      putDouble("eventTime", event.eventTime.toDouble())
      putBoolean("consumed", consumed)
    })
  }

  // --- NativeEventEmitter plumbing ---------------------------------------------------------

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  private fun emit(name: String, params: WritableMap) {
    if (!context.hasActiveReactInstance()) return
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)?.emit(name, params)
  }
}
