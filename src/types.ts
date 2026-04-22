export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number;
}

export type PlayerPosition = 'bottom' | 'left' | 'top' | 'right';

export interface Player {
  id: string;
  name: string;
  position: PlayerPosition;
  isAI: boolean;
  hand: Card[];
  isSir?: boolean;
  isDealer?: boolean;
}

export type GameState = 'auth' | 'dashboard' | 'multiplayer_lobby' | 'declaring_trump' | 'dealing' | 'playing' | 'deciding_secure' | 'round_end';

export interface Theme {
  id: string;
  name: string;
  colors: {
    bg: string;
    table: string;
    cardFront: string;
    cardBack: string;
    accent: string;
    text: string;
  };
  fontFamily: string;
  pattern?: string;
  cardPattern?: string;
}

export interface MatchState {
  state: GameState;
  trumpSuit: Suit | null;
  currentPlayerIndex: number;
  currentTrick: {
    cards: { playerId: string; card: Card }[];
    leadSuit: Suit | null;
  };
  scores: {
    team1: { tricks: number };
    team2: { tricks: number };
  };
  tricksInPile: number;
  lastTrickWinnerId: string | null;
  hasSecuredInRound: boolean;
  securingThreshold: number;
  isPlayingForAll: boolean;
  pendingSecureTeam: 1 | 2 | null;
  history: any[];
  players: Player[];
  matchStats: {
    roundsPlayed: number;
    team1Sets: number;
    team2Sets: number;
    team1Courts: number;
    team2Courts: number;
    team1SuperCourts: number;
    team2SuperCourts: number;
  };
  aceOffMode: boolean;
  turnOrder: string[];
}

export type GameStatus = MatchState;

export interface Match {
  matchId: string;
  hostId: string;
  type: 'public' | 'private';
  isRanked?: boolean;
  status: 'waiting' | 'playing' | 'finished';
  players: {
    id: string;
    name: string;
    position: PlayerPosition;
    isAI: boolean;
    ready: boolean;
    hand?: Card[];
    isSir?: boolean;
    isDealer?: boolean;
  }[];
  playerIds: string[];
  state: MatchState | null;
  createdAt: any;
  updatedAt: any;
}
