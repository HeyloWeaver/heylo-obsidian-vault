---
type: setup
tags: [engineering, backend, frontend, tablet]
owner: Mike
updated: 2026-04-22
status: current
---
## AWS

`~/.aws/credentials` and `~/.aws/config`
`aws configure`
Log in and add [govalo-dev]

**npm / workspaces:** install and run app scripts from the **vault root** (`package.json` workspaces `frontend` + `backend`). Set up env files at the vault root:
- **`.env.example`** → **`.env`** (base — AWS, service URLs, DB defaults)
- **`.env.dev.example`** → **`.env.dev`** (cloud RDS creds) for dev, or **`.env.local.example`** → **`.env.local`** (local Docker DB) for local

See vault `README.md` (Local development) for `npm run dev`, `npx heylo --env local|dev`, and the `db:migrate` scripts.

## Backend

Add `development.env` to `backend/src/config/development.env`
Run `AWS_PROFILE=heylo-dev AWS_REGION=us-east-2 npm run start:dev -w heylo-api`

## Frontend

```
NEXT_PUBLIC_AWS_REGION=us-east-2 \
NEXT_PUBLIC_AWS_ACCOUNT_ID=984649215669 \
NEXT_PUBLIC_AWS_COGNITO_IDENTITY_POOL_ID=us-east-2:2ca8427e-6c7c-4cc0-9f1c-513c60fded8f \
NEXT_PUBLIC_AWS_COGNITO_USER_AUTH_CLIENT_ID=72keil7g6emsltkug4cjeipg9u \
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 npm run dev -w heylo-web
```

## Go

```
cd go/backend/appsync && go run -tags local .
```

## Tablet

### Prerequisites

**Install Flutter** (if not already installed):
```bash
brew install --cask flutter
flutter doctor
```

Fix any issues flutter doctor flags:
```bash
flutter doctor --android-licenses   # accept all with y
```

**NDK** — Android Studio → Settings → Languages & Frameworks → Android SDK → SDK Tools tab → check "Show Package Details" → NDK (Side by side) → tick `28.2.13676358` → Apply. Flutter will also auto-install it on first build if missing.

### Files needed (get from Chris)

- `tablet/android/app/google-services.json` — Firebase config. The file only ships with `com.heylo.app` (prod) registered. The dev and local package names (`com.heylo.app.dev`, `com.heylo.app.local`) have been added manually to the committed copy so all three flavors build.
- `tablet/android/key.properties` — signing keystore config. Only needed for `--release` builds (not debug/emulator runs).

### Install deps and run codegen

```bash
cd tablet
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

Run `build_runner` again any time you add or modify a `@JsonSerializable` model.

### Run on emulator (dev flavor → dev API)

Start the Android emulator from Android Studio (Device Manager → play button), then:

```bash
flutter run --flavor dev -t lib/main.dart
```

This hits `https://dev-api.heylo.tech`. No local backend needed.

**`local` flavor** (hits `http://10.0.2.2:4000` — emulator alias for Mac localhost) — requires the backend running locally first:
```bash
# from vault root:
AWS_PROFILE=heylo-dev AWS_REGION=us-east-2 npm run start:dev -w heylo-api

# then in tablet/:
flutter run --flavor local -t lib/main.dart
```

### Build a dev APK for a real tablet

Requires `key.properties` from Chris.

```bash
flutter build apk --flavor dev --release
adb install build/app/outputs/flutter-apk/app-dev-release.apk
```

Then set device owner and provision — see [[Tablet/Kiosk Mode Setup]] and [[Tablet/Kiosk Quick Start]].

### Troubleshooting

- **`null cannot be cast to non-null type kotlin.String`** — `key.properties` is missing. Fine for debug builds; the `build.gradle.kts` has been patched to fall back to debug signing when the file is absent.
- **`No matching client found for package name`** in `google-services.json` — the JSON only had prod registered. Dev and local entries have been added to the committed file.
- **NDK version mismatch warnings** — plugins pin `27.0.12077973` but `speech_to_text` needs `28.2.13676358`. Set `ndkVersion = "28.2.13676358"` in `build.gradle.kts` (already done).
