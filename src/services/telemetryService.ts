/**
 * Telemetry service for Rung Royale.
 *
 * Logs (state, action, outcome) tuples to Firestore so we can later train an
 * imitation / reinforcement learning model on real gameplay.
 *
 * Design notes:
 *   - Only the ACTING player's hand is logged. We never leak opponents' hidden
 *     cards into training data; the training target must match what a player
 *     actually observes.
 *   - Player IDs are sha256-hashed so the raw UID never leaves the client.
 *   - Writes are fire-and-forget; failures do not disrupt gameplay.
 *   - Gate this behind a feature flag + user consent per privacy policy.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Card, Suit } from '../types';
import type { AIDifficulty } from '../lib/gameLogic';

export const TELEMETRY_ENABLED_KEY = 'rr_telemetry_enabled';

export const isTelemetryEnabled = (): boolean => {
  try {
    const stored = localStorage.getItem(TELEMETRY_ENABLED_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return false;
  }
};

export const setTelemetryEnabled = (on: boolean) => {
  try {
    localStorage.setItem(TELEMETRY_ENABLED_KEY, on ? 'true' : 'false');
  } catch {
    /* noop */
  }
};

/** Hash a user ID to a short stable token. Not crypto-secure; good enough for
 * lightweight anonymization. */
const hashId = async (id: string): Promise<string> => {
  try {
    const enc = new TextEncoder().encode(id);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes.slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return 'unknown';
  }
};

export interface PlayCardEvent {
  matchId: string;
  handNumber: number;          // which deal in the match
  trickNumber: number;         // which trick within the hand
  playerId: string;            // will be hashed
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  position: string;            // bottom | left | top | right
  trumpSuit: Suit | null;
  leadSuit: Suit | null;
  aceOffMode: boolean;
  actorHand: { rank: string; suit: string }[]; // hand BEFORE play
  trickSoFar: { playerId: string; card: { rank: string; suit: string } }[];
  legalActions: { rank: string; suit: string }[];
  actionCard: { rank: string; suit: string };
  teamScoresBefore: { team1: number; team2: number };
}

export interface TrickResolvedEvent {
  matchId: string;
  handNumber: number;
  trickNumber: number;
  winnerPlayerId: string;
  winnerTeam: 1 | 2;
  trumpSuit: Suit | null;
}

export interface RoundResolvedEvent {
  matchId: string;
  handNumber: number;
  winningTeam: 1 | 2;
  result: 'set' | 'court' | 'super_court' | 'none';
  team1Tricks: number;
  team2Tricks: number;
}

const safeStrip = (c: Card) => ({ rank: c.rank, suit: c.suit });

export const logPlayCard = async (event: PlayCardEvent) => {
  if (!isTelemetryEnabled()) return;
  try {
    const hashed = await hashId(event.playerId);
    await addDoc(collection(db, 'game_events'), {
      type: 'play_card',
      ...event,
      playerId: hashed,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[telemetry] play_card write failed', err);
  }
};

export const logTrickResolved = async (event: TrickResolvedEvent) => {
  if (!isTelemetryEnabled()) return;
  try {
    const hashed = await hashId(event.winnerPlayerId);
    await addDoc(collection(db, 'game_events'), {
      type: 'trick_resolved',
      ...event,
      winnerPlayerId: hashed,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[telemetry] trick_resolved write failed', err);
  }
};

export const logRoundResolved = async (event: RoundResolvedEvent) => {
  if (!isTelemetryEnabled()) return;
  try {
    await addDoc(collection(db, 'game_events'), {
      type: 'round_resolved',
      ...event,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[telemetry] round_resolved write failed', err);
  }
};

/** Helper for callers to shape Card[] for the log payload. */
export const stripHand = (hand: Card[]) => hand.map(safeStrip);
export const stripCard = safeStrip;
