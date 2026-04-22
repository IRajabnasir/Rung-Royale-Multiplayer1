/**
 * Unit tests for gameLogic.ts
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  createDeck,
  shuffle,
  canPlayCard,
  compareCards,
  determineTrickWinner,
  sortHand,
  initializePlayers,
  getAIMove,
  chooseTrump,
  shouldSecure,
  getLegalMoves,
  teamOf,
} from '../gameLogic';
import { Card, Rank, Suit, Player, PlayerPosition } from '../../types';

const C = (rank: Rank, suit: Suit): Card => ({
  rank, suit, id: `${rank}-${suit}`, value: 0,
});

describe('createDeck', () => {
  it('creates 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(c => c.id)).size).toBe(52);
  });
  it('includes all four suits with 13 cards each', () => {
    const deck = createDeck();
    const counts = deck.reduce((acc, c) => {
      acc[c.suit] = (acc[c.suit] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    expect(counts).toEqual({ hearts: 13, diamonds: 13, clubs: 13, spades: 13 });
  });
});

describe('shuffle', () => {
  it('preserves card set', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    expect(new Set(shuffled.map(c => c.id))).toEqual(new Set(deck.map(c => c.id)));
  });
  it('is non-destructive', () => {
    const deck = createDeck();
    const before = deck.map(c => c.id).join(',');
    shuffle(deck);
    expect(deck.map(c => c.id).join(',')).toBe(before);
  });
});

describe('canPlayCard', () => {
  const hand = [C('5', 'hearts'), C('K', 'hearts'), C('2', 'spades')];
  it('anything legal when leading', () => {
    expect(canPlayCard(hand[0], hand)).toBe(true);
    expect(canPlayCard(hand[2], hand)).toBe(true);
  });
  it('must follow suit if able', () => {
    expect(canPlayCard(hand[0], hand, 'hearts')).toBe(true);
    expect(canPlayCard(hand[2], hand, 'hearts')).toBe(false);
  });
  it('may play anything if void in lead', () => {
    const void_hand = [C('5', 'clubs'), C('K', 'spades')];
    expect(canPlayCard(void_hand[0], void_hand, 'hearts')).toBe(true);
    expect(canPlayCard(void_hand[1], void_hand, 'hearts')).toBe(true);
  });
});

describe('compareCards', () => {
  it('higher of same suit wins', () => {
    expect(compareCards(C('K', 'hearts'), C('5', 'hearts'), 'hearts')).toBeGreaterThan(0);
  });
  it('trump beats non-trump even if lead', () => {
    expect(compareCards(C('2', 'spades'), C('A', 'hearts'), 'hearts', 'spades')).toBeGreaterThan(0);
  });
  it('lead suit beats off-suit non-trump', () => {
    expect(compareCards(C('5', 'hearts'), C('A', 'clubs'), 'hearts', 'spades')).toBeGreaterThan(0);
  });
  it('higher trump beats lower trump', () => {
    expect(compareCards(C('A', 'spades'), C('2', 'spades'), 'hearts', 'spades')).toBeGreaterThan(0);
  });
  it('ace-off mode: ace becomes lowest', () => {
    expect(compareCards(C('A', 'hearts'), C('K', 'hearts'), 'hearts', undefined, true)).toBeLessThan(0);
    expect(compareCards(C('A', 'hearts'), C('2', 'hearts'), 'hearts', undefined, true)).toBeLessThan(0);
  });
});

describe('determineTrickWinner', () => {
  it('picks highest trump when any played', () => {
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [
        { playerId: 'a', card: C('A', 'hearts') },
        { playerId: 'b', card: C('2', 'spades') },
        { playerId: 'c', card: C('K', 'hearts') },
        { playerId: 'd', card: C('3', 'clubs') },
      ],
    };
    expect(determineTrickWinner(trick, 'spades')).toBe('b');
  });
  it('picks highest of lead suit when no trump played', () => {
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [
        { playerId: 'a', card: C('5', 'hearts') },
        { playerId: 'b', card: C('A', 'diamonds') },
        { playerId: 'c', card: C('K', 'hearts') },
        { playerId: 'd', card: C('3', 'clubs') },
      ],
    };
    expect(determineTrickWinner(trick, 'spades')).toBe('c');
  });
  it('ace-off: ace of lead loses to any other card of that suit', () => {
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [
        { playerId: 'a', card: C('A', 'hearts') },
        { playerId: 'b', card: C('2', 'hearts') },
      ],
    };
    expect(determineTrickWinner(trick, undefined, true)).toBe('b');
  });
});

describe('sortHand', () => {
  it('groups by suit then sorts rank desc', () => {
    const hand = [C('2', 'hearts'), C('A', 'hearts'), C('5', 'clubs'), C('K', 'clubs')];
    const sorted = sortHand(hand);
    // SUIT_ORDER: diamonds, clubs, spades, hearts. No diamonds or spades in hand
    // so clubs should appear first, then hearts.
    expect(sorted[0].suit).toBe('clubs');
    expect(sorted[0].rank).toBe('K'); // K > 5 within clubs (desc)
    expect(sorted[1].rank).toBe('5');
    expect(sorted[2].suit).toBe('hearts');
    expect(sorted[2].rank).toBe('A'); // A > 2 within hearts (desc)
  });
});

describe('initializePlayers', () => {
  it('creates 4 players with correct positions', () => {
    const players = initializePlayers(true);
    expect(players).toHaveLength(4);
    expect(players.map(p => p.position)).toEqual(['bottom', 'left', 'top', 'right']);
    expect(players[0].isAI).toBe(false);
    expect(players.slice(1).every(p => p.isAI)).toBe(true);
  });
});

describe('teamOf', () => {
  it('bottom+top = team 1, left+right = team 2', () => {
    expect(teamOf('bottom')).toBe(1);
    expect(teamOf('top')).toBe(1);
    expect(teamOf('left')).toBe(2);
    expect(teamOf('right')).toBe(2);
  });
});

describe('getLegalMoves', () => {
  it('returns all cards when leading', () => {
    const hand = [C('5', 'hearts'), C('K', 'clubs')];
    expect(getLegalMoves(hand)).toHaveLength(2);
  });
  it('returns only lead suit when holding some', () => {
    const hand = [C('5', 'hearts'), C('K', 'clubs'), C('2', 'hearts')];
    const moves = getLegalMoves(hand, 'hearts');
    expect(moves.every(c => c.suit === 'hearts')).toBe(true);
  });
  it('returns everything when void in lead', () => {
    const hand = [C('5', 'clubs'), C('K', 'clubs')];
    expect(getLegalMoves(hand, 'hearts')).toHaveLength(2);
  });
});

/* ---------- AI BEHAVIOR TESTS ---------- */

