---
type: reference
tags: [tablet, patterns, rxdart]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet — Stream Patterns Cookbook

Rxdart recipes used throughout the tablet codebase. Sister doc to [[Tablet/Onboarding Walkthrough]]; assumes you've read that for the architectural context.

The tablet uses `rxdart` heavily. If you've used RxJS, the operators are nearly identical (same names, same semantics). If you haven't, this is the cheat sheet.

> **Bottom line:** prefer `BehaviorSubject` for state, `Stream` for events. Always pair `.listen` with `.takeUntil(unsubscriber)`. Default to `.distinct()` on public stream getters.

---

## 1. `BehaviorSubject<T>` — reactive state

The single most-used primitive in the codebase. Holds the latest value, replays it to new subscribers, emits to existing subscribers on `.add(...)`.

### Equivalents

| API | RxJS | Zustand-ish |
|---|---|---|
| `BehaviorSubject<T>.seeded(initial)` | `new BehaviorSubject(initial)` | `create(() => initial)` |
| `subject.value` / `subject.valueOrNull` | `subject.getValue()` | `store.getState()` |
| `subject.add(v)` | `subject.next(v)` | `setState(v)` |
| `subject.stream` | `subject.asObservable()` | the store hook |

### Idiomatic use — service singleton

```dart
class CallService {
  final _pendingIncomingCall$ = BehaviorSubject<CallMessageModel?>.seeded(null);

  CallMessageModel? get pendingIncomingCall => _pendingIncomingCall$.valueOrNull;
  Stream<CallMessageModel?> get onPendingIncomingCallChanged => _pendingIncomingCall$.stream;

  void setPendingIncomingCall(CallMessageModel? call) => _pendingIncomingCall$.add(call);
}
```

Three-part shape used everywhere:

1. **Private subject** with a `$` suffix (rxdart convention).
2. **Public synchronous getter** for the current value (`pendingIncomingCall`).
3. **Public stream getter** for subscribing to changes (`onPendingIncomingCallChanged`).

Do not expose the `BehaviorSubject` itself — keep the writer private to the class so external callers can't `.add()` directly.

### `.seeded(initial)` vs no seed

```dart
BehaviorSubject<bool>.seeded(false);   // emits `false` to first subscriber
BehaviorSubject<WifiQualityTier>();    // no initial emission; .valueOrNull is null
```

Seed if there's a sensible default. Don't seed if "we don't know yet" is meaningfully different from any real value (see `DeviceStatusService._wifiQualityTier$` for the unseeded case).

### `.value` vs `.valueOrNull`

`.value` throws if the subject was never seeded and never emitted. `.valueOrNull` returns null. Default to `.valueOrNull` unless you have a hard guarantee about ordering.

---

## 2. `StreamController<T>.broadcast()` — event bus

When you don't need to remember the last value — pure event emission. Used for things like "call rejoin requested" where there's no meaningful "current state."

```dart
final _callRejoin$ = StreamController<void>.broadcast();
Stream<void> get onCallRejoin => _callRejoin$.stream;

// fire
_callRejoin$.add(null);
```

`broadcast()` is required if you have multiple subscribers. A non-broadcast `StreamController` only allows one listener and throws on second `.listen`.

### When to use which

| Use case | Use |
|---|---|
| State that has a "current value" | `BehaviorSubject` |
| Events with no meaningful "current state" | `StreamController.broadcast` |
| Single-shot one-off | `Completer<T>` (see §10) |

---

## 3. `.listen(...)` + `.takeUntil(unsubscriber)` — the cleanup idiom

Every long-lived `.listen` call **must** be torn down on dispose. The standard pattern uses an unsubscriber `StreamController` plus `.takeUntil`:

```dart
class HomeViewModel {
  final unsubscriber = StreamController<void>.broadcast();

  void init() {
    CallService().onIncomingCall
        .takeUntil(unsubscriber.stream)
        .listen((call) => _showIncomingCallModal(call));

    CallService().onCallEnded
        .takeUntil(unsubscriber.stream)
        .listen((call) => _hideCallingOverlay());
  }

  Future<void> dispose() async {
    unsubscriber.add(null);          // fires takeUntil for every listener at once
    await unsubscriber.close();
  }
}
```

### Why this pattern

- One `dispose` tears down N listeners. No bookkeeping per-subscription.
- Equivalent to RxJS `takeUntil(destroy$)` or React's `AbortController`.
- Composes cleanly with the `init`/`dispose` pair on every view-model.

### Alternative — store the `StreamSubscription`

For a single subscription, keeping the handle is fine:

```dart
StreamSubscription<WifiQualityTier>? _wifiQualitySub;

_wifiQualitySub = stream.listen(...);

void dispose() {
  _wifiQualitySub?.cancel();
}
```

