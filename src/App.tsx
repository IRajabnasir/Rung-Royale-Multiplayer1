/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Settings, RotateCcw, User as UserIcon, Bot, Heart, Club, Spade, Diamond as Diamonds, Info, Layers, ChevronRight, Globe, Lock, Plus, LogOut, Users, Copy, Check, MessageSquare } from 'lucide-react';
import { User as FirebaseUser, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, signInWithGoogle } from './lib/firebase';
import { syncUserProfile, UserProfile, updateUserProfile } from './services/userService';
import { createMatch, joinMatch, startMatch, updateMatchState, listenToMatch, findPublicMatches } from './services/multiplayerService';
import { Card as CardType, Suit, Rank, Player, GameState, GameStatus, Theme, PlayerPosition, Match, MatchState } from './types';
import { THEMES, SUITS, RANKS, RANK_VALUE } from './constants';
import { 
  createDeck, 
  shuffle, 
  initializePlayers, 
  determineTrickWinner, 
  canPlayCard, 
  getAIMove,
  sortHand
} from './lib/gameLogic';

// Component: CardUI
const getSuitIcon = (suit: Suit, size = 16) => {
  switch (suit) {
    case 'hearts': return <Heart size={size} className="fill-red-500 text-red-500" />;
    case 'diamonds': return <Diamonds size={size} className="fill-red-500 text-red-500" />;
    case 'clubs': return <Club size={size} className="fill-slate-900 border-slate-900 text-slate-900" />;
    case 'spades': return <Spade size={size} className="fill-slate-900 border-slate-900 text-slate-900" />;
  }
};

