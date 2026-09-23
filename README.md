# BoardFusion

An original two-mode board game project: **Dice Race** (Ludo-style, playable today) and
**Marble Loop** (Jackaroo-style, designed, implementation in the next milestone).
Original name, art, and code - inspired by the *genre* of games like Ludo Star, not copied from them.

## What is working now (milestone 2, verified)

- `index.html` - a complete, self-contained Dice Race game. Open it in any modern browser, no build step.
  - 2-4 players, local pass-and-play on one device
  - Optional Computer (AI) seats, so you can play solo against the phone
  - Full rule set: roll a 6 to leave base, captures, safe star squares, extra roll on 6 /
    capture / token home, three-6s forfeit, exact roll to finish, win detection
  - Touch and mouse input, responsive layout for phones and desktop
- `marble.html` - a complete, self-contained Marble Loop game (Jackaroo-style). Open it in any browser, no build step.
  - 2-player duel or 4-player 2v2 teams (partners opposite), local pass-and-play
  - Optional Computer (AI) seats
  - Standard 52-card deck, 4 cards per hand per round: A/K bring a marble out (or move 1/13),
    Q = 12, J = swap with any loop marble, 4 = backward 4, 7 = split between two marbles,
    number cards = face value
  - Captures send opponents back to base, safe start cells, exact count to finish, team win detection
  - Touch and mouse input, responsive layout
- Rules reference for both modes is in-app (Rules button) and below.

## Honest status

| Area | Status |
|---|---|
| Dice Race (Ludo-style), local play | Done, visually verified |
| Marble Loop (Jackaroo-style), local play | Done, visually verified |
| Online multiplayer | Dice Race rooms working and e2e-verified locally (two Chrome instances over the relay); needs deployment, reconnection, and anti-cheat validation. Marble Loop online not wired yet |
| Android | Capacitor wrapper config included; no signed APK/AAB built yet |
| Accounts, stats, voice chat, seasons | Not started (see roadmap) |

## Project layout

- `index.html` - Dice Race web game (board renderer on canvas + rules engine in plain JS, online rooms built in)
- `net.js` - room client used by the games (create/join, intents, host state broadcast)
- `marble.html` - Marble Loop web game (same engine style, card-driven)
- `server.js` - Node + `ws` room relay for online play (run: `npm install && npm start`, port 8787)
- `package.json` - server manifest
- `capacitor.config.json` - Android/iOS wrapper config
- `landing.html` - marketing landing page, served at /landing.html
- `icon.png` - original app icon
- `render.yaml`, `fly.toml` - deploy configs
- `LAUNCH.md` - go-live + marketing kit

## Testing

- `test-relay.js` - automated relay smoke test (room create/join, lobby, intent routing, state broadcast): ALL PASS
- `e2e-sync.js` - full browser test: two real headless Chrome instances create/join a room, sync game
  state and dice rolls through the relay, and the host rejects out-of-turn moves: ALL PASS.
  (This test caught a real bug: the dice button shipped disabled and has been fixed.)
- Run them with: `npm install && node test-relay.js && node e2e-sync.js` (Chrome required for e2e)

## Online multiplayer design

Host-authoritative rooms (same trust model as most web board games):

1. One player creates a room -> gets a 4-letter code; friends join with the code (lobby of 2-4).
2. The host browser runs the identical rules engine as local play and broadcasts state after every move.
3. Clients send intended moves (`{t:'move'}`) to the host; the relay (`server.js`) only routes messages.
4. Next steps before calling this production-ready: reconnect/resume, turn timers,
   server-side move validation (anti-cheat), TLS + a real deploy target.

## Android plan

The web game is the single codebase. Wrapping with Capacitor:

```
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init --web-dir www        # copy index.html into www/
npx cap add android
npx cap sync && npx cap open android   # build APK/AAB in Android Studio
```

The UI is already touch-first and viewport-locked, so no layout work is expected.
Play Store listing (name, icon, screenshots, age rating) still needs original artwork.

## Marble Loop design (Jackaroo-style, next milestone)

- Board: shared outer loop (one continuous track) + per-player safe lane and base, rendered on the same canvas engine.
- Moves come from a standard 52-card deck, 4-5 cards per hand, play one card per turn:
  A = start a marble or move 1, K = start or 13, Q = 12, J = swap with any marble on the loop,
  4 = move backward 4, 7 = split 7 between two marbles, others = face value.
- Landing on an opponent's marble sends it back to base.
- 2 players = free-for-all; 4 players = 2v2 with partners opposite, team wins together.
- Engine split: `deck.js` (shuffle/deal), `marble-rules.js` (legal moves per card), shared renderer.

## Going live and marketing

See LAUNCH.md: free Render deployment (public HTTPS subdomain, rooms work over wss),
Android release path, original store-listing copy, launch posts, and a checklist.
Deploy configs included: render.yaml (recommended free path), fly.toml (paid after trial).

## Roadmap

1. ~~Marble Loop playable locally~~ DONE (milestone 2)
2. ~~Online rooms for Dice Race~~ DONE (milestone 3, locally verified) - next: wire Marble Loop rooms,
   deploy the relay somewhere public, then harden (reconnect/resume, server-side validation)
3. Android wrapper + store assets
4. Profiles, stats, and match history
5. Nice-to-haves observed in the genre: quick-play blitz mode, in-game chat, seasonal cosmetics
   (all with original art and naming)

House simplifications in the current Marble Loop build: the split-7 lets you skip the remainder
if you choose (traditional rules require using it when possible), and a finished player's cards
are discarded rather than played for the partner. Both are noted for the next pass.

## Music

Dice Race includes a subtle loop of **“Happy Vibes” by Ruskerdax**, sourced from
https://opengameart.org/content/happy-vibes and dedicated to the public domain under CC0 1.0.
The exact license and redistribution notes are in [`MUSIC-LICENSE.md`](MUSIC-LICENSE.md).

## Usage analytics

- `analytics.js` sends a few anonymous events (visit, game start/finish with game and mode, public queue search/match/give-up) straight to the existing Supabase project. No cookies, no names or emails; a random browser ID in localStorage makes return visits countable. Bots, localhost, and opted-out devices are skipped, and it goes quiet by itself if the table is missing.
- `analytics-setup.sql` - paste once into the Supabase SQL editor. Creates the insert-only `bf_events` table, a private stats key, and the `bf_stats` function. Safe to re-run.
- `/stats.html` - owner stats page (needs the stats key from the SQL result). It also has a "Don't count this device" switch. Opening any page with `?notrack` does the same.
