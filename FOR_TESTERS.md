# Rung Royale — Testing Instructions

Hey, thanks for helping test! Here's what to do and what to look for.

## Install (Android only — iOS coming later)

1. You'll get an `.apk` file via WhatsApp, email, or Google Drive.
2. On your Android phone, tap the file.
3. Android will warn about "Unknown source" → Settings → toggle **Allow from this source** → back, tap **Install**.
4. Once installed, the app appears in your app drawer as **Rung Royale** with an emerald trophy icon.

**If you already have a previous test version installed** and tap refuses to install, uninstall the old app first.

## Accounts

- **Guest** — instant. No sign-up, no email. Best for a quick first game.
- **Google** — signs in with your Google account. Progress saved across installs.

## What to try (in order)

1. **Practice Match.** Play a full round solo against three AI bots. Check the AI feels challenging (not random, not super-genius — somewhere in between).
2. **Stats tab** (bottom nav, trophy icon). After a round, check your wins/sets/courts numbers went up.
3. **Online Arena.** Click this button — it should either join an existing public match or create a new lobby with you waiting. If waiting, share the lobby code with another tester and see if they can join.
4. **Ranked Battle.** Same flow but with trophy stakes.
5. **Create Private.** Make a private lobby, share the 6-character code with a friend. They can enter the code at the home screen to join.
6. **Theme picker** (Settings gear, top right of game). Try a few themes.
7. **Sign out → Sign in as Guest → back to Google.** Make sure profile info switches correctly.

## What to report

For each bug or weird thing, if possible include:

- **What you did** — step by step.
- **What you expected** — e.g. "the popup should close".
- **What actually happened** — e.g. "the popup stayed and the back button stopped working".
- **Screenshot** — press Power + Volume Down on most Androids.
- **Your phone model** — e.g. Samsung Note 20, Pixel 7, OnePlus 12.
- **Orientation when it happened** — portrait or landscape.

Things I specifically want your eye on:

- **AI behavior** — does the bot play its trumps at dumb times? Does your partner (top position) seem to help you or work against you? Any sequence where the bot CLEARLY should have played differently.
- **Cards & layout** — do your cards overlap too much? Can you always read the rank/suit? Do the opponents' card backs look right?
- **Popups and buttons** — round-end "Court!" popup, settings drawer, theme picker — anything that overflows, gets cut off, or buttons you can't reach.
- **Orientation** — when you enter a game, does it smoothly rotate to landscape? When you exit, does it return to portrait?
- **Status bar** — the phone's time/wifi/battery bar at the top. It should be hidden during gameplay. If you see it during a game, report it.
- **Navigation bar** — the bottom bar with home/back/apps buttons. Also should be hidden during gameplay.
- **Sign-in** — any errors signing in with Google or Guest. Any time the app seems frozen on a black screen after sign-in.
- **Multiplayer** — creating and joining lobbies, leaving matches mid-game, what happens if you close the app and reopen.

## Known issues (already on the list)

- App icons are a placeholder design ("RR" trophy). Real brand icon coming.
- Shop buttons give coins/gems for free (real in-app purchases come after store approval).
- Friends tab is stubbed — search doesn't find real users yet.
- Telemetry is on by default. You can turn it off in Settings → Privacy (if that toggle isn't there yet, flag it).

## How to reach me

Send reports (text + screenshot) to: **<your WhatsApp number / email here>**

Or post in the WhatsApp test group if you were added to one.

Thanks again — every bug you find now is one less bug after launch.
