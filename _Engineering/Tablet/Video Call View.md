---
type: reference
tags: [tablet, calls, daily, ui]
owner: Mike
updated: 2026-05-07
status: current
---
# Tablet — Video Call View

The 782-line `tablet/lib/ui/screens/video_call/video_call.view.dart` — Daily SDK event handlers, multiple concurrent timers, and the actual rendering of the call. Sister doc to [[Tablet/Onboarding Walkthrough]] §6 (which covered the view-model) and [[Tablet/Domain - Calls]].

> **Bottom line:** the view holds **its own state** beyond the view-model — four timers, three booleans, a tap counter, and the Daily SDK event subscription. The view-model owns Daily-SDK-side state (join, quality tuning); the view owns UI-side state (timers, "is calling" overlay, no-participant auto-leave). Both layers cooperate but do not share state.

---

## 1. State the view owns

```dart
class _VideoCallScreenState extends State<VideoCallScreen> {
  late final _videoCall = VideoCallViewModel();

  bool? _isLoading = false;          // tri-state: false=idle, true=ending, null=disposing
  bool _isConnecting = true;
  bool isCalling = false;            // outbound call, "Calling..." modal showing
  bool _hasEndedCall = false;        // guard: don't double-end
  Timer? _callEndtimer;              // 30s "no participant joined" countdown
  int _secondsRemaining = 0;
  Timer? _noParticipantTimer;        // 60s auto-leave when remote drops
  static const _noParticipantTimeout = Duration(seconds: 60);
  int _tapCount = 0;                 // quad-tap-to-end accessibility gesture
  Timer? _tapResetTimer;
  WifiQualityTier? _wifiQuality;     // mirrored from view-model stream
}
```

A few notable choices:

