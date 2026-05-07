---
type: reference
tags: [tablet, voice, accessibility]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet — Voice Commands

Walkthrough of `tablet/lib/services/voice_command.service.dart` — the wake-word + command system used primarily for blind/low-vision residents. Sister doc to [[Tablet/Onboarding Walkthrough]].

> **Bottom line:** `VoiceCommandService` is a **disabled-by-default** singleton state machine layered over `speech_to_text` (STT) and `flutter_tts` (TTS). Users activate it via a hidden 4-tap gesture on the bottom-left corner of the home screen. Once enabled, it listens continuously for the wake word "heylo" (and 4 variants), then accepts one of three commands: call staff, accept call, deny call.

---

## 1. State machine

`VoiceCommandState` enum (in `tablet/lib/enums/voice_command_state.enum.dart`):

```
disabled    ← initial state; activated via 4-tap gesture
   ↓ enable()
idle        ← listening for wake word
   ↓ wake word detected
listening   ← waiting up to 10s for a command
   ↓ command matched
executing   ← TTS feedback + action (call staff / accept / deny)
   ↓ action complete
idle        ← back to listening for wake word

unavailable ← STT marked broken; recovers when a result comes through
   ↓ first non-empty result
idle
```

Public surface for state:

```dart
final _state$ = BehaviorSubject<VoiceCommandState>.seeded(idle);
Stream<VoiceCommandState> get onStateChanged => _state$.stream;
VoiceCommandState get currentState => _state$.value;
```

