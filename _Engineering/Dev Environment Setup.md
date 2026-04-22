---
type: setup
tags: [engineering, backend, frontend]
owner: Mike
updated: 2026-04-21
status: current
---
## AWS

`~/.aws/credentials` and `~/.aws/config`
`aws configure`
Log in and add [govalo-dev]

**npm / workspaces:** install and run app scripts from the **vault root** (`package.json` workspaces `frontend` + `backend`). Copy **`.env.example`** → **`.env`** at the vault root for shared dev env; see vault `README.md` (Local development) for `npm run dev`, `npx heylo`, and flags.

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

