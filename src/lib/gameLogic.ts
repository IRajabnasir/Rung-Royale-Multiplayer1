/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rung / Court Piece game logic + AI.
 *
 * AI difficulty tiers:
 *   - 'easy'    : legacy behavior, picks "highest playable" with no strategy.
 *   - 'medium'  : partner-aware, trump-disciplined, dumps low when losing.
 *   - 'hard'    : medium + card-counting (voids, unseen cards), long-suit
 *                 leads, trump-saving, smart secure/court decisions.
 *
 * Partnership: 'bottom'+'top' (team 1)  vs  'left'+'right' (team 2).
 */

import { Card, Rank, Suit, Player, PlayerPosition, MatchState } from '../types';
import { SUITS, RANKS, RANK_VALUE } from '../constants';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface Trick {
  cards: { playerId: string; card: Card }[];
  leadSuit: Suit | null;
}

/* ---------- Deck + shuffle ---------- */

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      deck.push({ suit, rank, id: `${rank}-${suit}`, value: RANK_VALUE[rank] });
    });
  });
  return deck;
};

export const shuffle = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

/* ---------- Card comparison ---------- */

/**
 * Returns:
 *   > 0 if cardA beats cardB
 *   < 0 if cardB beats cardA
 *   0   if neither beats the other (both off-lead, off-trump)
 */
export const compareCards = (
  cardA: Card,
  cardB: Card,
  leadSuit: Suit,
  trumpSuit?: Suit,
  aceOffMode?: boolean
): number => {
  const getVal = (c: Card) => {
    if (aceOffMode && c.rank === 'A') return 1;
    return RANK_VALUE[c.rank];
  };

  if (trumpSuit) {
    if (cardA.suit === trumpSuit && cardB.suit !== trumpSuit) return 1;
    if (cardB.suit === trumpSuit && cardA.suit !== trumpSuit) return -1;
  }

  if (cardA.suit === cardB.suit) {
    return getVal(cardA) - getVal(cardB);
  }

  if (cardA.suit === leadSuit) return 1;
  if (cardB.suit === leadSuit) return -1;

  return 0;
};

export const determineTrickWinner = (
  trick: Trick,
  trumpSuit?: Suit,
  aceOffMode?: boolean
): string => {
  if (!trick.cards.length || !trick.leadSuit) return '';
  let winner = trick.cards[0];
  for (let i = 1; i < trick.cards.length; i++) {
    if (compareCards(trick.cards[i].card, winner.card, trick.leadSuit, trumpSuit, aceOffMode) > 0) {
      winner = trick.cards[i];
    }
  }
  return winner.playerId;
};

/* ---------- Hand utilities ---------- */

export const sortHand = (hand: Card[]): Card[] => {
  const SUIT_ORDER: Record<Suit, number> = {
    diamonds: 0, clubs: 1, spades: 2, hearts: 3,
  };
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
  });
};

export const initializePlayers = (aiEnabled: boolean = true): Player[] => {
  return [
    { id: 'player-1', name: 'You',             position: 'bottom', hand: [], isAI: false,     isSir: false, isDealer: false },
    { id: 'player-2', name: 'Alpha',           position: 'left',   hand: [], isAI: aiEnabled, isSir: false, isDealer: false },
    { id: 'player-3', name: 'Beta (Partner)',  position: 'top',    hand: [], isAI: aiEnabled, isSir: false, isDealer: false },
    { id: 'player-4', name: 'Gamma',           position: 'right',  hand: [], isAI: aiEnabled, isSir: false, isDealer: false },
  ];
};

export const canPlayCard = (card: Card, hand: Card[], leadSuit?: Suit): boolean => {
  if (!leadSuit) return true;
  const hasLeadSuit = hand.some(c => c.suit === leadSuit);
  if (hasLeadSuit) return card.suit === leadSuit;
  return true;
};

