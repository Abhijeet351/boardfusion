# BoardFusion Launch Kit

Everything here is original copy you can use as-is or edit. Remaining choices that need you:
a hosting account (free), a Google Play developer account if you want the Play Store ($25 one-time),
the final app name, and any marketing budget.

## 1. Go live on the free path (recommended: Render)

Why Render: its free tier gives a public HTTPS subdomain (boardfusion.onrender.com) with no
payment method, and WebSockets work. Verified limits (render.com docs, Sept 2026): free web
services sleep after 15 min idle and take ~1 min to wake; 750 free instance-hours/month.
Fly.io is NOT free ongoing - its trial is 2 machine-hours or 7 days, then requires payment
(fly.io/docs/about/free-trial). render.yaml and fly.toml are both included if you switch later.

Steps:
1. Put this folder in a GitHub repo (private is fine).
2. render.com > sign up free > New > Blueprint > select the repo. Render reads render.yaml:
   build `npm install`, start `npm start`, health check /healthz.
3. You get https://<yourname>.onrender.com - the game at /, rooms at /ws, landing page at /landing.html.
4. Players open the URL, tap Online > Create room, share the 4-letter code. No config needed:
   the room panel auto-fills the server address from the page URL (wss on HTTPS).
Known free-tier caveat: after 15 idle minutes the first join takes ~1 min while Render wakes the service.
An uptime monitor (e.g. UptimeRobot free tier) pinging /healthz every 5 min keeps it warm.

## 2. Android release path

- The Capacitor wrapper config is included; building needs Android Studio (free) on your machine:
  npx cap init --web-dir www (copy index.html, marble.html, net.js, icon.png into www/) >
  npx cap add android > npx cap sync > open in Android Studio > Build APK/AAB.
- Google Play Store listing requires a Play Developer account: $25 one-time (your call, not paid yet).
- Store listing still needs: final name confirmation, privacy policy URL (required because of online
  play), content rating questionnaire, screenshots (use the verified ones in this kit).

## 3. Store listing draft (original copy)

Title: BoardFusion - Dice Race & Marble Loop
Short description (80 chars): Two classic board games. One room code. Play friends anywhere, free.
Full description:
Dice Race is the dice-board classic you grew up with: roll a 6 to break out, capture your rivals,
and race all four tokens home. Marble Loop flips the formula: play cards, split a 7 between two
marbles, swap with a Jack, and out-think the table in 1v1 duels or 2v2 teams.
- Online rooms: share a 4-letter code, play in real time
- Pass-and-play on one phone, or add computer players
- No accounts, no ads, no pay-to-win
- Touch-first design that also works on desktop
Category: Board. Tags: ludo-style, jackaroo-style, multiplayer, family.

## 4. Launch posts (edit freely)

WhatsApp/Telegram groups:
"I made a free board game site - Dice Race (ludo-style) + Marble Loop (jackaroo-style cards).
No install, no signup. Open <URL>, tap Online, and send me the room code. Loser buys chai."

Instagram/X:
"Built a free 2-in-1 board game: dice classic + a card-driven marble race. 2v2 teams, online
rooms, zero ads. Link in bio - who wants a game?"

Product Hunt / Reddit (r/WebGames, r/incremental_games no - r/WebGames yes):
"BoardFusion - two classic board games in the browser, online rooms with a 4-letter code,
pass-and-play, computer players. Free, no accounts. Would love feedback on game feel."

## 5. Launch checklist

[ ] Pick final name (BoardFusion is a placeholder - check trademark + Play Store name availability)
[ ] Deploy to Render, test a full online game between your phone and a friend's phone
[ ] Add UptimeRobot monitor on /healthz (keeps free tier warm)
[ ] Privacy policy page (free generators exist; required for Play Store + good practice)
[ ] Play Developer account ($25) if doing the Play Store
[ ] Build AAB in Android Studio, upload with icon.png + screenshots + listing copy above
[ ] Post to 3 communities from section 4, ask for game-feel feedback
[ ] Optional later: custom domain (~$10/yr), stats/profiles, Marble Loop online rooms
