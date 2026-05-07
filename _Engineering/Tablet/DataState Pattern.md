---
type: reference
tags: [tablet, patterns, error-handling]
owner: Mike
updated: 2026-05-06
status: current
---
# Tablet — `DataState<T>` Pattern

The Result/Either pattern used by every HTTP client (`controllers/*.dart`) in the tablet app. Sister doc to [[Tablet/Onboarding Walkthrough]] and [[Tablet/Stream Patterns Cookbook]].

> **Bottom line:** errors are values, not exceptions. Every controller method returns `Future<DataState<T>>`. Switch on type with `is DataError` / `is DataSuccess` to consume. Don't throw out of controllers; don't try/catch around controller calls.

---

## 1. The shape

Defined in `tablet/lib/models/response/data_state.dart`. Conceptually:

```dart
sealed class DataState<T> {
  final T? data;
  final DioException? error;
}

class DataSuccess<T> extends DataState<T> {
  DataSuccess(T data);
}

class DataError<T> extends DataState<T> {
  DataError(DioException error);
}
```

In TypeScript terms:

```ts
type DataState<T> =
  | { kind: 'success'; data: T }
  | { kind: 'error'; error: AxiosError };
```

Equivalent of Rust's `Result<T, E>` or `fp-ts`'s `Either<E, A>` — same idea, applied to async network calls.

---

## 2. Why this pattern

Three reasons:

1. **Consistent error propagation.** Every controller method has the same shape. Consumers know exactly what they get.
2. **No throwing across architectural boundaries.** Errors stay scoped to the layer that produced them. Services can decide what to do without nested try/catches everywhere.
3. **Type-safe error handling.** `is DataError` narrows the type at the call site. Same as TS discriminated-union narrowing.

Compared to JS conventions, this is closer to `[err, data] = await tuple(...)` or fp-ts than to bare `try/catch`. The decision was made deliberately and is consistently applied.

---

## 3. Producing — what controllers do

Every controller method follows the same skeleton:

```dart
Future<DataState<CallModel>> getCall(String callId) async {
  final url = "/call/$callId";
  try {
    final response = await HttpService().http.get(url);
    if (response.statusCode == HttpStatus.ok) {
      return DataSuccess(CallModel.fromJson(response.data));
    }
    return DataError(
      DioException(
        error: response.statusMessage,
        response: response,
        type: DioExceptionType.unknown,
        requestOptions: response.requestOptions,
      ),
    );
  } on DioException catch (e) {
    return DataError(e);
  }
}
```

Three branches:

- **2xx** with expected status → `DataSuccess(parsed)`.
- **Non-success status** (rare — Dio usually throws) → fabricate a `DioException` and return `DataError`.
- **Caught `DioException`** (network errors, 4xx/5xx Dio threw) → `DataError(e)`.

The repetitiveness is real. Could be DRYed with a helper; hasn't been. Don't add a helper unless the duplication starts genuinely causing bugs.

### Status-code gotchas

- **`POST` endpoints check for `HttpStatus.created` (201)**, not `ok` (200). NestJS POST default. See `searchCalls` in `call.controller.dart`.
- **`PATCH`/`DELETE` typically check for 200** but verify per-endpoint.
- If the backend ever changes the success status of an endpoint, the tablet silently turns successful responses into `DataError` because the status check fails.

---

## 4. Consuming — what services do

Standard pattern at the call site:

```dart
final res = await CallController().getCall(callId);

if (res is DataError) {
  print("getCall failed: ${res.error}");
  return null;
}

final call = res.data!;
// ...use call
```

Two important details:

- **Type narrowing.** After `is DataError` returns false, Dart's flow analysis narrows `res` to `DataSuccess<T>`. You can access `.data` knowing it exists.
- **`.data!` (force-unwrap).** `.data` is nullable on the base class. After the `is DataError` guard, you know it's a `DataSuccess<T>` and `.data!` is safe. Some places use `(res as DataSuccess<T>).data` instead — equivalent, slightly more explicit.

### Avoid this anti-pattern

```dart
// ❌ Don't try/catch around controller calls
try {
  final res = await CallController().getCall(callId);
  // ...
} catch (e) {
  // This will never fire — controllers don't throw
}
```

Controllers swallow exceptions and convert to `DataError`. A try/catch around a controller call is dead code. If you find one, the controller it wraps is buggy or someone used `throw` instead of `return DataError(...)`.

### Inverted check (`is DataSuccess`)

Equally valid; sometimes clearer when the success path is short:

```dart
final res = await CallController().pingCall(callId);
if (res is DataSuccess) {
  return; // happy path
}
// error handling below
```

---

## 5. Composing with `Future.wait`

When you need multiple controller calls in parallel:

```dart
final res = await Future.wait([
  CallController().getCall(callId),
  CallController().connectCall(callId),
]);

if (res.any((state) => state is DataError)) {
  // at least one failed — handle, log, bail
  return null;
}

final call = (res.first as DataSuccess<CallModel>).data;
// ...
```