export const getLegalMoves = (hand: Card[], leadSuit?: Suit): Card[] => {
  return hand.filter(c => canPlayCard(c, hand, leadSuit));
};

/* ---------- Team helpers ---------- */

const TEAM_OF: Record<PlayerPosition, 1 | 2> = {
  bottom: 1, top: 1,
  left: 2, right: 2,
};
export const teamOf = (pos: PlayerPosition): 1 | 2 => TEAM_OF[pos];

/* ---------- AI context (what the AI "knows") ---------- */

export interface AIContext {
  player: Player;
  currentTrick: Trick;
  trumpSuit?: Suit;
  aceOffMode?: boolean;
  difficulty?: AIDifficulty;
  /**
   * Every card played across the whole hand so far (across all resolved tricks).
   * Used for card counting (hard difficulty).
   */
  playedCards?: Card[];
  /**
   * Set of playerIds already known to be void of a given suit (from sloughing).
   * Optional; derivable from history but cheaper if caller maintains it.
   */
  voids?: Record<string, Set<Suit>>;
  /**
   * The partner's playerId for the acting player, if known.
   * In 4-player Rung this is the player sitting opposite.
   */
  partnerId?: string;
  /**
   * All players in turn order for this trick, so we can tell "who still has to play".
   */
  trickPlayerOrder?: string[];
}

/* ---------- AI helpers ---------- */

const rankVal = (c: Card, aceOffMode?: boolean) =>
  aceOffMode && c.rank === 'A' ? 1 : RANK_VALUE[c.rank];

const lowestOf = (cards: Card[], aceOffMode?: boolean): Card =>
  [...cards].sort((a, b) => rankVal(a, aceOffMode) - rankVal(b, aceOffMode))[0];

const highestOf = (cards: Card[], aceOffMode?: boolean): Card =>
  [...cards].sort((a, b) => rankVal(b, aceOffMode) - rankVal(a, aceOffMode))[0];

const suitBuckets = (hand: Card[]): Record<Suit, Card[]> => {
  const out: Record<Suit, Card[]> = { hearts: [], diamonds: [], clubs: [], spades: [] };
  hand.forEach(c => out[c.suit].push(c));
  return out;
};

const currentTrickWinner = (
  trick: Trick,
  trumpSuit?: Suit,
  aceOffMode?: boolean
): { playerId: string; card: Card } | null => {
  if (!trick.cards.length || !trick.leadSuit) return null;
  let w = trick.cards[0];
  for (let i = 1; i < trick.cards.length; i++) {
    if (compareCards(trick.cards[i].card, w.card, trick.leadSuit, trumpSuit, aceOffMode) > 0) {
      w = trick.cards[i];
    }
  }
  return w;
};

/**
 * Is the given candidate card a winner against the current trick state?
 * If I play it now, will I still be the highest when I'm done?
 * (Only true for the current trick as it stands; opponents yet to play could still beat me.)
 */
const cardBeatsTrick = (
  candidate: Card,
  trick: Trick,
  trumpSuit?: Suit,
  aceOffMode?: boolean
): boolean => {
  if (!trick.cards.length || !trick.leadSuit) return true;
  const winner = currentTrickWinner(trick, trumpSuit, aceOffMode);
  if (!winner) return true;
  return compareCards(candidate, winner.card, trick.leadSuit, trumpSuit, aceOffMode) > 0;
};

const cheapestWinner = (
  candidates: Card[],
  trick: Trick,
  trumpSuit?: Suit,
  aceOffMode?: boolean
): Card | null => {
  const winners = candidates.filter(c => cardBeatsTrick(c, trick, trumpSuit, aceOffMode));
  if (!winners.length) return null;
  return lowestOf(winners, aceOffMode);
};

/** Unseen cards of a suit from the acting player's perspective. */
const unseenOfSuit = (suit: Suit, myHand: Card[], playedCards: Card[] = []): number => {
  const seen = myHand.filter(c => c.suit === suit).length
             + playedCards.filter(c => c.suit === suit).length;
  return Math.max(0, 13 - seen);
};

