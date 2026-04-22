# Rung Royale — Privacy Policy

Last updated: 2026-04-23

This privacy policy explains what information Rung Royale (the "app", "we", "us") collects when you use it, how we use that information, and what choices you have. Both the Apple App Store and Google Play Store require apps to publish a privacy policy at a public URL — host this document at a stable URL (e.g. https://rungroyale.app/privacy) before submitting.

## 1. Who we are

Rung Royale is an independent mobile card game. If you have questions about this policy, email **support@rungroyale.app**.

## 2. Information we collect

We collect the minimum needed to run the app.

**Account information.** When you sign in with Google, Firebase Authentication receives your Google user ID, email address, display name, and profile photo URL. If you play as a Guest, we create an anonymous Firebase user — no email or identifying information is attached to that account.

**Game data.** We store your profile in Firebase Firestore: your display name, avatar, in-game stats (wins, sets, courts, super courts, win streaks, XP, trophies, badges, friends list), and in-game currency balances (coins, gems). This data is linked to your Firebase user ID.

**Gameplay telemetry.** When you play, the app logs each card play and each trick outcome to a Firebase collection called `game_events`. The data captured per event includes: the acting player's observed game state (their own hand, the current trick, trump, legal moves), which card they played, and the trick winner. **We never log other players' hidden cards.** Your user ID is hashed (SHA-256, first 8 bytes) before being written, so the raw identifier does not leave your device.

We use this telemetry only to train and improve AI opponents. You can disable telemetry at any time in the app Settings.

**Device / technical information.** Firebase may log anonymized crash and performance data (app version, device model, OS version). No personal identifiers are attached.

**What we do NOT collect.** We do not collect your contacts, location, camera or microphone input, SMS, call logs, or any health/fitness data. We do not use third-party advertising SDKs, ad tracking, or behavioral profiling.

## 3. How we use information

- **To authenticate you** — Firebase Authentication verifies your identity on each session.
- **To save your game state** — Firestore stores your profile and lets matches reconnect if you rejoin.
- **To match you with other players** — the multiplayer lobby system reads open public matches and shows them to you.
- **To improve AI opponents** — hashed gameplay telemetry trains a machine-learning model that plays better than the current heuristic. The training pipeline runs offline; your data is not sold or shared with any third party.
- **To diagnose crashes** — anonymized crash reports help us fix bugs.

## 4. Data sharing

We do not sell or rent your data. We share data with:

- **Google Firebase** (Authentication, Firestore, Analytics, Crashlytics) — Google's standard Firebase services, which operate under Google's privacy policy. They process the data on our behalf as a sub-processor.
- **Law enforcement** — only when legally compelled.

## 5. Children's privacy

Rung Royale is rated 4+ / Everyone and contains no objectionable content, but we do not knowingly collect data from children under 13 (or the equivalent age in your country). If you believe a child has created an account, email support and we will delete the account.

## 6. Your choices

- **Sign out** — signs out the current session.
- **Delete your account** — in the app's Settings, tap *Delete my profile*. This removes your Firestore profile immediately. Your Firebase Auth record is deleted within 30 days.
- **Disable telemetry** — in Settings → Privacy, toggle *Anonymous gameplay analytics* OFF. Previously logged events remain in the training pool; future events stop being logged.
- **Export your data** — email support@rungroyale.app and we will send you a JSON export of your profile within 30 days.

## 7. Data retention

Profile data is retained while your account exists. Gameplay telemetry is retained indefinitely in hashed form for AI training purposes. If you delete your account, your profile is removed; telemetry events tagged with the hashed ID derived from your deleted UID are retained, since the link back to you is irreversible.

## 8. Security

Firebase services are hosted on Google Cloud with industry-standard encryption in transit (TLS) and at rest. Firestore security rules deny read/write access to other users' data. No system is completely secure — use a strong password on your Google account.

## 9. International data transfers

Firebase is a global service. Your data may be stored and processed in any country where Google operates data centers, including the United States. By using Rung Royale you consent to this transfer.

## 10. Changes to this policy

We may update this policy from time to time. Material changes will be announced in-app. The "Last updated" date at the top reflects the most recent change.

## 11. Contact

support@rungroyale.app
