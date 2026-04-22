/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card, Rank, Suit, Player, PlayerPosition, MatchState } from '../types';
import { SUITS, RANKS, RANK_VALUE } from '../constants';

export interface Trick {
  cards: { playerId: string; card: Card }[];
  leadSuit: Suit | null;
}

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

export const compareCards = (cardA: Card, cardB: Card, leadSuit: Suit, trumpSuit?: Suit, aceOffMode?: boolean): number => {
  const getVal = (c: Card) => {
    if (aceOffMode && c.rank === 'A') return 1;
    return RANK_VALUE[c.rank];
  };

  // If one is trump and other is not
  if (trumpSuit) {
    if (cardA.suit === trumpSuit && cardB.suit !== trumpSuit) return 1;
    if (cardB.suit === trumpSuit && cardA.suit !== trumpSuit) return -1;
  }

  // If both are same suit (either both lead, both trump, or both same off-suit)
  if (cardA.suit === cardB.suit) {
    return getVal(cardA) - getVal(cardB);
  }

  // If cardA is lead suit and cardB is not (and neither is trump)
  if (cardA.suit === leadSuit) return 1;
  if (cardB.suit === leadSuit) return -1;

  // Otherwise, neither is lead nor trump, so they are both equal in their "uselessness"
  return 0;
};

export const determineTrickWinner = (trick: Trick, trumpSuit?: Suit, aceOffMode?: boolean): string => {
  if (!trick.cards.length || !trick.leadSuit) return '';
  
  let winner = trick.cards[0];
  for (let i = 1; i < trick.cards.length; i++) {
    if (compareCards(trick.cards[i].card, winner.card, trick.leadSuit, trumpSuit, aceOffMode) > 0) {
      winner = trick.cards[i];
    }
  }
  return winner.playerId;
};

export const sortHand = (hand: Card[]): Card[] => {
  const SUIT_ORDER: Record<Suit, number> = {
    'diamonds': 0,
    'clubs': 1,
    'spades': 2,
    'hearts': 3
  };

  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) {
      return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    }
    return RANK_VALUE[b.rank] - RANK_VALUE[a.rank]; // Descending rank
  });
};

export const initializePlayers = (aiEnabled: boolean = true): Player[] => {
  return [
    { id: 'player-1', name: 'You', position: 'bottom', hand: [], isAI: false, isSir: false, isDealer: false },
    { id: 'player-2', name: 'Alpha', position: 'left', hand: [], isAI: aiEnabled, isSir: false, isDealer: false },
    { id: 'player-3', name: 'Beta (Partner)', position: 'top', hand: [], isAI: aiEnabled, isSir: false, isDealer: false },
    { id: 'player-4', name: 'Gamma', position: 'right', hand: [], isAI: aiEnabled, isSir: false, isDealer: false },
  ];
};

export const canPlayCard = (card: Card, hand: Card[], leadSuit?: Suit): boolean => {
  if (!leadSuit) return true;
  const hasLeadSuit = hand.some(c => c.suit === leadSuit);
  if (hasLeadSuit) {
    return card.suit === leadSuit;
  }
  return true;
};

// Basic AI move
export const getAIMove = (player: Player, currentTrick: Trick, trumpSuit?: Suit, aceOffMode?: boolean): Card => {
  const playableCards = player.hand.filter(c => canPlayCard(c, player.hand, currentTrick.leadSuit));
  
  if (playableCards.length === 0) return player.hand[0]; // Should not happen

  // If leading
  if (!currentTrick.leadSuit) {
    // Try to play highest cards of a suit
    return playableCards.sort((a, b) => {
      const getVal = (c: Card) => (aceOffMode && c.rank === 'A') ? 1 : RANK_VALUE[c.rank];
      return getVal(b) - getVal(a);
    })[0];
  }

  // If following - try to win if possible, otherwise play low
  const bestCard = playableCards.sort((a, b) => {
    const cmp = compareCards(a, b, currentTrick.leadSuit!, trumpSuit, aceOffMode);
    return cmp;
  });

  return bestCard[bestCard.length - 1]; // Return the "highest" playable card for now
};