Consumed by `VoiceCommandIndicator` widget (small mic icon overlay set up in `main.dart`'s widget tree).

---

## 2. Wake words and command vocabulary

Hardcoded constants in the service:

```dart
static const _wakeWords = ["heylo", "hey lo", "halo", "heylow", "hey low"];
```

Five variants because Samsung's on-device Speech Recognizer routinely mishears "heylo" as "halo" / "hello" / "hey low" depending on the speaker's accent. Permissive matching avoids the resident having to enunciate.

Command matching (case-insensitive, substring match):

| Command | Matches |
|---|---|
| **Call staff** | "call staff", or "call" anywhere (but not "end call") |
| **Accept** | "accept", "answer", "pick up" |
| **Deny** | "deny", "decline", "reject" |

Substring matching means "Heylo, please answer the call" works (matches "answer"). Order in `_tryMatchCommand` is: call-staff first, then accept, then deny — deliberate because a phrase like "decline call" would otherwise match "call" first.

---

## 3. The session lifecycle (one happy-path command)

```
[user activates via 4-tap gesture]
   enable()
     state = idle
     _startListening()
        KioskService.muteBeep()                      ← suppress STT startup beep
        _speech.listen({listenMode: dictation, partialResults: true, onDevice: true})
           [transcript: "heylo"]
              _checkForWakeWord
                 state = listening
                 _speakThenListenForCommand()
                    _speak("Yes?")
                       _speech.stop()                ← pause listening for TTS
                       KioskService.unmuteBeep()
                       KioskService.ensureTtsVolume()
                       _tts.speak("Yes?") (5s timeout)
                       Future.delayed(500ms)         ← drain TTS audio tail
                       _startListening()             ← resume listening
                    _startCommandTimeout(10s)
           [transcript: "accept"]
              _tryMatchCommand
                 state = executing
                 _executeAcceptCall()
                    _speak("Accepting call...")
                    FlutterRingtonePlayer().stop()
                    CallService.joinCall(pendingCall.id) → token
                    RouterService.push(/video-call, {token})
                 _returnToIdle()
                    state = idle
                    _startListening()                ← back to wake-word listening
```

Subtle but important: **listening is continuous** in the idle state. Every transcript is checked against wake words. So the resident doesn't need to press anything — saying "heylo accept" while the tablet is sitting on the home screen will work.

Also worth noting: **wake word + command can be one utterance** — `"Heylo accept"` is matched in a single `onResult` callback (lines 188-201 of the service). The wake word is detected, the rest of the transcript is sent through `_tryMatchCommand`, command matches, executes immediately. No need to pause between.

---

## 4. Why STT/TTS routing is gnarly

Speech recognition and text-to-speech share audio hardware. Without care, the tablet's TTS feedback ("Yes?", "Accepting call...") can be picked up by the still-active microphone, causing the recognizer to hear its own voice and re-trigger.

Mitigations baked into `_speak()`:

```dart
Future<void> _speak(String text) async {
  _isSpeaking = true;
  await _speech.stop();                  // pause STT
  await KioskService.unmuteBeep();       // restore notification volume (TTS plays here)
  await KioskService.ensureTtsVolume();  // make sure STREAM_MUSIC is audible
  await _tts.speak(text);
  await completer.future.timeout(5s);    // wait for TTS completion event
  await Future.delayed(500ms);           // drain audio tail before re-listening
  if (_isInitialized && _isEnabled) {
    _startListening();                   // resume STT
  }
}
```

Plus `_isSpeaking` flag is checked in `_onSpeechError` and `_onSpeechStatus` handlers — when TTS is active, those handlers don't restart listening (TTS owns the restart instead).

The 500ms tail-drain is empirical; shorter values caused mic to pick up the end of "Yes?" and false-trigger. Don't reduce.

---

## 5. Error handling — the gnarliest part

STT on Android is unreliable, and the service has multiple defensive layers. The `_onSpeechError` handler classifies errors:

### Silence errors (expected, fast restart)

```dart
static const _silenceErrors = ["error_speech_timeout", "error_no_match", "error_client"];
```

These mean "nobody spoke during the listen window." Just restart immediately, no backoff. **`error_client` is in the list because Samsung's on-device recognizer reports it on silence timeout instead of `error_speech_timeout`** — a Samsung quirk that took real debugging to identify.

### `error_busy`

Means the recognizer thinks a session is still active. `_speech.cancel()` is called for a hard reset (vs `stop()` which tries to deliver a final result and can hang).

### `error_server_disconnected`

The on-device STT model is unavailable. The service goes to `unavailable` state and **defers to the 30s watchdog** rather than retrying. Rapid retries here would churn audio focus and break VoIP audio routing during calls.

### Permanent errors during a call

```dart
if (CallService().pendingIncomingCall != null || CallService().activeCall != null) {
  _state$.add(unavailable);
  return;  // suppress retry
}
```

Same reason — rapid STT start/stop during a call resets `AudioManager` mode and breaks call audio. Suppress retries while a call is active; `enable()` recovers later.

### Generic permanent errors with backoff

Otherwise, exponential backoff: `300ms × 2^n` capped at 30s. Stop retrying after 10 consecutive errors and let the watchdog recover.

---

## 6. The watchdog timer

Runs every 30s while initialized. Recovers from stuck states:

| Stuck condition | Watchdog action |
|---|---|
| Disabled for >2min, no active call, *not manually disabled* | `enable()` (auto-recovery) |
| Idle/unavailable but `_speech.isNotListening` and not speaking | Force `_speech.cancel()` + `_startListening()` |
| Stuck in `listening` state with no command timeout firing | Force `_returnToIdle()` |
| Stuck in `executing` state for >15s | Force `_returnToIdle()` |

Without the watchdog, edge cases (Android killing the STT service, audio focus loss during a call, etc.) would leave the recognizer permanently stuck. It's a belt-and-suspenders pattern paired with the per-session error retry logic.

---

## 7. Manual vs system disable

Two flags distinguish *who* turned voice off:

```dart
bool _isEnabled = true;
bool _manuallyDisabled = false;
```

Plus two methods:

- **`disable()`** — system-level disable (e.g., during a call, or transient error). Sets `_isEnabled = false` but **doesn't** set `_manuallyDisabled`. The watchdog will auto-recover after 2min.
- **`manualDisable()`** — user explicitly toggled voice off via the indicator widget. Sets both flags. Watchdog skips auto-recovery (`if (_manuallyDisabled) return;`).

`systemEnable()` is the counterpart — re-enables only if the user didn't manually disable. Used after a call ends.

`enable()` is the unconditional "turn on" — clears both flags and resumes listening.

This distinction matters because residents who turn off voice commands deliberately (some find it intrusive) shouldn't have it auto-re-enable on them. But system-level transient disables (during a call) should auto-recover.

---

## 8. The forced-call edge case

When backend sends `CallCreated` with `isForced: true`, the home view-model's `_onForcedCallReceived` calls:

```dart
VoiceCommandService().disable();   // suppress STT during forced call setup
final token = await CallService().joinCall(...);
if (token != null) {
  await _onIncomingCallAccept(token);
} else {
  await ToastNotificationService().showError("Unable to join forced call.");
  VoiceCommandService().systemEnable();  // re-enable on failure
}
```

Why disable: forced calls bypass the resident's accept gesture entirely. The audio focus changes are abrupt. Active STT during this transition can cause the `AudioManager` to settle in a weird mode where call audio is muted.

The pattern: `disable()` before the audio-fragile operation, `systemEnable()` after — and `systemEnable` respects the `_manuallyDisabled` flag.

---

## 9. SME-worth gotchas

- **Voice commands start disabled.** Even if `VoiceCommandService.initialize()` runs successfully in `_setup()`, the service starts in `disabled` state. The 4-tap gesture on the bottom-left of the home screen is the activation trigger.
- **`_speech.cancel()` vs `_speech.stop()`** — they are NOT equivalent. `stop()` tries to deliver a final result and can hang in a bad state; `cancel()` does a hard kill. The codebase deliberately uses `cancel()` in error paths and `stop()` only when transitioning to TTS playback.
- **`KioskService.muteBeep` / `unmuteBeep` / `ensureTtsVolume`** — the audio-routing dance is essential. STT startup makes a system beep on `STREAM_NOTIFICATION`; TTS plays on `STREAM_MUSIC`. Muting notification while listening, unmuting before TTS, and forcing music volume audible together produce the seamless "no audible STT cycle" behavior. Don't refactor without testing on real Samsung hardware.
- **Wake-word matching is substring-based**. Adding "ok google" as a wake word would also match anytime someone said it during normal conversation. Keep wake words distinctive.
- **Adding a new command** requires: new `_matches*` predicate, new `_execute*` async method, new `WaypointService.log(LogEventType.voiceCommandDetected)` call, new branch in `_tryMatchCommand`. Order matters in `_tryMatchCommand` (more specific matches first).
- **The 10s command timeout** is from when `_startCommandTimeout` is called, *not* from the wake word detection. After "Yes?" TTS finishes (~1.5s), the resident has 10s to say a command. The countdown isn't surfaced to the UI — only the indicator widget changes color via `onStateChanged`.
- **`_speech.listen` uses `onDevice: true`**. The model is Android's offline STT. No cloud round-trip — privacy-preserving and works without network. But model availability isn't guaranteed (`error_server_disconnected`); recovery falls to the watchdog.
- **TTS uses `en-US` only**. If you ever localize, both `_tts.setLanguage` and the wake-word/command vocabularies need new variants.
- **CallService coupling**: `_executeAcceptCall` reads `CallService().pendingIncomingCall` directly. If that singleton is rearchitected, voice commands break.

---

## 10. Logging and observability

Every command-triggered action emits a `WaypointService.log(LogEventType.*)`:

| Event type | Triggered by |
|---|---|
| `voiceWakeWordDetected` | Wake word match |
| `voiceCommandDetected` | Command match (with `command` and `fullTranscript` metadata) |
| `voiceCommandError` | Error in `_execute*` methods, or `initialize()` failure |

These ship to CloudWatch via [[Tablet/Logging Stack]]. To debug "voice commands aren't working" reports:

1. Check CloudWatch for the device's log stream.
2. Look for `voiceWakeWordDetected` entries — if absent, the wake-word detection is failing.
3. Look for `voiceCommandDetected` after wake word — if absent, the command vocabulary mismatch is the issue (substring matching might be missing the resident's phrasing).
4. Look for `voiceCommandError` — explicit failure reason (e.g., "No incoming call.", "Unable to join call.").

---

## 11. Where this connects

- [[Tablet/Bootstrap & Module Wiring]] §3 — when `initialize()` runs at startup.
- [[Tablet/Kiosk Service Reference]] — `muteBeep`/`unmuteBeep`/`ensureTtsVolume` audio routing methods.
- [[Tablet/Domain - Calls]] — `CallService.startCall`/`joinCall`/`rejectCall` are the targets of the three commands.
- [[Tablet/Logging Stack]] — `WaypointService` event shipping.
- [[Tablet/Onboarding Walkthrough]] §6 — adaptive video quality also requires audio routing not to break, hence the careful disable-during-call pattern.