/** Highest remaining rank of a suit given what we've seen. */
const highestRemainingRank = (
  suit: Suit,
  myHand: Card[],
  playedCards: Card[] = [],
  aceOffMode?: boolean
): number => {
  const seenRanks = new Set<Rank>();
  myHand.filter(c => c.suit === suit).forEach(c => seenRanks.add(c.rank));
  playedCards.filter(c => c.suit === suit).forEach(c => seenRanks.add(c.rank));
  const orderedDesc: Rank[] = aceOffMode
    ? ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A']
    : ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  for (const r of orderedDesc) {
    if (!seenRanks.has(r)) return aceOffMode && r === 'A' ? 1 : RANK_VALUE[r];
  }
  return 0;
};

/* ---------- AI: Easy (legacy, deliberately naive) ---------- */

const easyMove = (ctx: AIContext): Card => {
  const { player, currentTrick, trumpSuit, aceOffMode } = ctx;
  const legal = getLegalMoves(player.hand, currentTrick.leadSuit ?? undefined);
  if (!legal.length) return player.hand[0];

  if (!currentTrick.leadSuit) return highestOf(legal, aceOffMode);

  // Play "highest" among legal, using compareCards as the ordering primitive.
  const sorted = [...legal].sort((a, b) =>
    compareCards(a, b, currentTrick.leadSuit!, trumpSuit, aceOffMode)
  );
  return sorted[sorted.length - 1];
};

/* ---------- AI: Medium (partner-aware, trump-disciplined) ---------- */

const mediumMove = (ctx: AIContext): Card => {
  const { player, currentTrick, trumpSuit, aceOffMode, partnerId } = ctx;
  const legal = getLegalMoves(player.hand, currentTrick.leadSuit ?? undefined);
  if (!legal.length) return player.hand[0];

  // --- LEADING ---
  if (!currentTrick.leadSuit) {
    // Lead the highest card of my longest non-trump suit.
    const buckets = suitBuckets(player.hand);
    const candidates: Card[] = [];
    (Object.keys(buckets) as Suit[])
      .filter(s => s !== trumpSuit && buckets[s].length > 0)
      .sort((a, b) => buckets[b].length - buckets[a].length)
      .forEach(s => candidates.push(highestOf(buckets[s], aceOffMode)));

    if (candidates.length) return candidates[0];
    // Only trumps left: lead highest trump.
    return highestOf(legal, aceOffMode);
  }

  // --- FOLLOWING ---
  const winner = currentTrickWinner(currentTrick, trumpSuit, aceOffMode);
  const partnerIsWinning = !!winner && winner.playerId === partnerId;

  const leadSuit = currentTrick.leadSuit;
  const hasLead = player.hand.some(c => c.suit === leadSuit);

  if (partnerIsWinning) {
    // Partner is winning — dump my lowest legal card. Don't waste high cards
    // and don't over-trump partner.
    return lowestOf(legal, aceOffMode);
  }

  // Opponent is winning. Can I beat it cheaply?
  const cheap = cheapestWinner(legal, currentTrick, trumpSuit, aceOffMode);
  if (cheap) {
    // Avoid trumping if I could win with a same-suit card.
    if (trumpSuit && cheap.suit === trumpSuit && hasLead) {
      // I have the lead suit but my winning play is a trump? That shouldn't
      // happen (if I have the lead suit I must follow it). Defensive fallback.
      return cheap;
    }
    return cheap;
  }

  // Can't win — sluff lowest.
  // Prefer not to discard trump or high cards from long suits.
  if (!hasLead && trumpSuit) {
    const nonTrump = legal.filter(c => c.suit !== trumpSuit);
    if (nonTrump.length) return lowestOf(nonTrump, aceOffMode);
  }
  return lowestOf(legal, aceOffMode);
};

/* ---------- AI: Hard (card-counting + lookahead) ---------- */