const aiPlayer = (hand: Card[], position: PlayerPosition = 'left'): Player => ({
  id: 'ai-1', name: 'AI', position, hand, isAI: true,
});

describe('getAIMove — leading', () => {
  it('medium AI leads highest of longest non-trump suit', () => {
    const hand = [
      C('A', 'hearts'), C('K', 'hearts'), C('5', 'hearts'),
      C('J', 'clubs'),
      C('2', 'spades'), C('3', 'spades'), // spades = trump, shouldn't lead
    ];
    const move = getAIMove(
      aiPlayer(hand),
      { cards: [], leadSuit: null },
      'spades', false,
      { difficulty: 'medium' }
    );
    // Hearts is longest non-trump; highest heart = A
    expect(move.suit).toBe('hearts');
    expect(move.rank).toBe('A');
  });

  it('hard AI penalizes short-suit lead when unseen count is low', () => {
    const hand = [
      C('A', 'hearts'),
      C('K', 'clubs'), C('Q', 'clubs'), C('J', 'clubs'),
    ];
    // All other hearts already seen (12 played + 1 in my hand = all 13)
    const allHearts = [
      '2','3','4','5','6','7','8','9','10','J','Q','K',
    ].map(r => C(r as Rank, 'hearts'));
    const move = getAIMove(
      aiPlayer(hand),
      { cards: [], leadSuit: null },
      'spades', false,
      { difficulty: 'hard', playedCards: allHearts }
    );
    // A-hearts is valuable, but clubs is longer and less risky
    expect(move.suit).toBe('clubs');
  });
});

describe('getAIMove — following, partner winning', () => {
  it('dumps lowest when partner is winning', () => {
    // Me: 'left' (team 2). Partner: 'right'.
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [
        { playerId: 'bottom-p', card: C('5', 'hearts') },     // team 1
        { playerId: 'partner-right', card: C('A', 'hearts') }, // my partner, winning
      ],
    };
    const hand = [C('K', 'hearts'), C('2', 'hearts'), C('7', 'hearts')];
    const move = getAIMove(
      aiPlayer(hand, 'left'),
      trick,
      'spades', false,
      { difficulty: 'medium', partnerId: 'partner-right' }
    );
    expect(move.rank).toBe('2'); // dump low
  });
});