- **`_isLoading` is tri-state** (`bool?`). `false` = idle, `true` = call-ending in progress, `null` = view is disposing. Used as a guard in `_onQuadTap` and the End Call button to prevent double-trigger during teardown.
- **`_hasEndedCall` flag** — the Daily `left` event fires asynchronously after `_onEnd`. This flag prevents the view from running its own pop logic if `_onEnd` already navigated.
- **Two separate timers, two separate purposes**:
  - `_callEndtimer` — "the call has been initiated but no remote participant joined within the configured timeout" (e.g., outbound calling staff who isn't picking up).
  - `_noParticipantTimer` — "remote participant *was* in the call but disconnected; give them 60s to come back before auto-ending."

---

## 2. The four timers

| Timer | Started by | Cancelled by | Purpose |
|---|---|---|---|
| `_callEndtimer` (countdown) | `_startEndCallTimer` — fired on Daily `joined` if no remote, or on `participantLeft` | `participantJoined`, `_cancelEndCallTimer`, network restore via `onCallRejoin` | Show "If participant doesn't join in M:SS, call will end." Triggers `_onEnd` at 0. |
| `_noParticipantTimer` | `_startNoParticipantTimer` — on `participantLeft` | `participantJoined`, `_cancelNoParticipantTimer`, network restore | Auto-leave after 60s if remote never returns. **Belt-and-suspenders with `_callEndtimer`** — both run in parallel during a remote dropout. |
| `_tapResetTimer` | First tap on the screen | 4th tap, or 3s of no taps | Resets the quad-tap counter for the accessibility "tap 4× to end call" gesture. |
| `_videoCall._wifiQualitySub` (in view-model) | `init` | `dispose` | Adaptive quality. See [[Tablet/Onboarding Walkthrough]] §6. |

The combination of `_callEndtimer` (configured-timeout countdown) + `_noParticipantTimer` (hard 60s ceiling) is for a specific failure mode: backend `appConfig.callTimeoutInMilliseconds` could conceivably be set to something silly like 600000 (10 min). The 60s no-participant timer is a hard ceiling regardless.

---

## 3. Daily SDK event handling

`_handleEvent(Event event)` switches on Daily's event union via `event.whenOrNull<void>(...)`:

```dart
event.whenOrNull<void>(
  callStateUpdated: (callStateData) { ... },
  activeSpeakerChanged: (participant) { ... },
  participantJoined: (participant) { ... },
  participantLeft: (participant) { ... },
  participantUpdated: (participant) { ... },
);
```

Five handled events. **Many other Daily events exist but are intentionally not handled** (network quality, recording, etc.) — the tablet is consumer-only.

### `callStateUpdated`

Tracks the Daily SDK's own state machine: `joining → joined → leaving → left`. Two sub-events handled:

```dart
joined: (_) {
  // If remote participant isn't here yet, start the timeout
  final remote = callClient?.participants.remote.values.firstOrNull;
  if (remote == null) _startEndCallTimer();
},
left: () async {
  if (CallService().activeCall != null) return;   // _onEnd hasn't run yet
  if (_hasEndedCall) return;                       // _onEnd already navigated
  await _hideCallingModal();
  await _videoCall.onLeft();   // pops the route
}
```

The `left` handler is the ordinary cleanup path. `_hasEndedCall` skip prevents the double-pop case.

### `participantJoined` (remote)

This is the moment the call is "actually live."

1. Cancel both timers (`_callEndtimer`, `_noParticipantTimer`).
2. Hide the "Calling..." modal (outbound flow).
3. `await _videoCall.updateSubscriptions()` — tells Daily SDK to subscribe to this new participant's video at `activeRemote` quality.
4. `setState(() {})` to re-render with the participant tile.

`participant.info.isLocal` is checked first — local participant joining triggers a different path.

### `participantLeft` (remote)

The most safety-critical handler:

```dart
if (!participant.info.isLocal) {
  WaypointService.log(participantDisconnected, ...);
  _startEndCallTimer();          // backend-configured countdown
  _startNoParticipantTimer();    // hard 60s ceiling
}
```

Both timers start simultaneously. Whichever fires first ends the call. Designed for the case where a network blip drops the remote — they have a brief window to reconnect; otherwise we don't strand a blind resident in a silent room.

### `participantUpdated`

Triggered when remote participant's media tracks change (camera on/off, mic on/off, video resolution change). Calls `_videoCall.updateSubscriptions()` to refresh the subscription state.

### `activeSpeakerChanged`

Same handler — re-subscribe. Daily uses subscription profiles based on who's actively speaking; we follow.

---

## 4. The "calling" modal (outbound flow)

When the resident initiates a call (e.g., voice command "call staff"), `activeCall.createdById == currentUserId` is true. The view shows a full-screen **`Calling`** modal in `_showCallingModal` with the called participant's avatar + name, plus the timeout countdown.

The modal stays up until either:
- `participantJoined` fires (staff picked up) → `_hideCallingModal` → render the actual video tiles.
- `_callEndtimer` reaches 0 → `_onEnd` runs `CallService.missedCall()` (NOT `leaveCall`, because the call was never connected from the resident's side).

The modal vs no-modal branch determines whether `_onEnd` calls `missedCall` (calling = true) or `leaveCall` (calling = false) — line 539-556.

---

## 5. The reconnect handler (`onCallRejoin`)

Subscribed in `initState`:

```dart
CallService().onCallRejoin.takeUntil(_unsubscriber.stream).listen((_) async {
  // Cancel timers
  _cancelEndCallTimer();
  _cancelNoParticipantTimer();
  // Refresh Daily subscriptions to restore video
  await _videoCall.updateSubscriptions();
  await callClient.setInputsEnabled(camera: true, microphone: true);
});
```

`onCallRejoin` is fired by `CallService.checkActiveCallStatus` when internet comes back online during an active call. Don't restart Daily — we never left it; just refresh subscriptions and re-enable inputs in case they were disabled by the audio-only fallback.

This is the key difference from a fresh join: **a network-blip reconnect doesn't re-call `_videoCall.init()`**. The Daily SDK is still connected from its perspective; only the *frontend* perception of "are we online" went stale.

---

## 6. The quad-tap accessibility gesture

```dart
void _onQuadTap() {
  _tapCount++;
  _tapResetTimer?.cancel();
  _tapResetTimer = Timer(Duration(seconds: 3), () => _tapCount = 0);
  if (_tapCount >= 4) {
    _tapCount = 0;
    if (_isLoading == false) _onEnd();
  }
}
```

The entire video call screen is wrapped in a `GestureDetector` that calls `_onQuadTap` on every tap. Four taps within 3 seconds = end call. Designed for blind residents who can't visually find the End Call button; tapping anywhere on the screen rapidly works.

`_tapCount` is reset by either reaching 4 or the 3-second silence timer. `_isLoading == false` guard prevents double-trigger if the user keeps tapping while the call is already ending.

---

## 7. The connecting overlay vs end-call timer

Three different status overlays can appear at the top of the screen:

| Overlay | Condition | Visible during |
|---|---|---|
| **`_buildConnectingOverlay`** ("Connecting...") | `_isConnecting && !isCalling` | Initial join + retries (touch is disabled by view-model's `withTouchDisabledTimeoutVoid`) |
| **`_buildEndCallTimer`** ("If participant doesn't join in M:SS, call will end.") | `hasActiveCall && _callEndtimer.isActive && !_isConnecting` | After join, while waiting for remote |
| **`_buildSignalIndicator`** (WiFi bars + label) | `_wifiQuality != null` | Always (top-right) |

The `_isConnecting` mutual exclusion matters: the connecting overlay lives at the top center, same place as the end-call timer. They never appear simultaneously by design — connecting must finish before timer can show.

**The End Call button itself is hidden while connecting** (line 668-693 — `if (!_isConnecting) ElevatedButton.icon(...)`). UX rule: don't let the resident hit "End" on a never-connected call. The view-model's `_isConnecting$` stream is the source of truth.

---

## 8. WiFi signal indicator

Five tiers map to display:

| Tier | Bars | Color | Label |
|---|---|---|---|
| `high` | 3 | green | "Good" |
| `medium` | 2 | orange | "Fair" |
| `low` | 1 | red | "Poor" |
| `audioOnly` | 0 | red | "Audio Only" |
| `disconnected` | 0 | red | "No Connection" |
| null (initial) | 0 | grey | (no label) |

This is a passive indicator — it reflects what `DeviceStatusService.wifiQualityTier` is currently emitting. The actual quality adaptation happens in the view-model with a 5s debounce; the indicator is direct (every 3s WiFi sample changes the icon). Slight inconsistency is intentional: indicator needs to be responsive for feedback, encoding settings need to be stable to avoid thrash.

---

## 9. Layout quirks

- **Single-participant centering**: when no remote participant is present, the local video view is rendered at `_centeredVideoViewSize` (450w) and centered. When remote joins, both shift to a row (local at 220×300, remote at 450×*).
- **`callClient == null` fallback layout** (lines 731-779): if the call client is null at build time, render a simpler layout that just has an End Call button calling `_videoCall.onLeft()`. Defensive against a race where the view builds before `init` finishes wiring up the Daily client.
- **`CallClientStateProvider` wrapper** (line 619): Daily's own `InheritedWidget` that provides the call client to descendant widgets like `LocalVideoView` and `ParticipantVideoView`. Don't bypass — it's how the video tiles know which client to render from.
- **The screen has a background gradient** (line 626) — `Color(0xFF2E2E3D)` to `Color(0xFF13131A)`. Hardcoded hex (deviates from theme constant rule). The pattern hasn't been refactored to use a theme token. Don't propagate.

---

## 10. Lifecycle: `dispose` cleanup

```dart
Future<void> dispose() async {
  super.dispose();
  _isLoading = null;                // signal "we're disposing, ignore further triggers"
  _callEndtimer?.cancel();
  _noParticipantTimer?.cancel();
  _tapResetTimer?.cancel();
  ScreenDimService().resumeDimming();    // re-enable idle dimmer
  VoiceCommandService().systemEnable();  // re-enable voice commands (was disabled at initState)
  _unsubscriber.add(null);
  await _unsubscriber.close();
  if (!_hasEndedCall) {
    await CallService().leaveCall(callId: _videoCall.callId);
  }
  await _hideCallingModal();
  _videoCall.dispose();
}
```

Three things worth knowing:

- **`ScreenDimService().pauseDimming()` is paired with `resumeDimming()`** — calls bracket call session. If you add a screen that should also pause dimming (long video?), follow the same pattern.
- **`VoiceCommandService().systemEnable()` (not `enable()`)** — respects manual disable flag; if the user had voice off before the call, it stays off. See [[Tablet/Voice Commands]] §7.
- **`leaveCall` is called in `dispose` if `_hasEndedCall` is false** — this handles the "user navigated away via a system back press or some other path that didn't go through `_onEnd`" case. Defensive; usually a no-op because `_onEnd` already ran.

---

## 11. Common log lines for debugging

If you're debugging a video call issue with [[Tablet/Logging Stack]], filter for `VIDEO_CALL:` prefix. Notable events to grep for:

| Log line | Means |
|---|---|
| `VIDEO_CALL: Remote participant joined - ID: X, Name: Y` | `participantJoined` event fired |
| `VIDEO_CALL: participantLeft event fired` | Remote disconnected |
| `VIDEO_CALL: Starting end call timer + no-participant auto-leave` | Both 30s + 60s timers started |
| `VIDEO_CALL: onCallRejoin triggered - Network restored` | Network came back, refreshing subscriptions |
| `VIDEO_CALL: Updating video subscriptions...` | `updateSubscriptions` being called |
| `VIDEO_CALL: Call timed out - no participant joined` | `_callEndtimer` fired before remote arrived |
| `VIDEO_CALL: No remote participants for 30s - auto-ending call` | `_noParticipantTimer` fired (note: log says 30s but timer is 60s; log line is stale) |
| `VIDEO_CALL: Call ended - ID: X` | `_onEnd` ran successfully |

---

## 12. SME-worth gotchas

- **Two timers fire on `participantLeft`**, not one. If you "fix" by keeping only one, you remove either the configured-timeout countdown or the 60s ceiling. They serve different purposes.
- **`participantLeft` is for the *remote* leaving.** If `participant.info.isLocal` is true, it's the tablet's own departure — handled by `callStateUpdated.left`, not here.
- **`onCallRejoin` doesn't go through `init`.** It's a soft refresh path. If you change `init`'s subscription setup, the rejoin path won't pick it up unless you also update the rejoin handler.
- **The `Calling` modal lives in `ModalService`**, not as a regular widget. So it floats above the rest of the screen, including the GestureDetector — the modal absorbs taps. The quad-tap-to-end gesture only works *after* the modal is dismissed.
- **`_hasEndedCall` guard** prevents double-pop on the `left` event. Don't remove it — it's also the reason the dispose path skips `leaveCall` when `_onEnd` already ran.
- **`_isLoading == false`** (explicit `==`, not `!`) is intentional in `_onQuadTap` and the End Call button. `null` means "disposing"; `true` means "ending"; only `false` means "idle and clickable."
- **Adding new Daily events**: extend the `event.whenOrNull` block. Don't add a separate `.listen` — keep the dispatch unified for visibility.
- **Layout rebuilds on every `setState({})`** — no virtualization. With one remote participant this is fine; if Daily ever lets multi-party calls in, the layout would need to handle a list.

---

## 13. Where this connects

- [[Tablet/Onboarding Walkthrough]] §6 — view-model side: `init()` retries, `applyQualityTier`, audio-only fallback.
- [[Tablet/Domain - Calls]] — call-domain ownership and change patterns.
- [[Tablet/Kiosk Service Reference]] — `withTouchDisabledTimeoutVoid` (used inside view-model's `init`) and `getAudioDiagnostics` for "can't hear" reports.
- [[Tablet/Voice Commands]] §8 — forced-call path and the disable/systemEnable pairing.
- [[Tablet/Logging Stack]] — `VIDEO_CALL:` log prefix.
