# Avox Roleplay — Website

Full website + REST backend for the **Avox Roleplay** SA-MP server.

It connects to the same MySQL database your gamemode uses (`s2_avx`) and uses
the same **Whirlpool** password hash as the in-game `WP_Hash` plugin — so a
player can register/login on the website with the very same credentials they use
in-game (and vice-versa).

## Features

- **Home** with live server status (UDP SA-MP query), player list and stats
- **Register / Login** with the exact Whirlpool hash format your gamemode uses
- **UCP** (User Control Panel) — profile, money, level, hours, faction, gang,
  vehicles, houses, change password
- **Leaderboards** — by level, wealth, hours, admin team
- **Banlist** — searchable & paginated
- **Admin panel** — user management, lock/unlock accounts, issue & remove bans
- **JWT** session auth, rate-limited login/register, Helmet for security headers
- **No build step** — vanilla HTML/CSS/JS frontend

## Folder layout

```
Website/
├── backend/
│   ├── server.js                # Express entrypoint
│   ├── config/db.js             # MySQL pool
│   ├── routes/                  # auth, user, stats, bans, server, admin
│   ├── middleware/auth.js       # JWT + admin guards
│   ├── utils/whirlpool.js       # WP_Hash-compatible hashing
│   ├── utils/sampQuery.js       # SA-MP UDP server query
│   ├── package.json
│   └── .env.example
└── public/                      # Static frontend (vanilla HTML/CSS/JS)
    ├── index.html  login.html  register.html  ucp.html
    ├── leaderboard.html  bans.html  admin.html
    ├── css/style.css
    └── js/common.js
```

## Prerequisites

- **Node.js 18+**
- Network access from the web server to your MySQL host **and** to the SA-MP
  port (UDP) for the live-status query

## Setup

```powershell
cd "C:\Avox RolePlay Samp\Avox RolePLay\Website\backend"

# 1. Install dependencies
npm install

# 2. Configure environment
copy .env.example .env
# Open .env and review:
#   - JWT_SECRET   → set to a long random string
#   - DB_*         → already pre-filled with the values from DL.pwn
#   - SAMP_HOST/PORT → already pre-filled with 45.146.252.233:7681
#   - ADMIN_MIN_LEVEL → minimum admin level needed to access /admin

# 3. Start the server
npm start
```

The site will be available on **http://localhost:3000**.

## How the password hashing works

The gamemode (`DL.pwn`) hashes passwords with the SA-MP `whirlpool` plugin:

```c
WP_Hash(PlayerInfo[playerid][pPassword], 129, inputtext);
```

This produces a **128-character UPPERCASE hexadecimal** string (Whirlpool
digest of the plaintext). The website does the exact same thing with the
`hash-wasm` library (see `backend/utils/whirlpool.js`):

```js
const hashed = (await whirlpool(plain)).toUpperCase();
```

So the value stored in `users.password` is identical whether the player
registered in-game or via the website.

## API reference (summary)

Public:
- `GET  /api/health`
- `GET  /api/server/status`     – Live SA-MP query (cached 5s)
- `GET  /api/stats/summary`     – Player / vehicle / house counts
- `GET  /api/stats/leaderboard?category=level|money|hours|admins&limit=`
- `GET  /api/bans?search=&page=&limit=`

Auth:
- `POST /api/auth/register`     `{ username, password }`
- `POST /api/auth/login`        `{ username, password }`
- `GET  /api/auth/me`           (JWT)
- `POST /api/auth/change-password` `{ currentPassword, newPassword }` (JWT)

User (JWT required):
- `GET  /api/user/profile`
- `POST /api/user/settings`     `{ accent? }`

Admin (JWT + adminlevel ≥ `ADMIN_MIN_LEVEL`):
- `GET    /api/admin/users?search=&page=&limit=`
- `POST   /api/admin/users/:uid/lock`     `{ locked: 0|1 }`
- `POST   /api/admin/bans`                `{ username, reason, permanent }`
- `DELETE /api/admin/bans/:id`

## Deploying behind a reverse proxy (optional)

Run the Node server on `127.0.0.1:3000` and proxy `https://yourdomain.tld → 3000`
with Nginx or Caddy. The app already trusts the first proxy hop
(`app.set('trust proxy', 1)`).

## Security warning

`server.cfg` in the repo contains the **rcon_password** and a **Discord bot
token**. If this repo is going to a public Git host or share, rotate those
secrets first. The website does **not** read or expose them.

## Troubleshooting

- **DB connection fails** – make sure your MySQL host (`DB_HOST` in `.env`)
  allows the IP your web server is running from.
- **Server status shows offline but the SA-MP server is up** – verify that
  outbound UDP to `SAMP_PORT` works from the web server; some hosts block
  outbound UDP.
- **Login says "Invalid username or password" with the correct credentials** –
  confirm the value in `users.password` is exactly 128 uppercase hex chars; if
  it isn't, an older import probably mangled the column.