Use this when you only have one or two subscriptions and want the explicitness. Use `takeUntil` when you have many or want them grouped.

### What NOT to do

```dart
// ❌ leak — never canceled
service.someStream.listen((v) => ...);

// ❌ partial — only this one is canceled
final sub = service.someStream.listen(...);
// (nothing in dispose)
```

---

## 4. `.where(predicate)` and `.map(transform)` — filter / transform

Identical to RxJS `filter` / `map`.

```dart
final onCallEnded = realtime.onDataReceived
    .where((data) => data.event == Event.callEnded)
    .map((data) => data.data as CallMessageModel)
    .where((call) => call.id == _activeCall?.id);
```

Three-stage pipeline filter → cast → filter is the recipe used by every event-derived stream in `CallService`. Each subscriber gets an independently-filtered view of the parent stream.

### Important — getters create fresh streams

```dart
Stream<CallMessageModel> get onIncomingCall => realtime.onDataReceived
    .where(...)
    .map(...);
```

Every access to `onIncomingCall` builds a **new** filtered stream. That's intentional — each consumer gets independent filtering. Don't memoize the result; rxdart streams are cheap.

---

## 5. `.distinct()` — dedupe consecutive duplicates

Only emit when the value differs from the previous emission. Use on stream getters where consumers should only react to *changes*.

```dart
final BehaviorSubject<WifiQualityTier> _wifiQualityTier$ = BehaviorSubject();
Stream<WifiQualityTier> get wifiQualityTier => _wifiQualityTier$.stream.distinct();
```

Without `.distinct()`, the WiFi-tier subscriber would receive every 3-second sample even when the tier didn't change → spurious work. With it, only tier transitions get through.

### Pairs well with `BehaviorSubject`

A `BehaviorSubject` will emit duplicate values if you `.add()` the same value twice. `.distinct()` on the public getter filters that out. Standard pattern:

```dart
final _x$ = BehaviorSubject<X>.seeded(initial);
Stream<X> get x => _x$.stream.distinct();
```

---

## 6. `.debounceTime(duration)` — rate limiting

Emit only after `duration` of silence. Used when an upstream stream emits faster than you can act on it.

```dart
_wifiQualitySub = DeviceStatusService()
    .wifiQualityTier
    .debounceTime(const Duration(seconds: 5))
    .listen((tier) => _applyQualityTier(client, tier));
```

WiFi tier transitions are debounced 5 seconds — avoids retuning Daily SDK encoding settings on every brief signal fluctuation. The tier has to stabilize at a new level for 5s before the listener fires.

### `debounceTime` vs `throttleTime`

- **`debounceTime(d)`** — wait for d of silence, then emit the *latest*. Good for "user stopped typing."
- **`throttleTime(d)`** — emit at most once per d. Good for "limit how often we react."

Tablet codebase uses `debounceTime` almost exclusively.

---

## 7. `.firstWhere(predicate)` — wait-for-condition

Returns a `Future<T>` that resolves the first time the predicate is true. The cleanest "block until ready" primitive in the codebase.

```dart
final _isInitiated$ = BehaviorSubject<bool>.seeded(false);

// In an interceptor:
await _isInitiated$.firstWhere((v) => v == true);
// ...continue with the request
```

This is the deadlock-avoidance trick in `HttpService._bootstrapInterceptor`. Requests fired before config is loaded await the subject until `setBootstrapInfo` flips it to `true`.

Equivalent to: "give me a Promise that resolves once the value becomes truthy."

### `.first` (no predicate)

`stream.first` resolves with the next emission, full stop. Useful for "I just want one event from this stream."

---

## 8. `.take(n)` — take first n emissions

```dart
InternetStatusService().onStateChanged
    .where((status) => status)
    .take(1)
    .listen((_) => completer.complete());
```

After 1 emission matching the filter, the subscription auto-completes. No need to manually unsubscribe. Pattern: "wait for one occurrence, then go."

`.take(1)` + `.where(...)` is the "I need to react exactly once when X becomes true" recipe. Equivalent to `.firstWhere(...)` if you want a `Future` instead of a callback.

---

## 9. Combining streams — `Rx.combineLatest2 / 3 / N`

When you need multiple streams folded into one:

```dart
import 'package:rxdart/rxdart.dart';

final combined = Rx.combineLatest2(
  authStream,
  configStream,
  (auth, config) => (auth, config),  // record / tuple
);

combined.listen((data) {
  final (auth, config) = data;
  // ...
});
```

Emits whenever any input emits, with the latest of each. Like RxJS `combineLatest`. Underused in the tablet codebase — most logic prefers a single source of truth.

Other combinators worth knowing:

