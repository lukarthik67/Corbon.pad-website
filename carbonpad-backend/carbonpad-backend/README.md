# carbon.pad — backend

A real Node.js + Express + MongoDB backend for the dontpad-style pad, replacing the
in-browser storage from the first version. Pages, password hashes, and access tokens
now live in MongoDB instead of the browser.

## What changed from the artifact version

- **Storage**: MongoDB (via Mongoose) instead of client-side storage. One `pads` collection.
- **Passwords**: hashed with `bcrypt` server-side — the plaintext password never leaves
  the unlock request, and is never stored.
- **Unique passwords across pages**: enforced with a partial unique index on
  `passwordHash` in MongoDB itself (not just application logic), so it holds even
  with many server instances writing at once. If a password is already taken,
  `POST /api/pads/:name/lock` returns `409` with a message asking for a different one.
- **Tokens**: on a correct password (or when a page is first locked), the server
  issues a random opaque token and stores it in that page's `tokens` array. The
  browser keeps the token in `localStorage` and sends it as `Authorization: Bearer <token>`
  on future requests, so the same browser doesn't need to retype the password.

## Project layout

```
server.js              Express app entry point
src/db.js               MongoDB connection (pooling configured here)
src/models/Pad.js       Mongoose schema + the unique password index
src/routes/pad.js       All /api/pads/* routes
src/middleware/rateLimit.js   Rate limiting for lock/unlock endpoints
public/index.html       Frontend (fetches the API above)
```

## Running it locally

1. Get a MongoDB connection string — either a local `mongod`
   (`mongodb://localhost:27017/carbonpad`) or a free MongoDB Atlas cluster.
2. `cp .env.example .env` and fill in `MONGODB_URI`.
3. `npm install`
4. `npm start`
5. Open `http://localhost:3000`

## API

| Method | Path                      | Body                | Notes |
|--------|---------------------------|----------------------|-------|
| GET    | `/api/pads/:name`         | —                    | Returns `{exists, hasPassword, locked, content}`. `content` is `null` if locked and no valid token. |
| PUT    | `/api/pads/:name`         | `{content}`          | Saves content. `403` if locked without a valid token. |
| POST   | `/api/pads/:name/unlock`  | `{password}`         | Verifies password, returns `{token, content}`. |
| POST   | `/api/pads/:name/lock`    | `{password}`         | Sets/changes password, returns `{token}`. `409` if the password is already used elsewhere. |
| DELETE | `/api/pads/:name/lock`    | — (needs auth header)| Removes the page's password. |

Auth header format: `Authorization: Bearer <token>`.

## Scaling this up

This is built stateless on purpose — no session data lives in server memory, all of
it (content, password hashes, tokens) is in MongoDB — so you can run as many copies
of this server as you want behind a load balancer without sticky sessions.

Things to reach for as traffic grows:

- **MongoDB Atlas** for a managed replica set (read replicas, automatic failover)
  and, once a single replica set isn't enough, **sharding** on `name` — pages are
  naturally independent documents, so sharding by page name scales close to linearly.
- **Indexes already in place**: unique index on `name` (fast lookups), partial
  unique index on `passwordHash` (fast global-uniqueness checks without a table scan).
- **Connection pooling**: tune `maxPoolSize` in `src/db.js` per instance based on
  how many concurrent requests each instance actually handles.
- **Caching hot pages**: if a small number of pages get most of the traffic, put
  Redis in front of reads (`GET /api/pads/:name`) and invalidate on writes.
- **Rate limiting store**: the current rate limiter keeps counts in memory, which
  only limits per-instance. Swap in `rate-limit-redis` so limits apply across
  all instances once you run more than one.
- **CDN / static hosting**: `public/index.html` has no server-side logic, so it can
  be served from a CDN or static host separately from the API if you want to scale
  them independently.