const hardMove = (ctx: AIContext): Card => {
  const { player, currentTrick, trumpSuit, aceOffMode, partnerId, playedCards = [] } = ctx;
  const legal = getLegalMoves(player.hand, currentTrick.leadSuit ?? undefined);
  if (!legal.length) return player.hand[0];

  const buckets = suitBuckets(player.hand);

  // --- LEADING ---
  if (!currentTrick.leadSuit) {
    // Score each suit as a leading candidate:
    //   + length (more cards = more likely our highs survive)
    //   + whether we hold the currently highest outstanding rank
    //   - if unseen count in that suit is very small (opponents likely void -> they trump)
    //   - trump suit (we save trumps)
    const nonTrumpSuits = (Object.keys(buckets) as Suit[]).filter(
      s => s !== trumpSuit && buckets[s].length > 0
    );

    type Scored = { suit: Suit; card: Card; score: number };
    const scored: Scored[] = [];

    for (const s of nonTrumpSuits) {
      const cards = buckets[s];
      const top = highestOf(cards, aceOffMode);
      const unseen = unseenOfSuit(s, player.hand, playedCards);
      const highestRemaining = highestRemainingRank(s, player.hand, playedCards, aceOffMode);
      const haveTop = rankVal(top, aceOffMode) >= highestRemaining;

      let score = cards.length * 2;
      if (haveTop) score += 5;
      if (unseen <= 2) score -= 3; // opponents very likely void → trump danger
      scored.push({ suit: s, card: top, score });
    }

    scored.sort((a, b) => b.score - a.score);

    if (scored.length) return scored[0].card;

    // Only trump left. Lead a mid trump to flush out opposing highs
    // rather than wasting the top.
    const trumps = legal.sort((a, b) => rankVal(a, aceOffMode) - rankVal(b, aceOffMode));
    return trumps[Math.floor(trumps.length / 2)];
  }

  // --- FOLLOWING ---
  const winnerNow = currentTrickWinner(currentTrick, trumpSuit, aceOffMode);
  const partnerIsWinning = !!winnerNow && winnerNow.playerId === partnerId;
  const leadSuit = currentTrick.leadSuit;
  const hasLead = player.hand.some(c => c.suit === leadSuit);
  const trickValue = currentTrick.cards.length; // 0..3 — later in trick = more info

  if (partnerIsWinning) {
    // Dump lowest non-high card. Prefer shedding from our shortest non-trump
    // to create voids.
    const nonTrumpLegal = legal.filter(c => c.suit !== trumpSuit);
    if (nonTrumpLegal.length) {
      nonTrumpLegal.sort((a, b) => {
        const lenDiff = buckets[a.suit].length - buckets[b.suit].length;
        if (lenDiff !== 0) return lenDiff;
        return rankVal(a, aceOffMode) - rankVal(b, aceOffMode);
      });
      return nonTrumpLegal[0];
    }
    return lowestOf(legal, aceOffMode);
  }

  // Opponent winning. Try cheapest winner first.
  const cheap = cheapestWinner(legal, currentTrick, trumpSuit, aceOffMode);

  if (cheap) {
    // If my cheapest winner is a trump but partner hasn't played yet,
    // consider holding: partner might win it anyway and we save the trump.
    const partnerPlayed = currentTrick.cards.some(c => c.playerId === partnerId);
    if (
      trumpSuit && cheap.suit === trumpSuit && !partnerPlayed && !hasLead && trickValue < 3
    ) {
      // Partner still to play. Sluff low non-trump and hope partner wins.
      const nonTrump = legal.filter(c => c.suit !== trumpSuit);
      if (nonTrump.length) return lowestOf(nonTrump, aceOffMode);
    }

    // If my cheapest winner is unreasonably high relative to the lead (e.g.
    // beating a 5 with an Ace when a 6 would do), it already is the cheapest
    // that wins, so just play it.
    return cheap;
  }

  // Can't win. Sluff lowest non-trump if possible.
  if (!hasLead && trumpSuit) {
    const nonTrump = legal.filter(c => c.suit !== trumpSuit);
    if (nonTrump.length) return lowestOf(nonTrump, aceOffMode);
  }
  return lowestOf(legal, aceOffMode);
};