`Future.wait` returns `List<DataState>` (technically `List<dynamic>` due to type erasure). Two ways to handle:

1. **`.any((s) => s is DataError)`** — if any failed, bail out wholesale. Used in `CallService.joinCall`.
2. **Per-result inspection** — when each result has different recovery semantics.

There's no built-in "short-circuit on first error" for `Future.wait` — the parallel calls all run to completion. If you need short-circuit, chain sequentially with `await` between each.

---

## 6. `DataState<void>` — for endpoints with no body

PATCH endpoints that just signal success/failure return `DataState<void>`:

```dart
Future<DataState<void>> connectCall(String callId) async {
  // ...
  if (response.statusCode == HttpStatus.ok) {
    return DataSuccess(null);
  }
  // ...
}
```

Consume the same way:

```dart
final res = await CallController().connectCall(callId);
return res is DataSuccess;   // bool: did it succeed?
```

The `null` inside `DataSuccess(null)` is just the value — no payload was meaningful. Don't access `.data` on `DataState<void>`.

---

## 7. Where errors come from

If you're inspecting a `DataError`, three places to look on `error.error` (a `DioException`):

| Field | Meaning |
|---|---|
| `error.response?.statusCode` | HTTP status (4xx, 5xx, etc.) |
| `error.response?.data` | Backend error body (often `{"error": "ErrorCode", "message": "..."}`) |
| `error.message` | Dio's error message (network-level) |
| `error.type` | `DioExceptionType` — `connectionError`, `connectionTimeout`, `receiveTimeout`, `unknown`, etc. |

Example of a typed-error decision in a service:

```dart
final res = await CallController().createCall(staffUserId: id);
if (res is DataError) {
  final code = res.error?.response?.data?["error"];
  if (code == "SPNotAssignedToSiteException") {
    await ToastNotificationService().showError("No staff currently assigned.");
  } else {
    await ToastNotificationService().showError("Unable to start call.");
  }
  return null;
}
```

The backend uses string codes in the error body. The service maps codes to user-facing messages. Don't put user-facing strings in the controller layer — keep them in the service or view-model.

---

## 8. The pingCall liveness contract

A non-obvious use of `DataError`. `CallService` uses status codes inside `DataError` as control flow:

```dart
final result = await CallController().pingCall(callId);
if (result is DataError) {
  final statusCode = result.error?.response?.statusCode;
  // 403 = forbidden (call ended/invalid), 404 = not found
  if (statusCode == 403 || statusCode == 404) {
    // The call is dead — clean up
    _callPingTimer?.cancel();
    _activeCall = null;
    await _cleanUpCallClient();
  }
}
```

This is a deliberate cross-layer contract: backend signals "this call no longer exists" via 403/404. Tablet treats those specifically as "stop pinging, clean up." Other error codes (network blips, etc.) are ignored — the next ping will retry.

---

## 9. Anti-patterns and gotchas

- **Don't throw out of a controller.** Convert to `DataError`. Throwing breaks the contract every consumer relies on.
- **Don't try/catch around controller calls.** Controllers don't throw. The catch is dead.
- **Don't access `.data` without checking `is DataError` first.** It's nullable on the base class.
- **`DataSuccess<List<T>>` of empty list ≠ `DataError`.** An empty list is a successful response. Distinguish "no data" from "request failed" — they're different at the type level.
- **Status-code mismatches are silent.** If the backend changes 200→201 and the controller still checks `HttpStatus.ok`, every call gets converted to `DataError` and the UI shows "failed" with no obvious cause. Verify status codes when contracts change.
- **`Future.wait` with `DataState`s doesn't short-circuit.** All parallel calls complete even if one errors early. Use sequential awaits if short-circuit matters.
- **`DataError` doesn't include the request URL by default** — but `error.error.requestOptions.uri` does. Useful for error-logging.

---

## 10. TypeScript reference impl

If it helps anchor the pattern, this is what the equivalent looks like in TS:

```ts
type DataState<T> =
  | { kind: 'success'; data: T }
  | { kind: 'error'; error: AxiosError };

async function getCall(id: string): Promise<DataState<Call>> {
  try {
    const res = await http.get(`/call/${id}`);
    return res.status === 200
      ? { kind: 'success', data: Call.fromJson(res.data) }
      : { kind: 'error', error: makeError(res) };
  } catch (e) {
    return { kind: 'error', error: e as AxiosError };
  }
}

// Consume
const res = await getCall(id);
if (res.kind === 'error') return null;
const call = res.data;  // narrowed
```

Same shape, same ergonomics, same separation of concerns.

---

## Where this pattern lives in the codebase

- Definition: `tablet/lib/models/response/data_state.dart`
- Producer (every controller): `tablet/lib/controllers/call.controller.dart`, `device_status.controller.dart`, `app_config.controller.dart`, etc.
- Consumer (every service that hits HTTP): `tablet/lib/services/call.service.dart`, `auth.service.dart`, `device_status.service.dart`, etc.
- Cross-layer contract example (status code as control flow): `CallService._callPingTimer` in `call.service.dart`.