const CardUI = ({ 
  card, 
  onClick, 
  disabled, 
  hidden, 
  theme,
  isLeading,
  index = 0
}: { 
  card: CardType; 
  onClick?: () => void; 
  disabled?: boolean; 
  hidden?: boolean;
  theme: Theme;
  isLeading?: boolean;
  index?: number;
}) => {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  if (hidden) {
    return (
      <motion.div
        layout
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-16 h-24 sm:w-20 sm:h-28 rounded-lg shadow-lg border-2 border-white/20 overflow-hidden"
        style={{ backgroundColor: theme.colors.cardBack }}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <Layers className="text-white" size={32} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      whileHover={!disabled ? { y: -10, scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={`relative w-16 h-24 sm:w-20 sm:h-28 rounded-lg shadow-lg border-2 flex flex-col justify-between p-2 cursor-pointer transition-colors ${
        disabled ? 'grayscale-[0.4] cursor-not-allowed' : 'hover:border-accent'
      }`}
      style={{ 
        backgroundColor: theme.colors.cardFront,
        borderColor: isLeading ? theme.colors.accent : 'transparent',
      }}
    >
      <div className={`flex flex-col items-start leading-none ${isRed ? 'text-red-500' : 'text-slate-900'}`}>
        <span className="text-sm sm:text-base font-bold">{card.rank}</span>
        <div className="mt-0.5">{getSuitIcon(card.suit, 24)}</div>
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
        {getSuitIcon(card.suit, 24)}
      </div>

      <div className={`flex flex-col items-end leading-none rotate-180 ${isRed ? 'text-red-500' : 'text-slate-900'}`}>
        <span className="text-sm sm:text-base font-bold">{card.rank}</span>
        <div className="mt-0.5">{getSuitIcon(card.suit, 24)}</div>
      </div>
    </motion.div>
  );
};

// Main App
export default function App() {
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [gameMode, setGameMode] = useState<'single' | 'multiplayer'>('single');
  const [match, setMatch] = useState<Match | null>(null);
  const [publicMatches, setPublicMatches] = useState<Match[]>([]);
  const [joining, setJoining] = useState(false);
  const [matchIdInput, setMatchIdInput] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ id: string, text: string, senderId: string, senderName: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'home' | 'shop' | 'friends' | 'clubs' | 'chest'>('home');
  const [homeSubView, setHomeSubView] = useState<'main' | 'arena'>('main');
  const matchmakingCancelled = useRef(false);

  // Audio effects
  const playSound = (type: 'shuffle' | 'snap') => {
    const urls = {
      shuffle: 'https://assets.mixkit.co/active_storage/sfx/2012/2012-preview.mp3',
      snap: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'
    };
    const audio = new Audio(urls[type]);
    audio.play().catch(e => console.log('Audio overlap or blocked:', e));
  };
  
  const [status, setStatus] = useState<GameStatus>({
    state: 'auth',
    players: initializePlayers(),
    currentPlayerIndex: 0,
    currentTrick: { cards: [] },
    scores: { team1: { tricks: 0 }, team2: { tricks: 0 } },
    history: [],
    turnOrder: [],
    securingThreshold: 5,
    pendingSecureTeam: null,
    isPlayingForAll: false,
    aceOffMode: false,
    tricksInPile: 0,
    lastTrickWinnerId: null,
    hasSecuredInRound: false,
    matchStats: {
      roundsPlayed: 0,
      team1Sets: 0,
      team2Sets: 0,
      team1Courts: 0,
      team2Courts: 0,
      team1SuperCourts: 0,
      team2SuperCourts: 0,
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState('Welcome to Court Piece Royale');

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const profile = await syncUserProfile(u);
        setUserProfile(profile);
        if (status.state === 'auth') {
          setStatus(prev => ({ ...prev, state: 'dashboard' }));
        }
      } else {
        setUserProfile(null);
      }
    });
  }, [status.state]);

  // Multiplayer Match Listener
  useEffect(() => {
    if (match?.matchId && gameMode === 'multiplayer') {
      const unsub = listenToMatch(match.matchId, (updatedMatch) => {
        setMatch(updatedMatch);
        if (updatedMatch.state) {
          // Sync local status with remote match state
          setStatus(prev => ({
            ...prev,
            ...updatedMatch.state,
            players: updatedMatch.players.map(p => {
              // Find matching local player to keep hand data if it's us
              const existing = prev.players.find(lp => lp.id === p.id);
              return { 
                ...p, 
                hand: existing?.id === user?.uid ? existing.hand : (p.hand || []) 
              };
            }) as any,
            state: updatedMatch.status === 'playing' ? (updatedMatch.state?.state || 'playing') : 'multiplayer_lobby'
          }));
        }
      });
      return () => unsub();
    }
  }, [match?.matchId, gameMode, user?.uid]);

  const refreshPublicMatches = async () => {
    const matches = await findPublicMatches();
    setPublicMatches(matches);
  };

  const handleCreateMatch = async (type: 'public' | 'private') => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setJoining(true);
    try {
      const matchId = await createMatch(user.uid, user.displayName || 'Player', type);
      const matchData = { matchId, hostId: user.uid, players: [{ id: user.uid, name: user.displayName || 'Player', position: 'bottom' as any, isAI: false, ready: true }], type, status: 'waiting' as any, state: null, playerIds: [user.uid] };
      setMatch(matchData as any);
      setGameMode('multiplayer');
      setStatus(prev => ({ ...prev, state: 'multiplayer_lobby' }));
    } finally {
      setJoining(false);
    }
  };

  const handleJoinMatch = async (matchId: string) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setJoining(true);
    try {
      await joinMatch(matchId, user.uid, user.displayName || 'Player');
      setGameMode('multiplayer');
      setMatch({ matchId } as any);
      setStatus(prev => ({ ...prev, state: 'multiplayer_lobby' }));
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (gameMode === 'multiplayer' && match?.matchId) {
      updateMatchState(match.matchId, status as any);
    }
  }, [status.state, status.currentPlayerIndex, status.currentTrick.cards.length, status.scores, status.hasSecuredInRound, status.tricksInPile]);

  const handleFindMatch = async () => {
    if (!user) {
      setMessage("Please login to play online battle");
      await signInWithGoogle();
      return;
    }
    setJoining(true);
    matchmakingCancelled.current = false;
    setMessage("Searching for global matches...");
    try {
      const publics = await findPublicMatches();
      if (matchmakingCancelled.current) return;

      if (publics.length > 0) {
        setMessage(`Found match ${publics[0].matchId}! Joining...`);
        await handleJoinMatch(publics[0].matchId);
      } else {
        setMessage("No active matches. Creating a new battle arena...");
        await handleCreateMatch('public');
      }
    } catch (e: any) {
      if (!matchmakingCancelled.current) {
        setMessage(`Matchmaking failed: ${e.message}`);
      }
    } finally {
      if (!matchmakingCancelled.current) {
        setJoining(false);
      }
    }
  };

  const cancelMatchmaking = () => {
    matchmakingCancelled.current = true;
    setJoining(false);
    setMessage("Matchmaking cancelled.");
    setTimeout(() => setMessage(''), 2000);
  };

  const players = status.players;

  // Game Logic Functions
  const startNewGame = useCallback((isContinuing: boolean = false) => {
    playSound('shuffle');
    setStatus(prev => {
      const deck = shuffle(createDeck());
      const initialPlayers = isContinuing ? prev.players.map(p => ({ ...p })) : initializePlayers();
      
      let dealerIndex: number;
      let sirIndex: number;

      if (!isContinuing) {
        dealerIndex = Math.floor(Math.random() * 4);
        sirIndex = (dealerIndex + 1) % 4;
      } else {
        const currentSirIndex = prev.players.findIndex(p => p.isSir);
        const isSirTeam1 = currentSirIndex === 0 || currentSirIndex === 2;
        const SirTeamTricks = isSirTeam1 ? prev.scores.team1.tricks : prev.scores.team2.tricks;
        
        initialPlayers.forEach(p => { p.isSir = false; p.isDealer = false; p.hand = []; });

        if (SirTeamTricks >= 7 && SirTeamTricks <= 12) {
          sirIndex = currentSirIndex;
        } else if (SirTeamTricks === 13) {
          sirIndex = (currentSirIndex + 2) % 4;
        } else {
          sirIndex = (currentSirIndex + 3) % 4;
        }
        dealerIndex = (sirIndex + 3) % 4;
      }

      initialPlayers.forEach((p, i) => {
        p.isSir = i === sirIndex;
        p.isDealer = i === dealerIndex;
        p.hand = sortHand(deck.slice(i * 5, (i + 1) * 5));
      });

      setMessage(`${initialPlayers[sirIndex].name} is selecting Trump suit...`);

      return {
        ...prev,
        state: 'declaring_trump',
        players: initialPlayers,
        currentPlayerIndex: sirIndex,
        currentTrick: { cards: [] },
        turnOrder: initialPlayers.map(p => p.id),
        scores: { team1: { tricks: 0 }, team2: { tricks: 0 } },
        securingThreshold: 5,
        pendingSecureTeam: null,
        isPlayingForAll: false,
        history: [],
        tricksInPile: 0,
        lastTrickWinnerId: null,
        hasSecuredInRound: false
      };
    });
  }, []);

  const declareTrump = (suit: Suit) => {
    if (status.state !== 'declaring_trump') return;

    setStatus(prev => ({
      ...prev,
      trumpSuit: suit,
      state: 'dealing'
    }));
    setMessage(`Trump Suit is ${suit.toUpperCase()}. Dealing remaining cards...`);

    setTimeout(() => {
      setStatus(prev => {
        const fullDeck = shuffle(createDeck());
        const updatedPlayers = prev.players.map(p => ({ ...p }));
        
        // Remove cards already in hands
        const remainingDeck = fullDeck.filter(card => 
          !updatedPlayers.some(p => p.hand.some(hc => hc.id === card.id))
        );
        
        updatedPlayers.forEach((p, idx) => {
          p.hand = sortHand([...p.hand, ...remainingDeck.slice(idx * 8, (idx + 1) * 8)]);
        });

        const sirIdx = updatedPlayers.findIndex(p => p.isSir);
        
        return {
          ...prev,
          players: updatedPlayers,
          state: 'playing',
          currentPlayerIndex: sirIdx
        };
      });
      setMessage(`Cards dealt. Lead the first trick.`);
    }, 1500);
  };

  const playCard = (playerId: string, card: CardType) => {
    if (status.state !== 'playing') return;
    
    // Check if it's actually this player's turn (IMPORTANT for atomic sync)
    if (status.players[status.currentPlayerIndex].id !== playerId) return;

    playSound('snap');
    const leadSuit = status.currentTrick.leadSuit;
    const playerHand = status.players[status.currentPlayerIndex].hand;
    
    if (!canPlayCard(card, playerHand, leadSuit)) {
      setMessage(`You must follow the lead suit: ${leadSuit}`);
      return;
    }

    const newTrickCards = [...status.currentTrick.cards, { playerId, card }];
    const newLeadSuit = leadSuit || card.suit;
    
    setStatus(prev => {
      const updatedPlayers = prev.players.map(p => 
        p.id === playerId 
          ? { ...p, hand: p.hand.filter(c => c.id !== card.id) } 
          : p
      );

      return {
        ...prev,
        players: updatedPlayers,
        currentTrick: {
          ...prev.currentTrick,
          cards: newTrickCards,
          leadSuit: newLeadSuit
        },
        currentPlayerIndex: (prev.currentPlayerIndex + 1) % 4
      };
    });

    if (newTrickCards.length === 4) {
      setTimeout(() => {
        setStatus(prev => {
          const winnerId = determineTrickWinner({ cards: newTrickCards, leadSuit: newLeadSuit }, prev.trumpSuit);
          const winnerIndex = prev.players.findIndex(p => p.id === winnerId);
          const winner = prev.players[winnerIndex];
          const winningCard = newTrickCards.find(tc => tc.playerId === winnerId)!.card;
          
          const winnerTeamNum = (winnerIndex === 0 || winnerIndex === 2) ? 1 : 2;
          const isTrumpCut = winningCard.suit === prev.trumpSuit && newLeadSuit !== prev.trumpSuit;
          const isAceWin = winningCard.rank === 'A';
          
          const newTricksInPile = prev.tricksInPile + 1;
          let newScores = { 
            team1: { ...prev.scores.team1 }, 
            team2: { ...prev.scores.team2 } 
          };
          
          let nextState: GameState = 'playing';
          let nextPendingTeam: 1 | 2 | null = null;
          let nextPlayingForAll = prev.isPlayingForAll;
          let nextThreshold = prev.securingThreshold;
          let nextTricksInPile = newTricksInPile;

          const isEndOfHand = prev.players.every(p => p.hand.length === 0);
          const isConsecutiveWin = prev.lastTrickWinnerId === winnerId;

          if (isEndOfHand) {
            newScores = updateScore(prev.scores, winnerTeamNum, nextTricksInPile);
            nextTricksInPile = 0;
            nextState = 'round_end';
            setTimeout(() => handleRoundEnd(newScores), 0);
          } else {
            if (nextPlayingForAll) {
              if (winnerTeamNum !== prev.pendingSecureTeam) {
                nextPlayingForAll = false;
                const cardsLeft = winner.hand.length;
                nextThreshold = cardsLeft >= 3 ? 3 : Math.max(1, cardsLeft);
                newScores = updateScore(prev.scores, winnerTeamNum, nextTricksInPile);
                nextTricksInPile = 0;
                setMessage(`${winner.name} takes a trick! COURT FAILED. Target: ${nextThreshold}.`);
              } else {
                newScores = updateScore(prev.scores, winnerTeamNum, nextTricksInPile);
                nextTricksInPile = 0;
              }
            } else {
              if (isConsecutiveWin && newTricksInPile >= nextThreshold) {
                const blockedByAce = prev.aceOffMode && isAceWin;
                if (isTrumpCut) {
                  setMessage(`${winner.name} won 2 in a row with a cut! (Cannot secure with cut).`);
                } else if (blockedByAce) {
                  setMessage(`${winner.name} won 2 in a row with an Ace! (Ace-Off blocks).`);
                } else if (!prev.hasSecuredInRound) {
                  nextState = 'deciding_secure';
                  nextPendingTeam = winnerTeamNum;
                  setMessage(`${winner.name} won 2 in a row! Claim ${newTricksInPile} tricks?`);
                } else {
                  newScores = updateScore(prev.scores, winnerTeamNum, nextTricksInPile);
                  const tricksJustScored = nextTricksInPile;
                  nextTricksInPile = 0;
                  const cardsLeft = winner.hand.length;
                  nextThreshold = cardsLeft >= 3 ? 3 : Math.max(1, cardsLeft);
                  setMessage(`${winner.name} secures ${tricksJustScored} tricks! Next Target: ${nextThreshold}.`);
                }
              }
            }
          }

          if (nextState === 'playing' && !isEndOfHand) {
            if (newTricksInPile >= nextThreshold && !isConsecutiveWin) {
              setMessage(`${winner.name} takes the lead! Win one more to secure the pile.`);
            } else {
              setMessage(`${winner.name} won the trick!`);
            }
          }

          return {
            ...prev,
            state: nextState,
            pendingSecureTeam: nextPendingTeam,
            isPlayingForAll: nextPlayingForAll,
            securingThreshold: nextThreshold,
            currentPlayerIndex: winnerIndex,
            currentTrick: { cards: [] },
            scores: newScores,
            tricksInPile: nextTricksInPile,
            lastTrickWinnerId: winnerId,
            history: [...prev.history, { cards: newTrickCards, leadSuit: newLeadSuit, winnerId }]
          };
        });
      }, 1000);
    }
  };

  const handleRoundEnd = (finalScores: { team1: { tricks: number }, team2: { tricks: number } }) => {
    setStatus(prev => {
      const currentSirIndex = prev.players.findIndex(p => p.isSir);
      const isSirTeam1 = currentSirIndex === 0 || currentSirIndex === 2;
      const sirTeamNum = isSirTeam1 ? 1 : 2;
      const opposingTeamNum = sirTeamNum === 1 ? 2 : 1;
      
      const sirTeamTricks = finalScores[`team${sirTeamNum}` as 'team1' | 'team2'].tricks;
      const opposingTeamTricks = finalScores[`team${opposingTeamNum}` as 'team1' | 'team2'].tricks;

      const newMatchStats = { ...prev.matchStats, roundsPlayed: prev.matchStats.roundsPlayed + 1 };
      let endMessage = "";

      if (sirTeamTricks === 13) {
        endMessage = `COURT! Team ${sirTeamNum} won every trick!`;
        newMatchStats[`team${sirTeamNum}Courts` as keyof typeof newMatchStats]++;
      } else if (opposingTeamTricks === 13) {
        endMessage = `SUPER COURT! Team ${opposingTeamNum} won every trick against the Sir!`;
        newMatchStats[`team${opposingTeamNum}SuperCourts` as keyof typeof newMatchStats]++;
        
        // Award Super Court Badge
        if (user && userProfile) {
          const isMyTeam = (opposingTeamNum === 1 && (status.turnOrder.indexOf(user.uid) === 0 || status.turnOrder.indexOf(user.uid) === 2)) ||
                          (opposingTeamNum === 2 && (status.turnOrder.indexOf(user.uid) === 1 || status.turnOrder.indexOf(user.uid) === 3));
          if (isMyTeam && !userProfile.badges.includes('super_court')) {
            updateUserProfile(user.uid, { badges: [...userProfile.badges, 'super_court'] });
          }
        }
      } else {
        const winnerTeamNum = finalScores.team1.tricks > finalScores.team2.tricks ? 1 : 2;
        endMessage = `Team ${winnerTeamNum} wins the hand ${finalScores.team1.tricks}-${finalScores.team2.tricks}!`;
        
        // Win Streak Logic
        if (user && userProfile) {
          const isMyTeam = (winnerTeamNum === 1 && (status.turnOrder.indexOf(user.uid) === 0 || status.turnOrder.indexOf(user.uid) === 2)) ||
                          (winnerTeamNum === 2 && (status.turnOrder.indexOf(user.uid) === 1 || status.turnOrder.indexOf(user.uid) === 3));
          if (isMyTeam) {
            const nextStreak = (userProfile.stats.winStreak || 0) + 1;
            const updates: any = { 'stats.winStreak': nextStreak };
            if (nextStreak === 5 && !userProfile.badges.includes('five_streak')) {
              updates.badges = [...userProfile.badges, 'five_streak'];
            }
            updateUserProfile(user.uid, updates);
          } else {
            updateUserProfile(user.uid, { 'stats.winStreak': 0 });
          }
        }
      }

      setMessage(endMessage);
      return { 
        ...prev, 
        state: 'round_end',
        matchStats: newMatchStats 
      };
    });
  };

  // Helper to ensure scores never exceed 13 and are calculated correctly
  const updateScore = (currentScores: { team1: { tricks: number }, team2: { tricks: number } }, teamNum: 1 | 2, amount: number) => {
    const totalCurrent = currentScores.team1.tricks + currentScores.team2.tricks;
    const allowed = Math.max(0, 13 - totalCurrent);
    const safeAmount = Math.min(amount, allowed);
    
    const newScores = {
      team1: { ...currentScores.team1 },
      team2: { ...currentScores.team2 }
    };
    
    if (teamNum === 1) newScores.team1.tricks += safeAmount;
    else newScores.team2.tricks += safeAmount;
    
    console.log(`[Scoring] Team ${teamNum} added ${safeAmount} (Requested: ${amount}). Total: ${newScores.team1.tricks + newScores.team2.tricks}/13`);
    return newScores;
  };

  const handleSecure = () => {
    setStatus(prev => {
      const teamNum = prev.pendingSecureTeam;
      const tricksInPile = prev.tricksInPile;
      
      if (!teamNum || tricksInPile === 0) return prev;

      const newScores = updateScore(prev.scores, teamNum, tricksInPile);

      const newMatchStats = { ...prev.matchStats };
      newMatchStats[`team${teamNum}Sets` as 'team1Sets' | 'team2Sets']++;

      const cardsInHand = prev.players[0].hand.length;
      const nextThreshold = cardsInHand >= 3 ? 3 : Math.max(1, cardsInHand);

      setMessage(`Team ${teamNum} is now SAFE! Claimed ${tricksInPile} tricks. Target: ${nextThreshold}.`);

      return {
        ...prev,
        state: 'playing',
        scores: newScores,
        tricksInPile: 0,
        pendingSecureTeam: null,
        hasSecuredInRound: true,
        securingThreshold: nextThreshold, 
        lastTrickWinnerId: null,
        matchStats: newMatchStats
      };
    });
  };

  const handleGoForAll = () => {
    setStatus(prev => {
      const teamNum = prev.pendingSecureTeam;
      if (!teamNum) return prev;

      setMessage(`Team ${teamNum} is playing for COURT! They must win every remaining trick.`);
      
      return {
        ...prev,
        state: 'playing',
        isPlayingForAll: true,
        hasSecuredInRound: true,
        pendingSecureTeam: teamNum, // Track which team is attempting court
        securingThreshold: 1, // Every trick now counts if they sustain the win
        lastTrickWinnerId: null // Reset streak for the court attempt
      };
    });
  };

  // AI Logic Effect
  useEffect(() => {
    const currentState = status.state;
    const currentPlayerIndex = status.currentPlayerIndex;
    const currentPlayer = status.players[currentPlayerIndex];

    if (!currentPlayer) return;

    if (currentState === 'playing' || currentState === 'declaring_trump' || currentState === 'deciding_secure') {
      const isAIHand = currentPlayer.isAI;
      
      // If human is declaring trump, don't auto-declare
      if (currentState === 'declaring_trump' && !isAIHand) return;
      
      // AI needs to act?
      if (isAIHand || (currentState === 'deciding_secure' && currentPlayer.isAI)) {
        const timer = setTimeout(() => {
          if (currentState === 'declaring_trump') {
            const suits = currentPlayer.hand.map(c => c.suit);
            const counts = suits.reduce((acc, suit) => ({ ...acc, [suit]: (acc[suit] || 0) + 1 }), {} as Record<Suit, number>);
            const bestSuit = (Object.keys(counts) as Suit[]).sort((a, b) => counts[b] - counts[a])[0] || 'hearts';
            console.log(`AI ${currentPlayer.name} declaring trump: ${bestSuit}`);
            declareTrump(bestSuit);
          } else if (currentState === 'playing' && status.currentTrick.cards.length < 4) {
            const move = getAIMove(currentPlayer, status.currentTrick, status.trumpSuit);
            console.log(`AI ${currentPlayer.name} playing: ${move.id}`);
            playCard(currentPlayer.id, move);
          } else if (currentState === 'deciding_secure') {
            const isTeam2 = currentPlayer.position === 'left' || currentPlayer.position === 'right';
            const score = isTeam2 ? status.scores.team2.tricks : status.scores.team1.tricks;
            
            console.log(`AI ${currentPlayer.name} deciding to secure/court. Current score: ${score}`);
            if (score === 0 && Math.random() > 0.95) {
              handleGoForAll();
            } else {
              handleSecure();
            }
          }
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [status.state, status.currentPlayerIndex, status.players, status.currentTrick.cards.length, status.pendingSecureTeam]);

  const currentPlayer = players[status.currentPlayerIndex];
  const isMyTurn = status.state === 'playing' && 
    (gameMode === 'single' ? currentPlayer.position === 'bottom' : currentPlayer.id === user?.uid) && 
    status.currentTrick.cards.length < 4;

  return (
    <div 
      className="min-h-screen transition-colors duration-500 overflow-hidden font-sans selection:bg-accent/30"
      style={{ backgroundColor: theme.colors.bg, color: theme.colors.text, fontFamily: theme.fontFamily }}
    >
      {/* HUD / Header */}
      <nav className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-50 backdrop-blur-md bg-black/10 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent rounded-xl shadow-lg shadow-accent/20">
            <Trophy size={20} className="text-black" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Rung Royale</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-60">Session Beta v1.0</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6">
          <div className="flex flex-col items-center px-4 py-1 border-x border-white/10">
            <span className="text-[10px] uppercase font-bold text-accent italic tracking-wider">Team 1 (Sets: {status.matchStats.team1Sets})</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono font-bold leading-none">{status.scores.team1.tricks}</span>
              <span className="text-[10px] opacity-60 uppercase">Secured</span>
            </div>
          </div>
          <div className="flex flex-col items-center px-4 py-1">
            <span className="text-[10px] uppercase font-bold opacity-80 italic tracking-wider">Team 2 (Sets: {status.matchStats.team2Sets})</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono font-bold leading-none">{status.scores.team2.tricks}</span>
              <span className="text-[10px] opacity-60 uppercase">Secured</span>
            </div>
          </div>
          {status.trumpSuit && (
            <div className="flex flex-col items-center px-4 py-1 border-l border-white/10">
              <span className="text-[10px] uppercase font-bold opacity-50">Trump</span>
              <div className="flex items-center gap-2 mt-1">
                {getSuitIcon(status.trumpSuit, 20)}
                <span className="text-sm font-bold capitalize tracking-tight">{status.trumpSuit}</span>
              </div>
            </div>
          )}
          {status.securingThreshold > 1 && (
            <div className="flex flex-col items-center px-4 py-1 border-l border-white/10">
              <span className="text-[10px] uppercase font-bold opacity-50">Hand Pile (Target: {status.securingThreshold})</span>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-5 h-5 bg-accent/20 rounded flex items-center justify-center">
                  <Layers size={14} className="text-accent" />
                </div>
                <span className="text-xl font-mono font-bold leading-none">{status.tricksInPile}</span>
              </div>
            </div>
          )}
        </div>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="hidden sm:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                <img src={user.photoURL || ''} className="w-6 h-6 rounded-full" />
                <span className="text-xs font-bold">{user.displayName}</span>
              </div>
            ) : (
               <button onClick={() => signInWithGoogle()} className="hidden sm:flex items-center gap-2 bg-accent/20 text-accent px-3 py-1.5 rounded-xl border border-accent/20 hover:bg-accent/30 transition-all text-xs font-bold">
                 <UserIcon size={14} />
                 <span>Login</span>
               </button>
            )}
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors border border-white/10 shadow-lg"
            >
              <Settings size={20} />
            </button>
          </div>
      </nav>

      {/* Main Game Area */}
      <main className="relative h-screen w-full flex items-center justify-center p-4">
        
        {/* Table Background */}
        <div 
          className="absolute inset-0 m-4 sm:m-12 md:m-24 shadow-2xl transition-all duration-1000 overflow-hidden" 
          style={{ 
            backgroundColor: theme.colors.table, 
            borderRadius: '40% 40% 40% 40% / 50% 50% 50% 50%',
            border: `12px solid ${theme.colors.bg}`,
            boxShadow: `inset 0 0 100px rgba(0,0,0,0.5), 0 20px 50px rgba(0,0,0,0.5)`
          }}
        >
          {/* Subtle noise/texture */}
          <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/felt.png')]"></div>
          
          {/* Center Pile Indicator Overlay */}
          {status.tricksInPile > 0 && status.state === 'playing' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
               <motion.div 
                 initial={{ opacity: 0, scale: 0.8 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="bg-black/40 backdrop-blur-md px-6 py-3 rounded-3xl border border-white/20 text-white flex flex-col items-center gap-1 shadow-2xl"
               >
                 <Layers size={24} className="text-accent" />
                 <span className="text-lg font-mono font-bold leading-none">{status.tricksInPile}</span>
                 <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Tricks in Center</span>
               </motion.div>
            </div>
          )}
          
          {/* Trick area */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <AnimatePresence>
              {status.currentTrick.cards.map((tc, i) => {
                const player = players.find(p => p.id === tc.playerId)!;
                const pos = player.position;
                
                // Offset calculation for the cards in central trick
                const offsets = {
                  bottom: { x: 0, y: 40, rotate: 0 },
                  left: { x: -40, y: 0, rotate: 90 },
                  top: { x: 0, y: -40, rotate: 0 },
                  right: { x: 40, y: 0, rotate: -90 },
                };

                return (
                  <motion.div
                    key={`${tc.card.id}-${i}`}
                    initial={{ 
                      x: pos === 'left' ? -300 : pos === 'right' ? 300 : 0, 
                      y: pos === 'top' ? -300 : pos === 'bottom' ? 300 : 0,
                      opacity: 0,
                      rotate: 0
                    }}
                    animate={{ 
                      x: offsets[pos].x, 
                      y: offsets[pos].y, 
                      opacity: 1, 
                      rotate: offsets[pos].rotate 
                    }}
                    exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.3 } }}
                    className="absolute z-10"
                  >
                    <CardUI card={tc.card} theme={theme} disabled />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Players View */}
        {players.map((p) => {
          const isCurrent = players[status.currentPlayerIndex].id === p.id;
          const pos = p.position;
          
          return (
            <div 
              key={p.id}
              className={`absolute transition-all duration-300 flex flex-col items-center gap-4 ${
                pos === 'bottom' ? 'bottom-8 left-1/2 -translate-x-1/2' :
                pos === 'top' ? 'top-20 left-1/2 -translate-x-1/2' :
                pos === 'left' ? 'left-8 md:left-12 top-1/2 -translate-y-1/2 flex-row' :
                'right-8 md:right-12 top-1/2 -translate-y-1/2 flex-row-reverse'
              }`}
            >
              {/* Player Avatar/Info */}
              <div className={`flex flex-col items-center transition-transform ${isCurrent ? 'scale-110' : 'scale-100 opacity-70'}`}>
                <div className={`relative p-1 rounded-full border-2 transition-colors ${isCurrent ? 'border-accent shadow-lg shadow-accent/20' : 'border-white/20'}`}>
                  <div className="bg-slate-800 p-2 rounded-full">
                    {p.isAI ? <Bot size={24} className="text-accent" /> : <UserIcon size={24} className="text-accent" />}
                  </div>
                  {p.isSir && (
                    <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-1 border border-white">
                      <Trophy size={10} className="text-black" />
                    </div>
                  )}
                  {isCurrent && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute -inset-2 border-2 border-accent rounded-full animate-pulse pointer-events-none" 
                    />
                  )}
                </div>
                <span className="text-xs font-bold mt-1 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  {p.name} {(gameMode === 'single' ? p.position === 'bottom' : p.id === user?.uid) && '(You)'}
                </span>
                {isCurrent && (
                   <span className="text-[8px] uppercase tracking-tighter text-accent font-black animate-bounce mt-1">
                     {p.isAI ? 'Thinking...' : 'Your Turn'}
                   </span>
                )}
              </div>

              {/* Player Hand */}
              <div className={`flex gap-1 transition-all duration-500 ${
                (pos === 'left' || pos === 'right') ? 'flex-col items-center' : 'justify-center'
              } ${status.state === 'declaring_trump' && pos === 'bottom' ? 'scale-125 mb-12' : ''}`}>
                {p.hand.map((card, i) => (
                  <div 
                    key={card.id} 
                    className="transition-all duration-300"
                    style={{ 
                      marginLeft: pos === 'bottom' || pos === 'top' ? (i > 0 ? (status.state === 'declaring_trump' && pos === 'bottom' ? '-10px' : '-30px') : '0') : '0',
                      marginTop: pos === 'left' || pos === 'right' ? (i > 0 ? '-60px' : '0') : '0',
                      zIndex: i
                    }}
                  >
                    <CardUI 
                      card={card} 
                      theme={theme}
                      hidden={gameMode === 'single' ? p.isAI : p.id !== user?.uid} 
                      disabled={status.state === 'playing' ? (!isMyTurn || !canPlayCard(card, p.hand, status.currentTrick.leadSuit)) : (status.state === 'declaring_trump' && (gameMode === 'single' ? p.position === 'bottom' : p.id === user?.uid) ? false : true)}
                      onClick={() => playCard(p.id, card)}
                    />
                  </div>
                ))}
                {p.hand.length === 0 && p.isAI && (
                   <div className="w-16 h-24 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center opacity-20">
                      <Layers size={16} />
                   </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Center Message */}
        <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0">
          <div className="flex flex-col items-center max-w-sm text-center">
            <motion.p 
              key={message}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-lg md:text-2xl font-serif italic opacity-40 leading-tight"
            >
              {message}
            </motion.p>
          </div>
        </div>

        {/* Overlays / Modals */}
        {/* 1st Page: Auth Screen - Image 1 Style */}
        {status.state === 'auth' && (
          <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-gradient-to-b from-purple-900 via-indigo-900 to-purple-950 p-6 overflow-hidden">
             {/* Background Decorative */}
             <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-[120px] animate-pulse delay-700" />
             </div>

             <motion.div 
               initial={{ y: -50, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               className="relative mb-12 text-center"
             >
               <div className="flex flex-col items-center gap-2">
                 <Trophy size={80} className="text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                 <h1 className="text-6xl font-black tracking-tighter text-white uppercase italic">
                   RUNG <span className="text-yellow-400">ROYALE</span>
                 </h1>
                 <p className="text-purple-300 font-bold uppercase tracking-widest text-sm">The Ultimate Court Piece</p>
               </div>
             </motion.div>

             <div className="w-full max-w-xs space-y-4 relative z-10">
                <button 
                  onClick={() => setStatus(prev => ({ ...prev, state: 'dashboard' }))}
                  className="w-full bg-lime-500 hover:bg-lime-400 text-slate-900 font-black py-4 rounded-2xl shadow-[0_4px_0_rgb(101,163,13)] active:translate-y-1 active:shadow-none transition-all text-xl uppercase italic tracking-wider border border-white/20"
                >
                  Play
                </button>

                <button 
                  onClick={() => signInWithGoogle()}
                  className="w-full bg-sky-500 hover:bg-sky-400 text-white font-black py-4 rounded-2xl shadow-[0_4px_0_rgb(2,132,199)] active:translate-y-1 active:shadow-none transition-all text-xl uppercase italic tracking-wider border border-white/20"
                >
                  Login
                </button>

                <div className="flex items-center gap-4 py-2">
                  <div className="h-px flex-1 bg-white/20"></div>
                  <span className="text-white/40 font-bold text-sm">OR</span>
                  <div className="h-px flex-1 bg-white/20"></div>
                </div>

                <button 
                   onClick={() => { setShowJoinInput(true); setStatus(prev => ({ ...prev, state: 'dashboard' })); }}
                   className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-4 rounded-2xl shadow-[0_4px_0_rgb(157,23,77)] active:translate-y-1 active:shadow-none transition-all text-xl uppercase italic tracking-wider border border-white/20"
                >
                  Join with code
                </button>
             </div>

             <div className="mt-12 flex items-center gap-3 text-[10px] text-white/50">
               <div className="w-5 h-5 bg-lime-500/20 border border-lime-500/50 rounded flex items-center justify-center">
                 <Check size={12} className="text-lime-500" />
               </div>
               <p>I have read and agreed to the <span className="underline text-white/80">Terms of Service</span> and <span className="underline text-white/80">Privacy policy</span></p>
             </div>
          </div>
        )}

        {/* 2nd Page: Dashboard Screen - Image 2 Style */}
        {status.state === 'dashboard' && (
          <div className="fixed inset-0 z-[105] bg-[#4a044e] flex flex-col p-4 overflow-hidden">
             {/* Top Bar */}
             <div className="flex items-center justify-between gap-2 mb-6">
                <div className="bg-black/40 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                   <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
                      <span className="text-[10px] font-black text-black">C</span>
                   </div>
                   <span className="text-xs font-black">{userProfile?.currency?.coins || 0}</span>
                   <Plus size={12} className="text-lime-400" />
                </div>
                <div className="bg-black/40 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                   <div className="w-6 h-6 bg-emerald-400 rounded-full flex items-center justify-center shadow-lg rotate-45">
                      <Diamonds size={14} className="text-emerald-900" />
                   </div>
                   <span className="text-xs font-black">{userProfile?.currency?.gems || 0}</span>
                   <Plus size={12} className="text-lime-400" />
                </div>
                <button 
                  onClick={() => setShowSettings(true)}
                  className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/10"
                >
                  <Settings size={20} />
                </button>
             </div>

             {/* Matchmaking Status / Feedback */}
             {message && (
               <motion.div 
                 initial={{ height: 0, opacity: 0 }}
                 animate={{ height: 'auto', opacity: 1 }}
                 className="mb-4 bg-accent/20 border border-accent/40 rounded-2xl p-4 text-center relative group"
               >
                 <p className="text-[10px] text-accent uppercase font-black tracking-widest animate-pulse mb-2">{message}</p>
                 {joining && (
                   <button 
                     onClick={cancelMatchmaking}
                     className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 rounded-xl text-red-500 text-[10px] font-black uppercase tracking-widest transition-all"
                   >
                     Cancel Matchmaking
                   </button>
                 )}
               </motion.div>
             )}

             {/* Dynamic Content based on activeTab */}
             <div className="flex-1 overflow-y-auto pb-4">
                {activeTab === 'home' && (
                  <>
                    <div className="bg-purple-900/60 border border-white/10 p-4 rounded-3xl flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-slate-700 rounded-2xl border-2 border-white/20 flex items-center justify-center overflow-hidden">
                   {user?.photoURL ? (
                     <img src={user.photoURL} alt="p" className="w-full h-full object-cover" />
                   ) : (
                     <UserIcon size={32} className="text-white/40" />
                   )}
                </div>
                <div className="flex-1">
                   <h3 className="font-black text-lg leading-none mb-1">{user?.displayName || 'Venom Realm'}</h3>
                   <div className="flex items-center gap-2">
                      <div className="bg-lime-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase">Level 1</div>
                      <div className="w-24 h-2 bg-black/40 rounded-full overflow-hidden">
                         <div className="w-1/3 h-full bg-lime-500" />
                      </div>
                   </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                   {/* Achievement Badges */}
                   <div className={`w-8 h-10 rounded-lg flex items-center justify-center relative transition-all ${userProfile?.badges.includes('super_court') ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-black/40'}`}>
                      <Trophy size={12} className={userProfile?.badges.includes('super_court') ? 'text-yellow-400' : 'text-white/10'} />
                      {userProfile?.badges.includes('super_court') ? (
                        <div className="absolute -bottom-1 bg-yellow-600 text-[6px] font-black px-1 rounded uppercase animate-bounce">Super</div>
                      ) : (
                        <div className="absolute -bottom-1 bg-slate-800 text-[6px] font-black px-1 rounded uppercase opacity-20">Lvl 4</div>
                      )}
                   </div>
                   <div className={`w-8 h-10 rounded-lg flex items-center justify-center relative transition-all ${userProfile?.badges.includes('five_streak') ? 'bg-orange-500/20 border border-orange-500/50' : 'bg-black/40'}`}>
                      <RotateCcw size={12} className={userProfile?.badges.includes('five_streak') ? 'text-orange-400' : 'text-white/10'} />
                      {userProfile?.badges.includes('five_streak') ? (
                        <div className="absolute -bottom-1 bg-orange-600 text-[6px] font-black px-1 rounded uppercase animate-pulse">Streak</div>
                      ) : (
                        <div className="absolute -bottom-1 bg-slate-800 text-[6px] font-black px-1 rounded uppercase opacity-20">Lvl 4</div>
                      )}
                   </div>
                   <div className={`w-8 h-10 bg-black/40 rounded-lg flex items-center justify-center relative`}>
                      <Lock size={12} className="text-white/10" />
                      <div className="absolute -bottom-1 bg-slate-800 text-[6px] font-black px-1 rounded uppercase opacity-20">Lvl 5</div>
                   </div>
                </div>
             </div>

              {/* Main Game Options */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-min">
                {homeSubView === 'main' ? (
                  <>
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setGameMode('single'); startNewGame(); }}
                      className="bg-yellow-500 rounded-[2.5rem] border-b-8 border-yellow-700 p-4 flex flex-col items-center justify-between text-slate-900 shadow-xl"
                    >
                      <div className="flex-1 flex items-center justify-center py-6">
                        <div className="grid grid-cols-2 gap-2">
                          <Trophy size={64} className="text-yellow-900" />
                          <Bot size={64} className="text-yellow-900" />
                        </div>
                      </div>
                      <div className="w-full bg-yellow-600/50 py-3 rounded-b-[2rem] font-black text-xl uppercase tracking-tighter italic">2 Player (AI)</div>
                    </motion.button>

                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setHomeSubView('arena')}
                      className="bg-emerald-500 rounded-[2.5rem] border-b-8 border-emerald-700 p-4 flex flex-col items-center justify-between text-slate-900 shadow-xl relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Globe size={180} />
                      </div>
                      <div className="flex-1 flex items-center justify-center py-6 text-yellow-300 relative z-10">
                        <Globe size={120} className="animate-pulse" />
                      </div>
                      <div className="w-full bg-emerald-600/50 py-3 rounded-b-[2rem] font-black text-xl uppercase tracking-tighter italic relative z-10">Online Arena</div>
                    </motion.button>
                  </>
                ) : (
                  <>
                    <div className="md:col-span-2 flex items-center justify-between mb-2">
                      <button onClick={() => setHomeSubView('main')} className="text-[10px] font-black uppercase text-accent/60 flex items-center gap-1 hover:text-accent transition-colors">
                        <Plus size={10} className="rotate-45" /> Back to menu
                      </button>
                      <span className="text-[10px] font-black uppercase text-white/20 tracking-widest italic">Battle Terminal</span>
                    </div>
                    
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleFindMatch}
                      disabled={joining}
                      className={`bg-emerald-500 rounded-[2.5rem] border-b-8 border-emerald-700 p-6 flex flex-col items-center justify-center text-slate-900 shadow-xl transition-all md:col-span-2 ${joining ? 'opacity-50 grayscale cursor-wait' : ''}`}
                    >
                      <div className="flex items-center gap-4">
                        <Globe size={48} className={joining ? 'animate-spin' : ''} />
                        <div className="text-left">
                          <h4 className="text-2xl font-black italic uppercase tracking-tighter leading-none mb-1">Random vs Battle</h4>
                          <p className="text-[10px] font-bold opacity-60 uppercase">Auto-join available global lobbies</p>
                        </div>
                      </div>
                    </motion.button>

                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowJoinInput(true)}
                      className="bg-accent rounded-3xl border-b-6 border-accent-dark p-6 h-32 flex flex-col items-center justify-center gap-3 text-slate-900 shadow-lg font-black uppercase italic tracking-tighter"
                    >
                      <Lock size={32} />
                      Join with Code
                    </motion.button>

                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleCreateMatch('private')}
                      className="bg-white rounded-3xl border-b-6 border-slate-300 p-6 h-32 flex flex-col items-center justify-center gap-3 text-slate-900 shadow-lg font-black uppercase italic tracking-tighter"
                    >
                      <Plus size={32} />
                      Private Room
                    </motion.button>
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === 'shop' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-2xl font-black italic uppercase italic">Royal Shop</h2>
              <div className="grid grid-cols-2 gap-4">
                 {[
                   {n:'1k Coins',p:'$0.99',i:<Trophy/>,c:'yellow'},
                   {n:'5k Coins',p:'$3.99',i:<Trophy/>,c:'yellow'},
                   {n:'50 Gems',p:'$4.99',i:<Diamonds/>,c:'emerald'},
                   {n:'200 Gems',p:'$14.99',i:<Diamonds/>,c:'emerald'}
                 ].map((item,idx)=>(
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-3xl p-4 flex flex-col items-center gap-3">
                    <div className={`w-12 h-12 bg-${item.c}-500 rounded-xl flex items-center justify-center shadow-lg text-slate-900`}>{item.i}</div>
                    <p className="font-black text-sm italic">{item.n}</p>
                    <button className="bg-emerald-500 text-slate-900 w-full rounded-xl py-1 text-xs font-black uppercase italic">{item.p}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'friends' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black italic uppercase italic">Friends</h2>
                <button className="p-2 bg-accent rounded-xl text-slate-900"><Plus size={16}/></button>
              </div>
              <div className="bg-black/20 rounded-3xl p-6 border border-white/5 text-center">
                <Users size={48} className="mx-auto text-white/10 mb-4" />
                <p className="text-white/40 font-bold text-sm">Online lobby system coming in v1.1. Invite rivals!</p>
              </div>
            </div>
          )}

          {activeTab === 'clubs' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-2xl font-black italic uppercase italic">Clubs</h2>
              <div className="bg-slate-800 rounded-3xl p-8 border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-4">
                 <div className="p-4 bg-white/5 rounded-full"><Trophy size={48} className="text-white/20"/></div>
                 <p className="font-black italic uppercase text-white/50 tracking-tighter">Coming Soon</p>
              </div>
            </div>
          )}

          {activeTab === 'chest' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-2xl font-black italic uppercase italic">Chests</h2>
              <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-[2rem] p-6 text-slate-900 relative overflow-hidden group">
                 <Layers size={80} className="absolute -right-4 -bottom-4 text-amber-900/20 group-hover:scale-125 transition-transform" />
                 <h3 className="text-2xl font-black italic uppercase leading-none mb-1">Golden Treasure</h3>
                 <p className="text-xs font-black uppercase opacity-60 mb-4">Unlocks Daily Reward</p>
                 <button className="bg-slate-900 text-white px-6 py-2 rounded-xl font-black uppercase italic text-xs">Open (10 Gems)</button>
              </div>
            </div>
          )}
        </div>

             {/* Bottom Nav */}
             <div className="mt-4 flex items-center justify-between bg-black/40 p-1.5 rounded-[2.5rem] border border-white/5 backdrop-blur-md">
                {[
                  { icon: <Plus size={18} className="rotate-45" />, label: 'Shop', id: 'shop' },
                  { icon: <UserIcon size={18} />, label: 'Friends', id: 'friends' },
                  { icon: <Globe size={20} />, label: 'Home', id: 'home' },
                  { icon: <Users size={18} />, label: 'Clubs', id: 'clubs' },
                  { icon: <Plus size={18} />, label: 'Chest', id: 'chest' }
                ].map((item: any) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button 
                      key={item.id} 
                      onClick={() => setActiveTab(item.id as any)}
                      className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all ${isActive ? 'bg-white/10 text-accent' : 'text-white/30 hover:text-white/60'}`}
                    >
                      {item.icon}
                      <span className="text-[8px] font-black uppercase tracking-tighter mt-1">{item.label}</span>
                    </button>
                  );
                })}
             </div>
          </div>
        )}

        {/* 3rd Page: Room Lobby - Updated with Ace Toggle */}
        {status.state === 'multiplayer_lobby' && match && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-slate-900 border-2 border-accent/20 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl"
            >
               <div className="mb-6 flex flex-col items-center">
                 <div className="px-4 py-1 bg-white/10 rounded-full border border-white/10 mb-4 flex items-center gap-2 group relative">
                   <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Room ID</span>
                   <span className="text-lg font-mono font-bold text-accent tracking-tighter">{match.matchId}</span>
                   <button 
                     onClick={() => {
                        navigator.clipboard.writeText(match.matchId);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                     }}
                     className="ml-2 p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-accent"
                   >
                     {copied ? <Check size={14} /> : <Copy size={14} />}
                   </button>
                 </div>
                 <h2 className="text-2xl font-bold mb-1">Waiting for Players</h2>
                 <p className="text-slate-500 text-sm">
                   Give the Room ID to your friends or wait for random players.
                 </p>
               </div>

               <div className="grid grid-cols-2 gap-4 my-8">
                 {[0, 1, 2, 3].map(i => {
                    const p = match.players[i];
                    return (
                      <div key={i} className={`p-4 rounded-2xl border flex flex-col items-center gap-3 transition-all ${p ? 'bg-accent/10 border-accent/40' : 'bg-white/5 border-dashed border-white/10 opacity-40'}`}>
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center ${p ? 'bg-accent text-slate-900' : 'bg-white/10 text-slate-500'}`}>
                           {p?.isAI ? <Bot size={20} /> : <UserIcon size={20} />}
                         </div>
                         <div className="flex flex-col items-center">
                           <span className="text-xs font-bold truncate max-w-full">{p ? p.name : 'Waiting...'}</span>
                           <span className="text-[8px] uppercase tracking-tighter opacity-50">{['Bottom', 'Left', 'Top', 'Right'][i]}</span>
                         </div>
                      </div>
                    );
                 })}
               </div>

               <div className="space-y-4 my-6">
                 <div className="flex items-center justify-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                   <span className={`text-sm font-black transition-colors ${status.aceOffMode ? 'text-white/40' : 'text-accent'}`}>ACE ON</span>
                   <button 
                     onClick={() => setStatus(prev => ({ ...prev, aceOffMode: !prev.aceOffMode }))}
                     className={`w-14 h-8 rounded-full transition-colors relative border-2 ${status.aceOffMode ? 'bg-slate-700 border-white/10' : 'bg-accent border-accent/20'}`}
                   >
                     <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${status.aceOffMode ? 'left-7' : 'left-1'}`} />
                   </button>
                   <span className={`text-sm font-black transition-colors ${status.aceOffMode ? 'text-accent' : 'text-white/40'}`}>ACE OFF</span>
                 </div>
               </div>

               {match.hostId === user?.uid ? (
                 <div className="flex flex-col gap-3">
                   <button 
                     onClick={() => {
                        const filledPlayers = [...match.players];
                        // Fill remaining slots with AI
                        for (let i = filledPlayers.length; i < 4; i++) {
                          const positions: PlayerPosition[] = ['bottom', 'left', 'top', 'right'];
                          filledPlayers.push({
                            id: `ai-${i}`,
                            name: `AI Bot ${i}`,
                            position: positions[i],
                            isAI: true,
                            ready: true
                          } as any);
                        }
                        const deck = shuffle(createDeck());
                        const dealerIndex = Math.floor(Math.random() * 4);
                        const sirIndex = (dealerIndex + 1) % 4;
                        
                        filledPlayers.forEach((p, idx) => {
                          p.isSir = idx === sirIndex;
                          p.isDealer = idx === dealerIndex;
                          p.hand = sortHand(deck.slice(idx * 5, (idx + 1) * 5));
                        });

                        const initialState = {
                          state: 'declaring_trump',
                          currentPlayerIndex: sirIndex,
                          players: filledPlayers,
                          currentTrick: { cards: [] },
                          scores: { team1: { tricks: 0 }, team2: { tricks: 0 } },
                          securingThreshold: 5,
                          tricksInPile: 0,
                          history: []
                        };
                        startMatch(match.matchId, initialState as any);
                     }}
                     className="w-full bg-accent text-slate-900 font-bold py-4 rounded-2xl hover:bg-white transition-all shadow-lg"
                   >
                     {match.players.length === 4 ? 'Start Battle' : 'Fill with AI & Start'}
                   </button>
                   <button 
                     onClick={() => setStatus(prev => ({ ...prev, state: 'lobby' }))}
                     className="w-full text-slate-500 text-xs font-bold py-2 hover:text-white transition-colors"
                   >
                     Cancel Match
                   </button>
                 </div>
               ) : (
                 <p className="text-accent text-xs font-black animate-pulse">Wait for host to start...</p>
               )}
            </motion.div>
          </div>
        )}

        {status.state === 'declaring_trump' && !players[status.currentPlayerIndex].isAI && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/10 backdrop-blur-[1px] pt-[5vh]">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-slate-900 border border-white/20 rounded-3xl p-8 max-w-2xl w-full shadow-2xl text-center"
            >
              <h2 className="text-2xl font-bold mb-6">You are Sir! Choose Trump Suit</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {SUITS.map(suit => (
                  <button
                    key={suit}
                    onClick={() => declareTrump(suit)}
                    className="flex flex-col items-center gap-4 p-6 bg-slate-800 border-2 border-white/10 rounded-2xl transition-all hover:scale-105 hover:border-accent hover:bg-slate-700 shadow-lg group"
                  >
                    {suit === 'hearts' && <Heart size={48} className="text-red-500 fill-red-500" />}
                    {suit === 'diamonds' && <Diamonds size={48} className="text-red-500 fill-red-500" />}
                    {suit === 'clubs' && <Club size={48} className="text-white fill-white group-hover:text-accent" />}
                    {suit === 'spades' && <Spade size={48} className="text-white fill-white group-hover:text-accent" />}
                    <span className="font-bold text-lg capitalize">{suit}</span>
                  </button>
                ))}
              </div>
              <p className="mt-8 text-xs text-slate-500 uppercase tracking-widest">Strategy Tip: Choose your strongest suit</p>
            </motion.div>
          </div>
        )}

        {status.state === 'deciding_secure' && status.pendingSecureTeam && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-slate-900 border-2 border-accent/20 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl"
            >
              <div className="text-accent mb-4">
                <Trophy size={64} className="mx-auto" />
              </div>
              <h2 className="text-3xl font-bold mb-2">Team {status.pendingSecureTeam} Threshold</h2>
              <p className="text-slate-400 mb-8">
                You have won {status.pendingSecureTeam === 1 ? status.scores.team1.tricks : status.scores.team2.tricks} tricks. 
                Do you want to mark this set as SAFE or play for COURT?
              </p>
              
              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleSecure}
                  className="w-full bg-emerald-600 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/10 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1"
                >
                  <Trophy size={20} />
                  <span>Mark as Safe</span>
                </button>
                <button 
                  onClick={handleGoForAll}
                  className="w-full bg-slate-800 text-white border-2 border-white/10 font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-700 hover:border-accent/40 transition-all shadow-xl"
                >
                  <ChevronRight size={20} />
                  <span>Play for Court</span>
                </button>
              </div>
              <p className="mt-6 text-[10px] text-slate-500 uppercase tracking-widest">
                Winning the set avoids losing. The winner of the hand needs the most tricks.
              </p>
            </motion.div>
          </div>
        )}

        {status.state === 'round_end' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-slate-900 border-2 border-accent/20 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl"
            >
              <div className="text-accent mb-4">
                <Trophy size={64} className="mx-auto" />
              </div>
              <h2 className="text-4xl font-bold mb-2">Round Over</h2>
              <div className="grid grid-cols-2 gap-8 my-8">
                <div className="bg-white/5 p-4 rounded-2xl">
                   <p className="text-[10px] uppercase font-bold opacity-50 mb-1">Team 1</p>
                   <p className="text-3xl font-mono">{status.scores.team1.tricks}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl">
                   <p className="text-[10px] uppercase font-bold opacity-50 mb-1">Team 2</p>
                   <p className="text-3xl font-mono">{status.scores.team2.tricks}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => startNewGame(true)}
                  className="w-full bg-emerald-600 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/10 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1"
                >
                  <RotateCcw size={20} />
                  <span className="text-lg">Next Hand</span>
                </button>
                <button 
                  onClick={() => setStatus(prev => ({ ...prev, state: 'dashboard' }))}
                  className="w-full bg-slate-800 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-700 transition-all border border-white/10"
                >
                  <LogOut size={16} className="text-red-400" />
                  <span>Go to Dashboard</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>

        {/* Chat System Overlay */}
        {(status.state === 'playing' || status.state === 'declaring_trump' || status.state === 'multiplayer_lobby') && gameMode === 'multiplayer' && (
          <>
            <button 
              onClick={() => setChatOpen(!chatOpen)}
              className="fixed bottom-24 right-6 z-[120] w-14 h-14 bg-accent text-slate-900 rounded-full shadow-2xl flex items-center justify-center border-4 border-slate-900 hover:scale-110 transition-transform"
            >
              <MessageSquare size={24} />
            </button>

            <AnimatePresence>
              {chatOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.9 }}
                  className="fixed bottom-40 right-6 z-[120] w-64 bg-slate-900 border-2 border-white/10 rounded-2xl shadow-2xl overflow-hidden p-2"
                >
                  <p className="text-[10px] font-black text-white/40 uppercase p-2 mb-2 border-b border-white/5">Quick Chat</p>
                  <div className="grid grid-cols-1 gap-1">
                    {["Nice play!", "Trump please?", "Oops!", "Good game!", "Watch out!"].map(phrase => (
                      <button 
                        key={phrase}
                        onClick={() => {
                          const msg = { id: Date.now().toString(), text: phrase, senderId: user?.uid || 'guest', senderName: user?.displayName || 'Player' };
                          setMessages(prev => [...prev.slice(-4), msg]);
                          setChatOpen(false);
                          setTimeout(() => setMessages(prev => prev.filter(m => m.id !== msg.id)), 4000);
                        }}
                        className="w-full text-left p-3 hover:bg-white/10 rounded-xl text-sm font-bold transition-colors"
                      >
                        {phrase}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat Floating Messages */}
            <div className="fixed bottom-4 left-6 z-[120] flex flex-col gap-2 pointer-events-none">
               <AnimatePresence>
                 {messages.map(msg => (
                   <motion.div 
                     key={msg.id}
                     initial={{ opacity: 0, x: -20, scale: 0.8 }}
                     animate={{ opacity: 1, x: 0, scale: 1 }}
                     exit={{ opacity: 0, x: 20, scale: 0.8 }}
                     className="bg-white text-slate-900 px-4 py-2 rounded-2xl rounded-bl-none shadow-xl border-2 border-accent font-black text-sm max-w-[200px]"
                   >
                     <p className="text-[10px] uppercase text-slate-400 leading-none mb-1">{msg.senderName}</p>
                     {msg.text}
                   </motion.div>
                 ))}
               </AnimatePresence>
            </div>
          </>
        )}

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-slate-900 z-[101] shadow-2xl p-8 border-l border-white/10 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-bold">Preferences</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition-all">
                  <RotateCcw className="rotate-45" size={20} />
                </button>
              </div>

              <div className="space-y-10">
                <section>
                  <div className="flex items-center gap-2 mb-4 text-slate-400">
                    <Trophy size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">Match Statistics</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                      <p className="text-[10px] uppercase opacity-50">T1 Sets</p>
                      <p className="font-mono text-lg">{status.matchStats.team1Sets}</p>
                    </div>
                    <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                      <p className="text-[10px] uppercase opacity-50">T2 Sets</p>
                      <p className="font-mono text-lg">{status.matchStats.team2Sets}</p>
                    </div>
                    <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                      <p className="text-[10px] uppercase opacity-50">T1 Courts</p>
                      <p className="font-mono text-lg">{status.matchStats.team1Courts}</p>
                    </div>
                    <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                      <p className="text-[10px] uppercase opacity-50">T2 Courts</p>
                      <p className="font-mono text-lg">{status.matchStats.team2Courts}</p>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4 text-slate-400">
                    <Layers size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">Visual Theme</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {THEMES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t)}
                        className={`group relative flex items-center justify-between p-4 rounded-2xl border transition-all ${
                          theme.id === t.id ? 'border-accent bg-accent/10 shadow-lg shadow-accent/5' : 'border-white/15 bg-white/10 hover:bg-white/15 hover:border-white/30'
                        }`}
                      >
                        <span className="font-bold">{t.name}</span>
                        <div className="flex gap-1">
                           <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.colors.bg }}></div>
                           <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.colors.cardBack }}></div>
                           <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.colors.accent }}></div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4 text-slate-400">
                    <Info size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">Game Controls</span>
                  </div>
                  <div className="space-y-4">
                    <button 
                      onClick={() => { setShowSettings(false); startNewGame(); }}
                      className="w-full flex items-center justify-between p-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-2xl transition-all"
                    >
                      <span className="font-bold">Reset Match</span>
                      <RotateCcw size={18} />
                    </button>
                  </div>
                </section>
              </div>

              <div className="mt-20 pt-10 border-t border-white/5 text-center text-slate-600">
                <p className="text-[10px] uppercase tracking-[0.2em] font-black">Rung Royale</p>
                <p className="text-[9px] mt-1">Made with precision and craft</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Stats / Score Toast */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 flex justify-between bg-black/60 backdrop-blur-xl p-4 rounded-3xl border border-white/10 z-40">
        <div className="flex flex-col">
          <span className="text-[8px] uppercase font-black opacity-40">Team 1</span>
          <span className="text-xl font-mono leading-none">{status.scores.team1.tricks}</span>
        </div>
        
        {status.trumpSuit && (
          <div className="flex items-center gap-2 bg-white/10 px-3 rounded-full">
            {status.trumpSuit === 'hearts' && <Heart size={14} className="fill-red-500 text-red-500" />}
            {status.trumpSuit === 'diamonds' && <Diamonds size={14} className="fill-red-500 text-red-500" />}
            {status.trumpSuit === 'clubs' && <Club size={14} className="fill-white text-white" />}
            {status.trumpSuit === 'spades' && <Spade size={14} className="fill-white text-white" />}
          </div>
        )}

        <div className="flex flex-col items-end">
          <span className="text-[8px] uppercase font-black opacity-40">Team 2</span>
          <span className="text-xl font-mono leading-none">{status.scores.team2.tricks}</span>
        </div>
      </div>
    </div>
  );
}