/* ---------- AI: public entry ---------- */

export const getAIMove = (
  player: Player,
  currentTrick: Trick,
  trumpSuit?: Suit,
  aceOffMode?: boolean,
  options?: {
    difficulty?: AIDifficulty;
    playedCards?: Card[];
    partnerId?: string;
  }
): Card => {
  const ctx: AIContext = {
    player,
    currentTrick,
    trumpSuit,
    aceOffMode,
    difficulty: options?.difficulty ?? 'medium',
    playedCards: options?.playedCards,
    partnerId: options?.partnerId,
  };
  switch (ctx.difficulty) {
    case 'easy':   return easyMove(ctx);
    case 'hard':   return hardMove(ctx);
    case 'medium':
    default:       return mediumMove(ctx);
  }
};

/* ---------- AI: trump declaration ---------- */

/**
 * Declare trump based on hand strength in each suit.
 * Score = length * 2 + sum of (rankValue - 10, floored at 0) for high cards.
 */
export const chooseTrump = (
  hand: Card[],
  difficulty: AIDifficulty = 'medium'
): Suit => {
  const buckets = suitBuckets(hand);
  const scored = (Object.keys(buckets) as Suit[]).map(s => {
    const cards = buckets[s];
    const lengthScore = cards.length * 2;
    const highScore = cards.reduce((acc, c) => acc + Math.max(0, RANK_VALUE[c.rank] - 10), 0);
    return { suit: s, score: lengthScore + (difficulty === 'easy' ? 0 : highScore), count: cards.length };
  });
  scored.sort((a, b) => b.score - a.score || b.count - a.count);
  return scored[0]?.suit ?? 'hearts';
};

/* ---------- AI: secure vs court decision ---------- */

/**
 * Decide whether to claim the pile (secure) or play for court (continue winning
 * all remaining tricks). Returns true to secure, false to go for court.
 *
 *   - If we already secured once this round, this fn is not called.
 *   - If score is 0 AND our hand is a monster, we can go for court.
 *   - Otherwise secure.
 */
export const shouldSecure = (params: {
  hand: Card[];
  trumpSuit?: Suit;
  myScore: number;              // tricks my team has banked this round
  tricksInPile: number;         // tricks currently on the table for the pile
  cardsLeftThisHand: number;    // cards in hand for the acting player
  difficulty?: AIDifficulty;
}): boolean => {
  const { hand, trumpSuit, myScore, tricksInPile, cardsLeftThisHand, difficulty = 'medium' } = params;

  // With no hand left, always secure.
  if (cardsLeftThisHand <= 0) return true;

  // Evaluate hand monstrousness
  const buckets = suitBuckets(hand);
  const trumpCount = trumpSuit ? buckets[trumpSuit].length : 0;
  const trumpHighs = trumpSuit
    ? buckets[trumpSuit].filter(c => RANK_VALUE[c.rank] >= 12).length
    : 0;
  const aces = hand.filter(c => c.rank === 'A').length;
  const kings = hand.filter(c => c.rank === 'K').length;

  const strength = trumpCount * 2 + trumpHighs * 2 + aces * 2 + kings;

  if (difficulty === 'easy') {
    // Legacy: secure almost always, tiny chance to go for all only at score 0.
    if (myScore === 0 && Math.random() > 0.95) return false;
    return true;
  }

  // Medium / hard: only go for court if score is 0, pile is big enough to
  // be worth it, and hand is strong.
  if (myScore === 0 && tricksInPile >= 3 && strength >= 10 && cardsLeftThisHand >= 4) {
    return false;
  }
  return true;
};