- `Rx.merge([a, b, c])` — interleave emissions from multiple streams. Use when "any of these events should trigger the same handler."
- `.switchMap((x) => stream(x))` — when each upstream event triggers a new derived stream and old ones should be canceled. Like RxJS `switchMap`.

---

## 10. `Completer<T>` — bridge to `Future` API

Not a stream operator, but used alongside streams. A `Completer<T>` exposes a `Future<T>` that you can resolve later from outside. Equivalent to manually constructing a Promise:

```ts
let resolve!: (v: T) => void;
const p = new Promise<T>(r => { resolve = r; });
// later: resolve(value);
```

In Dart:

```dart
final completer = Completer<dynamic>();

// Eventually
completer.complete(value);

return completer.future;
```

Used in `RealtimeService._waitForInternetInvoke` to let an async function resolve based on a stream emission *or* a timeout, whichever fires first. Good when you need a one-shot Future-shaped boundary inside stream-shaped code.

### Always check `isCompleted` before completing twice

```dart
if (!completer.isCompleted) {
  completer.complete(value);
}
```

`Completer.complete` called twice throws. Defensive `isCompleted` check is the standard pattern when multiple paths could resolve it.

---

## 11. The `BehaviorSubject` lifecycle

Subjects are not GC'd while they have listeners. Long-lived service-level subjects (most of them) live for the app lifetime — fine. View-model subjects need explicit cleanup:

```dart
class VideoCallViewModel {
  final _isConnecting$ = BehaviorSubject<bool>.seeded(true);
  final _isAudioOnlyMode$ = BehaviorSubject<bool>.seeded(false);

  void dispose() {
    _wifiQualitySub?.cancel();
    _isConnecting$.close();
    _isAudioOnlyMode$.close();
  }
}
```

`.close()` releases listeners and prevents further emissions. Don't forget — leaked subjects pin closures and any captured controllers/services in memory.

---

## 12. Common mistakes

- **Forgetting `.takeUntil` on `.listen`.** Listener never unsubscribes. Memory leak + the listener keeps running across screen navigations.
- **Calling `.listen` twice on a non-broadcast stream.** Throws "Stream has already been listened to." Use `.broadcast()` or share the result.
- **Reading `.value` on an unseeded `BehaviorSubject`.** Throws. Use `.valueOrNull`.
- **Returning the `BehaviorSubject` itself instead of `.stream`.** Lets external callers `.add()` to your private state. Always expose `Stream<T>` from public getters.
- **Re-using a `Completer`.** They're single-shot. Make a new one each invocation.
- **Forgetting `.distinct()`.** Wifi/connectivity/state subjects emit duplicates and consumers re-render or re-fetch unnecessarily.

---

## Quick reference — RxJS ↔ rxdart

| Need | rxdart | RxJS |
|---|---|---|
| Reactive state | `BehaviorSubject<T>.seeded(v)` | `new BehaviorSubject(v)` |
| Event bus | `StreamController<T>.broadcast()` | `new Subject<T>()` |
| Filter | `.where(predicate)` | `.pipe(filter(...))` |
| Transform | `.map(fn)` | `.pipe(map(...))` |
| Dedup | `.distinct()` | `.pipe(distinctUntilChanged())` |
| Wait-for-silence | `.debounceTime(d)` | `.pipe(debounceTime(d))` |
| Rate limit | `.throttleTime(d)` | `.pipe(throttleTime(d))` |
| Wait-for-condition | `.firstWhere(pred)` | `.pipe(filter(pred), take(1))` + `firstValueFrom` |
| Take N then complete | `.take(n)` | `.pipe(take(n))` |
| Cancel on signal | `.takeUntil(stream)` | `.pipe(takeUntil(destroy$))` |
| Merge multiple | `Rx.merge([a, b])` | `merge(a, b)` |
| Combine latest | `Rx.combineLatest2(a, b, fn)` | `combineLatest([a, b])` |
| Switch to inner stream | `.switchMap(fn)` | `.pipe(switchMap(fn))` |

---

## Where these patterns live in the codebase

- `BehaviorSubject` as service state: `tablet/lib/services/call.service.dart`, `device_status.service.dart`, `realtime.service.dart`
- `takeUntil(unsubscriber)` for view-model cleanup: `tablet/lib/ui/screens/home/home.view_model.dart`
- `where().map().where()` event pipelines: `tablet/lib/services/call.service.dart`
- `.distinct()` on public stream: `tablet/lib/services/device_status.service.dart` (`wifiQualityTier`)
- `.debounceTime()` for adaptive quality: `tablet/lib/ui/screens/video_call/video_call.view_model.dart`
- `.firstWhere()` for bootstrap deadlock avoidance: `tablet/lib/services/http.service.dart`
- `Completer` + stream + timeout: `tablet/lib/services/realtime.service.dart` `_waitForInternetInvoke`