describe('getAIMove — following, opponent winning', () => {
  it('wins cheaply when possible', () => {
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [{ playerId: 'opp', card: C('10', 'hearts') }],
    };
    const hand = [C('A', 'hearts'), C('J', 'hearts'), C('2', 'hearts')];
    const move = getAIMove(
      aiPlayer(hand),
      trick,
      'spades', false,
      { difficulty: 'medium', partnerId: 'p' }
    );
    // J beats 10 and is cheapest winner
    expect(move.rank).toBe('J');
  });

  it('sluffs low when cannot win', () => {
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [{ playerId: 'opp', card: C('A', 'hearts') }],
    };
    const hand = [C('2', 'hearts'), C('5', 'hearts')];
    const move = getAIMove(
      aiPlayer(hand),
      trick,
      'spades', false,
      { difficulty: 'medium', partnerId: 'p' }
    );
    expect(move.rank).toBe('2');
  });

  it('medium AI trumps to win when void in lead', () => {
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [{ playerId: 'opp', card: C('A', 'hearts') }],
    };
    const hand = [C('K', 'spades'), C('2', 'clubs'), C('3', 'clubs')];
    const move = getAIMove(
      aiPlayer(hand),
      trick,
      'spades', false,
      { difficulty: 'medium', partnerId: 'p' }
    );
    // Medium should grab the trick with the cheapest winner — trump K.
    expect(move.suit).toBe('spades');
    expect(move.rank).toBe('K');
  });

  it('hard AI conserves trump if partner still to play', () => {
    // Only the opponent right before me has played; partner and one more opp
    // still to play. Partner might win — save the trump.
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [{ playerId: 'opp-bottom', card: C('A', 'hearts') }],
    };
    const hand = [C('K', 'spades'), C('2', 'clubs'), C('3', 'clubs')];
    const move = getAIMove(
      aiPlayer(hand, 'left'),
      trick,
      'spades', false,
      { difficulty: 'hard', partnerId: 'partner-right' }
    );
    // Should sluff a low club, keep the trump.
    expect(move.suit).toBe('clubs');
    expect(move.rank).toBe('2');
  });

  it('hard AI trumps on 4th seat when must win', () => {
    // 3 players already played; partner already played and lost. I must trump to save it.
    const trick = {
      leadSuit: 'hearts' as Suit,
      cards: [
        { playerId: 'opp-bottom', card: C('A', 'hearts') },
        { playerId: 'partner-right', card: C('5', 'hearts') },
        { playerId: 'opp-top', card: C('K', 'hearts') },
      ],
    };
    const hand = [C('K', 'spades'), C('2', 'clubs'), C('3', 'clubs')];
    const move = getAIMove(
      aiPlayer(hand, 'left'),
      trick,
      'spades', false,
      { difficulty: 'hard', partnerId: 'partner-right' }
    );
    // All three have played; I'm last. Take it with the trump.
    expect(move.suit).toBe('spades');
  });
});

describe('chooseTrump', () => {
  it('picks longest/strongest suit', () => {
    const hand = [
      C('A', 'hearts'), C('K', 'hearts'), C('Q', 'hearts'), C('J', 'hearts'),
      C('2', 'clubs'),
      C('3', 'spades'),
      C('4', 'diamonds'), C('5', 'diamonds'),
    ];
    expect(chooseTrump(hand)).toBe('hearts');
  });
});

describe('shouldSecure', () => {
  it('secures by default on medium', () => {
    expect(shouldSecure({
      hand: [C('2', 'clubs'), C('3', 'diamonds')],
      trumpSuit: 'spades',
      myScore: 0,
      tricksInPile: 3,
      cardsLeftThisHand: 2,
      difficulty: 'medium',
    })).toBe(true);
  });

  it('goes for court with a monster hand at score 0', () => {
    const hand = [
      C('A', 'spades'), C('K', 'spades'), C('Q', 'spades'), C('J', 'spades'), // trumps
      C('A', 'hearts'), C('A', 'diamonds'), C('A', 'clubs'),
    ];
    const result = shouldSecure({
      hand,
      trumpSuit: 'spades',
      myScore: 0,
      tricksInPile: 3,
      cardsLeftThisHand: 7,
      difficulty: 'hard',
    });
    expect(result).toBe(false); // go for court
  });

  it('always secures when cards-left is 0', () => {
    expect(shouldSecure({
      hand: [],
      trumpSuit: 'spades',
      myScore: 0,
      tricksInPile: 5,
      cardsLeftThisHand: 0,
      difficulty: 'hard',
    })).toBe(true);
  });
});
