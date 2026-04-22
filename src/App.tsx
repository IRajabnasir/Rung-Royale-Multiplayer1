/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Trophy, Settings, RotateCcw, User as UserIcon, Bot, Heart, Club, Spade, Diamond as Diamonds, Info, Layers, ChevronRight, Globe, Lock, Plus, LogOut, Users, Copy, Check, MessageSquare, ShoppingBag, Home } from 'lucide-react';
import { User as FirebaseUser, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, signInWithGoogle, db } from './lib/firebase';
import { syncUserProfile, UserProfile, updateUserProfile, deleteUserProfile } from './services/userService';
import { createMatch, joinMatch, startMatch, updateMatchState, listenToMatch, findPublicMatches, addAIPlayer } from './services/multiplayerService';
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
        className="relative w-14 h-20 sm:w-18 sm:h-26 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-white/20 overflow-hidden bg-slate-900"
        style={{ 
          backgroundImage: theme.cardPattern ? `url(${theme.cardPattern})` : 'none',
          backgroundSize: 'cover'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <Layers className="text-white" size={32} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      whileHover={!disabled ? { y: -12, scale: 1.05, filter: 'brightness(1.1)' } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={`relative w-12 h-18 sm:w-18 sm:h-26 rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.3)] border flex flex-col justify-between p-2 cursor-pointer transition-all ${
        disabled ? 'grayscale-[0.6] opacity-80 cursor-not-allowed' : 'hover:shadow-accent/20'
      }`}
      style={{ 
        backgroundColor: theme.colors.cardFront,
        borderColor: isLeading ? theme.colors.accent : 'transparent',
      }}
    >
      {/* Subtle paper texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/p6.png')]" />
      
      <div className={`flex flex-col items-start leading-none relative z-10 ${isRed ? 'text-rose-600' : 'text-slate-950'}`}>
        <span className="text-xs sm:text-base font-black tracking-tighter">{card.rank}</span>
        <div className="mt-0.5">{getSuitIcon(card.suit, 12)}</div>
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
        {getSuitIcon(card.suit, 32)}
      </div>

      <div className={`flex flex-col items-end leading-none relative z-10 self-end rotate-180 ${isRed ? 'text-rose-600' : 'text-slate-950'}`}>
        <span className="text-xs sm:text-base font-black tracking-tighter">{card.rank}</span>
        <div className="mt-0.5">{getSuitIcon(card.suit, 12)}</div>
      </div>
    </motion.div>
  );
};

// Main App
export default function App() {
  const [theme, setTheme] = useState<Theme>(THEMES.find(t => t.id === 'tactical') || THEMES[0]);
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
  const [isPortrait, setIsPortrait] = useState(typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : true);

  useEffect(() => {
    const handleResize = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  const [showPracticeSetup, setShowPracticeSetup] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [openingChest, setOpeningChest] = useState(false);
  const [aiPartnersEnabled, setAiPartnersEnabled] = useState(true);
  const [message, setMessage] = useState('Welcome to Court Piece Royale');

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const profile = await syncUserProfile(u);
        setUserProfile(profile);
        // Note: Removed automatic auto-transition to 'dashboard' here
        // The user must now explicitly click "Continue" or "Play Now"
      } else {
        setUserProfile(null);
      }
    });
  }, []); // Only run on mount

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

  const handleGuestLogin = (isPrivate: boolean = false) => {
    const guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
    const guestProfile: UserProfile = {
      uid: guestId,
      displayName: `${isPrivate ? 'Shadow' : 'Guest'}_${guestId.split('_')[1].toUpperCase()}`,
      email: null,
      photoURL: null,
      stats: { wins: 0, sets: 0, courts: 0, superCourts: 0, winStreak: 0, maxWinStreak: 0 },
      progression: { level: 1, xp: 0, trophies: 0 },
      currency: { coins: 1000, gems: 10 },
      friends: [],
      badges: [],
      isGuest: true
    };
    setUserProfile(guestProfile);
    // Move to dashboard
    setStatus(prev => ({ ...prev, state: 'dashboard' }));
    setMessage(isPrivate ? "Entered via Private Key" : `Logged in as Guest: ${guestProfile.displayName}`);
  };

  const handleSignOut = async () => {
    try {
      if (userProfile?.isGuest) {
        await deleteUserProfile(userProfile.uid);
      }
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      setStatus(prev => ({ ...prev, state: 'auth' }));
      setMessage("Signed out successfully");
    } catch (e: any) {
      setMessage(`Sign out failed: ${e.message}`);
    }
  };

  const refreshPublicMatches = async () => {
    const matches = await findPublicMatches();
    setPublicMatches(matches);
  };

  const handleCreateMatch = async (type: 'public' | 'private') => {
    if (!user) {
      setMessage("Please login to create a match");
      await signInWithGoogle();
      return;
    }
    setJoining(true);
    setMessage("Creating private sanctuary...");
    try {
      const matchId = await createMatch(user.uid, user.displayName || 'Player', type);
      const matchData = { 
        matchId, 
        hostId: user.uid, 
        players: [{ id: user.uid, name: user.displayName || 'Player', position: 'bottom' as any, isAI: false, ready: true }], 
        type, 
        status: 'waiting' as any, 
        state: { state: 'multiplayer_lobby' } as any, 
        playerIds: [user.uid] 
      };
      setMatch(matchData as any);
      setGameMode('multiplayer');
      setStatus(prev => ({ ...prev, state: 'multiplayer_lobby' }));
    } catch (e: any) {
      setMessage(`Failed to create room: ${e.message}`);
    } finally {
      setJoining(false);
    }
  };

  const handleJoinMatch = async (matchId: string) => {
    if (!user) {
      setMessage("Please login to join a match");
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

  const handleFindMatch = async (isRanked = false) => {
    if (!user) {
      setMessage("Please login to play online battle");
      await signInWithGoogle();
      return;
    }
    setJoining(true);
    matchmakingCancelled.current = false;
    setMessage(isRanked ? "Searching for Ranked challengers..." : "Searching for global matches...");
    try {
      const publics = await findPublicMatches();
      if (matchmakingCancelled.current) return;

      const availableMatch = publics.find(m => !!m.isRanked === isRanked);

      if (availableMatch) {
        setMessage(`Found match ${availableMatch.matchId}! Joining...`);
        await handleJoinMatch(availableMatch.matchId);
      } else {
        setMessage(isRanked ? "Creating a new Ranked arena..." : "No active matches. Creating a new battle arena...");
        const matchId = await createMatch(user.uid, user.displayName || 'Player', 'public');
        await updateDoc(doc(db, 'matches', matchId), { isRanked });
        
        const matchData = { 
          matchId, 
          hostId: user.uid, 
          players: [{ id: user.uid, name: user.displayName || 'Player', position: 'bottom' as any, isAI: false, ready: true }], 
          type: 'public' as any, 
          isRanked,
          status: 'waiting' as any, 
          state: null, 
          playerIds: [user.uid] 
        };
        setMatch(matchData as any);
        setGameMode('multiplayer');
        setStatus(prev => ({ ...prev, state: 'multiplayer_lobby' }));
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

  const openChest = async () => {
    if (!user || !userProfile || openingChest) return;
    const cost = 10;
    if ((userProfile.currency?.gems || 0) < cost) {
      setMessage("Not enough Gems!");
      return;
    }
    
    setOpeningChest(true);
    setMessage("Opening Golden Treasure...");
    
    // Simulate opening delay
    await new Promise(r => setTimeout(r, 1500));
    
    const coinsReward = 200 + Math.floor(Math.random() * 300);
    
    try {
      await updateUserProfile(user.uid, {
        'currency.gems': userProfile.currency.gems - cost,
        'currency.coins': userProfile.currency.coins + coinsReward
      });
      setMessage(`Victory! Received ${coinsReward} Coins!`);
      // Update local state is handled by the auth listener / profile sync but let's be safe
      setUserProfile(prev => prev ? {
        ...prev,
        currency: { ...prev.currency, gems: prev.currency.gems - cost, coins: prev.currency.coins + coinsReward }
      } : null);
    } catch (e) {
      console.error(e);
      setMessage("Failed to open chest.");
    } finally {
      setTimeout(() => {
        setOpeningChest(false);
        setMessage('');
      }, 3000);
    }
  };

  const buyCurrency = async (type: 'coins' | 'gems', amount: number) => {
    if (!user || !userProfile) return;
    try {
      await updateUserProfile(user.uid, {
        [`currency.${type}`]: ((userProfile.currency as any)[type] || 0) + amount
      });
      setMessage(`Success! Added ${amount} ${type === 'gems' ? 'Gems' : 'Coins'}`);
      // Optimistic local update
      setUserProfile(prev => prev ? {
        ...prev,
        currency: { ...prev.currency, [type]: (prev.currency as any)[type] + amount }
      } : null);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const players = status.players;

  // Game Logic Functions
  const startNewGame = useCallback((isContinuing: boolean = false) => {
    playSound('shuffle');
    setStatus(prev => {
      const deck = shuffle(createDeck());
      const initialPlayers = isContinuing ? prev.players.map(p => ({ ...p })) : initializePlayers(aiPartnersEnabled);
      
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
  }, [aiPartnersEnabled]);

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
          const winnerId = determineTrickWinner({ cards: newTrickCards, leadSuit: newLeadSuit }, prev.trumpSuit, prev.aceOffMode);
          const winnerIndex = prev.players.findIndex(p => p.id === winnerId);
          const winner = prev.players[winnerIndex];
          const winningCard = newTrickCards.find(tc => tc.playerId === winnerId)!.card;
          
          const winnerTeamNum = (winnerIndex === 0 || winnerIndex === 2) ? 1 : 2;
          const isTrumpCut = status.trumpSuit ? (winningCard.suit === status.trumpSuit && newLeadSuit !== status.trumpSuit) : false;
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
            lastTrickWinnerId: isTrumpCut ? null : winnerId,
            history: [...prev.history, { cards: newTrickCards, leadSuit: newLeadSuit, winnerId }]
          };
        });
      }, 1000);
    }
  };

  const awardRewards = (isWin: boolean) => {
    if (!user || !userProfile) return;

    const currentProg = userProfile.progression || { level: 1, xp: 0, trophies: 0 };
    const isRanked = match?.isRanked || false;

    let xpGained = isWin ? 100 : 40;
    if (gameMode === 'single') xpGained = Math.floor(xpGained / 2); // Less XP against AI

    const newXp = currentProg.xp + xpGained;
    let newTrophies = currentProg.trophies;

    if (isRanked) {
      if (isWin) {
        newTrophies += 25 + Math.floor(Math.random() * 10);
      } else {
        newTrophies = Math.max(0, newTrophies - (15 + Math.floor(Math.random() * 5)));
      }
    }

    // Award coins too
    const coinsGained = isWin ? 50 : 20;

    const newLevel = Math.floor(newXp / 500) + 1;

    updateUserProfile(user.uid, {
      'progression.xp': newXp,
      'progression.level': newLevel,
      'progression.trophies': newTrophies,
      'currency.coins': (userProfile.currency?.coins || 0) + coinsGained
    });

    setMessage(`${isWin ? 'VICTORY!' : 'DEFEAT!'} +${xpGained} XP ${isRanked ? (isWin ? `+${newTrophies - currentProg.trophies} Trophies` : `-${currentProg.trophies - newTrophies} Trophies`) : ''}`);
  };

  // Derived state for Round End
  const roundEndDetails = useMemo(() => {
    if (status.state !== 'round_end') return null;
    const sirPlayer = status.players.find(p => p.isSir);
    const sirTeamNum = (sirPlayer?.position === 'bottom' || sirPlayer?.position === 'top') ? 1 : 2;
    const winnerTeamNum = status.scores.team1.tricks === 13 ? 1 : (status.scores.team2.tricks === 13 ? 2 : (status.scores.team1.tricks > status.scores.team2.tricks ? 1 : 2));
    const is13Win = status.scores.team1.tricks === 13 || status.scores.team2.tricks === 13;
    const type = winnerTeamNum === sirTeamNum ? "Court!" : "Super Court!";
    const winTeamLabel = winnerTeamNum === 1 ? "Team 1" : "Team 2";
    return { sirTeamNum, winnerTeamNum, is13Win, type, winTeamLabel };
  }, [status.state, status.players, status.scores.team1.tricks, status.scores.team2.tricks]);

  const handleRoundEnd = (finalScores: { team1: { tricks: number }, team2: { tricks: number } }) => {
    const currentSirIndex = status.players.findIndex(p => p.isSir);
    const isSirTeam1 = currentSirIndex === 0 || currentSirIndex === 2;
    const sirTeamNum = isSirTeam1 ? 1 : 2;
    const opposingTeamNum = sirTeamNum === 1 ? 2 : 1;
    
    const sirTeamTricks = finalScores[`team${sirTeamNum}` as 'team1' | 'team2'].tricks;
    const opposingTeamTricks = finalScores[`team${opposingTeamNum}` as 'team1' | 'team2'].tricks;

    const newMatchStats = { ...status.matchStats, roundsPlayed: status.matchStats.roundsPlayed + 1 };
    let endMessage = "";
    let winnerTeamNum = 0;

    if (sirTeamTricks === 13) {
      endMessage = `COURT! Team ${sirTeamNum} won every trick!`;
      newMatchStats[`team${sirTeamNum}Courts` as keyof typeof newMatchStats]++;
      winnerTeamNum = sirTeamNum;
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#FFD700', '#FFA500', '#FFFFFF']
        });
      }, 500);
    } else if (opposingTeamTricks === 13) {
      endMessage = `SUPER COURT! Team ${opposingTeamNum} won every trick against the Sir!`;
      newMatchStats[`team${opposingTeamNum}SuperCourts` as keyof typeof newMatchStats]++;
      winnerTeamNum = opposingTeamNum;
      setTimeout(() => {
        confetti({
          particleCount: 200,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#00E5FF', '#FF00FF', '#FFFFFF']
        });
        setTimeout(() => confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0 } }), 200);
        setTimeout(() => confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1 } }), 400);
      }, 500);
      
      if (user && userProfile) {
        const isMyTeam = (opposingTeamNum === 1 && (status.turnOrder.indexOf(user.uid) === 0 || status.turnOrder.indexOf(user.uid) === 2)) ||
                        (opposingTeamNum === 2 && (status.turnOrder.indexOf(user.uid) === 1 || status.turnOrder.indexOf(user.uid) === 3));
        if (isMyTeam && !userProfile.badges.includes('super_court')) {
          updateUserProfile(user.uid, { badges: [...userProfile.badges, 'super_court'] });
        }
      }
    } else {
      winnerTeamNum = finalScores.team1.tricks > finalScores.team2.tricks ? 1 : 2;
      endMessage = `Team ${winnerTeamNum} wins the hand ${finalScores.team1.tricks}-${finalScores.team2.tricks}!`;
      
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

    if (user) {
      const isMyTeam = (winnerTeamNum === 1 && (status.turnOrder.indexOf(user.uid) === 0 || status.turnOrder.indexOf(user.uid) === 2)) ||
                      (winnerTeamNum === 2 && (status.turnOrder.indexOf(user.uid) === 1 || status.turnOrder.indexOf(user.uid) === 3));
      awardRewards(isMyTeam);
    }

    setMessage(endMessage);
    setStatus(prev => ({ 
      ...prev, 
      state: 'round_end',
      matchStats: newMatchStats 
    }));
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
            const move = getAIMove(currentPlayer, status.currentTrick, status.trumpSuit, status.aceOffMode);
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
      {!['playing', 'dealing', 'declaring_trump', 'deciding_secure', 'round_end'].includes(status.state) && (
        <nav className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-black/40 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-1.5 sm:p-2 bg-accent rounded-xl shadow-lg shadow-accent/20">
              <Trophy size={16} className="text-black sm:size-[20px]" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-lg tracking-tight">Rung Royale</h1>
            </div>
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
              className="p-2 sm:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors shadow-lg"
            >
              <Settings size={16} className="sm:size-[20px]" />
            </button>
          </div>
        </nav>
      )}

      {/* Activity Hub (Top Left) */}
      <div className="absolute top-2 left-2 sm:top-6 sm:left-6 z-20 flex flex-col gap-2 sm:gap-3 pointer-events-none">
        <AnimatePresence mode="wait">
          {message && (
            <motion.div
              key={message}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-black/80 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl border border-white/10 text-white shadow-2xl"
            >
              <p className="text-[10px] sm:text-xs font-black uppercase italic tracking-tighter opacity-80 whitespace-pre-wrap max-w-[150px] sm:max-w-[200px]">
                {message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {status.tricksInPile > 0 && status.state === 'playing' && (
           <motion.div 
             initial={{ opacity: 0, x: -20 }}
             animate={{ opacity: 1, x: 0 }}
             className="bg-accent/20 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl border border-accent/20 text-accent flex items-center gap-2 sm:gap-3 shadow-2xl self-start"
           >
             <Layers size={14} className="sm:size-[16px]" />
             <div className="flex flex-col">
               <span className="text-base sm:text-lg font-black leading-none">{status.tricksInPile}</span>
               <span className="text-[6px] sm:text-[7px] font-black uppercase tracking-widest opacity-60">Tricks</span>
             </div>
           </motion.div>
        )}
      </div>

      {/* Team Scores Top Right */}
      {['playing', 'dealing', 'declaring_trump', 'deciding_secure', 'round_end'].includes(status.state) && (
        <div className="absolute top-2 right-2 sm:top-6 sm:right-6 z-20 flex flex-col items-end gap-3">
          <div className="bg-black/80 rounded-full px-3 py-1 sm:px-6 sm:py-2 flex items-center gap-3 sm:gap-6 shadow-2xl">
             <div className="flex flex-col items-center">
               <span className="text-[7px] sm:text-[9px] font-black opacity-40 uppercase tracking-widest">T1</span>
               <span className="text-sm sm:text-lg font-black italic leading-none">{status.scores.team1.tricks}</span>
             </div>
             
             <div className="flex flex-col items-center">
                <div className="size-6 sm:size-10 rounded-full bg-white/5 flex items-center justify-center shadow-inner">
                  {status.trumpSuit ? getSuitIcon(status.trumpSuit, 14) : <Layers size={10} className="opacity-20 sm:size-[14px]" />}
                </div>
                <span className="text-[5px] sm:text-[7px] font-black opacity-40 uppercase tracking-widest mt-0.5">Trump</span>
             </div>

             <div className="flex flex-col items-center">
               <span className="text-[8px] sm:text-[9px] font-black opacity-40 uppercase tracking-widest">T2</span>
               <span className="text-base sm:text-lg font-black italic leading-none">{status.scores.team2.tricks}</span>
             </div>
          </div>
        </div>
      )}

      {/* Hand Background Tray - Removed translucent border */}
      <div className="absolute bottom-0 inset-x-0 h-24 sm:h-32 bg-white/5 pointer-events-none z-10" />

      {/* Main Game Area */}
      <main className={`relative h-screen w-full flex items-center justify-center p-0.5 sm:p-6 md:p-10 transition-all duration-500 overflow-hidden`}>
        
        {/* Table Background */}
        <div 
          className="absolute inset-0 m-0.5 sm:m-12 md:m-24 shadow-[0_40px_100px_rgba(0,0,0,0.8)] transition-all duration-1000 overflow-hidden" 
          style={{ 
            backgroundColor: theme.colors.table, 
            borderRadius: isPortrait ? '12%' : '40% 40% 40% 40% / 50% 50% 50% 50%',
            border: 'none', 
            boxShadow: `inset 0 0 120px rgba(0,0,0,0.7), 0 20px 40px rgba(0,0,0,0.6)`
          }}
        >
          {/* Felt Texture */}
          <div 
            className="absolute inset-0 opacity-20 pointer-events-none mix-blend-overlay"
            style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/felt.png')` }}
          />

          {/* Subtle noise/texture */}
          <div 
            className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay"
            style={{ backgroundImage: theme.pattern ? `url(${theme.pattern})` : 'none' }}
          ></div>
          
          {/* Trick area */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <AnimatePresence>
              {status.currentTrick.cards.map((tc, i) => {
                const player = players.find(p => p.id === tc.playerId)!;
                const pos = player.position;
                
                 // Offset calculation for the cards in central trick - Reduced for mobile
                const isMobile = window.innerWidth < 768;
                const offsetVal = isMobile ? 36 : 56;
                
                const offsets = {
                  bottom: { x: 0, y: offsetVal, rotate: 0 },
                  left: { x: -offsetVal, y: 0, rotate: 90 },
                  top: { x: 0, y: -offsetVal, rotate: 0 },
                  right: { x: offsetVal, y: 0, rotate: -90 },
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
              className={`absolute transition-all duration-500 flex items-center gap-1 sm:gap-4 ${
                pos === 'bottom' ? 'bottom-0 left-1/2 -translate-x-1/2 flex-col' :
                pos === 'top' ? 'top-0 left-1/2 -translate-x-1/2 flex-col' :
                pos === 'left' ? 'left-0 top-1/2 -translate-y-1/2 flex-row' :
                'right-0 top-1/2 -translate-y-1/2 flex-row-reverse'
              }`}
            >
              {/* Player Avatar/Info - Minimized for efficiency */}
              <div className={`flex flex-col items-center transition-transform ${isCurrent ? 'scale-105' : 'scale-90 opacity-40'}`}>
                <div className={`relative p-0.5 rounded-full border transition-colors ${isCurrent ? 'border-accent shadow-lg shadow-accent/20' : 'border-white/5'}`}>
                  <div className="bg-slate-900 p-1 sm:p-2 rounded-full shadow-inner">
                    {p.isAI ? <Bot size={14} className="text-accent sm:size-[24px]" /> : <UserIcon size={14} className="text-accent sm:size-[24px]" />}
                  </div>
                  {p.isSir && (
                    <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-1 border-2 border-slate-900 shadow-md">
                      <Trophy size={10} className="text-black" />
                    </div>
                  )}
                  {/* Card Count for others on mobile */}
                  {pos !== 'bottom' && p.hand.length > 0 && (
                    <div className="md:hidden absolute -bottom-1 -right-1 bg-white text-slate-900 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black border-2 border-slate-900 shadow-sm">
                      {p.hand.length}
                    </div>
                  )}
                  {isCurrent && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute -inset-2 border-2 border-accent rounded-full animate-pulse pointer-events-none" 
                    />
                  )}
                </div>
                <span className="text-[10px] font-black mt-1 bg-black/80 px-3 py-1 rounded-full border border-white/5 whitespace-nowrap uppercase italic tracking-tighter">
                  {p.name} {(gameMode === 'single' ? p.position === 'bottom' : p.id === user?.uid) && '(You)'}
                </span>
                {isCurrent && (
                   <span className="text-[8px] uppercase tracking-widest text-accent font-black animate-bounce mt-1">
                      {p.isAI ? 'Thinking...' : 'YOUR TURN'}
                   </span>
                )}
              </div>

              {/* Player Hand - Strictly hidden for opponents across all device types as requested */}
              <div className={`relative z-20 flex gap-1 transition-all duration-500 ${
                (pos === 'left' || pos === 'right') ? 'flex-col items-center' : 'justify-center'
              } ${status.state === 'declaring_trump' && pos === 'bottom' ? 'scale-110 mb-4' : ''} ${
                pos !== 'bottom' ? 'hidden' : 'flex'
              }`}>
                {p.hand.map((card, i) => (
                  <div 
                    key={card.id} 
                    className="transition-all duration-300"
                    style={{ 
                      marginLeft: pos === 'bottom' || pos === 'top' ? (i > 0 ? (status.state === 'declaring_trump' && pos === 'bottom' ? '-8px' : '-36px') : '0') : '0',
                      marginTop: pos === 'left' || pos === 'right' ? (i > 0 ? '-50px' : '0') : '0',
                      zIndex: i
                    }}
                  >
                    <CardUI 
                      card={card} 
                      theme={theme}
                      hidden={gameMode === 'single' ? p.position !== 'bottom' : (user ? p.id !== user.uid : p.position !== 'bottom')} 
                      disabled={status.state === 'playing' ? (!isMyTurn || !canPlayCard(card, p.hand, status.currentTrick.leadSuit)) : (status.state === 'declaring_trump' && (p.position === 'bottom') ? false : true)}
                      onClick={() => playCard(p.id, card)}
                    />
                  </div>
                ))}
                {p.hand.length === 0 && p.isAI && (
                   <div className="w-14 h-20 sm:w-18 sm:h-26 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center opacity-20">
                      <Layers size={16} />
                   </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Overlays / Modals */}
        {/* 1st Page: Auth Screen - Image 1 Style */}
        {status.state === 'auth' && (
          <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-[#020617] p-6 overflow-hidden">
             {/* Background Decorative */}
             <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-700 rounded-full blur-[120px] animate-pulse delay-700" />
             </div>

             <motion.div 
               initial={{ y: -50, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               className="relative mb-8 sm:mb-12 text-center"
             >
               <div className="flex flex-col items-center gap-2">
                 <Trophy size={60} className="text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)] sm:size-[80px]" />
                 <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-white uppercase italic leading-none">
                   RUNG <span className="text-emerald-500">ROYALE</span>
                 </h1>
                 <p className="text-emerald-300/60 font-bold uppercase tracking-[0.3em] text-[8px] sm:text-xs">Tactical Court Piece</p>
               </div>
             </motion.div>

             <div className="w-full max-w-xs space-y-4 relative z-10">
                {user ? (
                  <div className="space-y-4">
                    <div className="bg-white/10 border border-white/20 rounded-3xl p-4 text-center mb-6">
                      <p className="text-white/40 text-[10px] uppercase font-black tracking-[0.2em] mb-1">Welcome Back</p>
                      <h3 className="text-xl font-black text-white">{user.displayName}</h3>
                    </div>
                    <button 
                      onClick={() => setStatus(prev => ({ ...prev, state: 'dashboard' }))}
                      className="w-full bg-lime-500 hover:bg-lime-400 text-slate-900 font-black py-4 rounded-2xl shadow-[0_4px_0_rgb(101,163,13)] active:translate-y-1 active:shadow-none transition-all text-xl uppercase italic tracking-wider border border-white/20"
                    >
                      Play Again
                    </button>
                    <button 
                      onClick={handleSignOut}
                      className="w-full bg-white/5 hover:bg-white/10 text-white/60 font-black py-3 rounded-2xl border border-white/10 transition-all text-sm uppercase tracking-widest"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => signInWithGoogle()}
                      className="w-full bg-sky-500 hover:bg-sky-400 text-white font-black py-4 rounded-2xl shadow-[0_4px_0_rgb(2,132,199)] active:translate-y-1 active:shadow-none transition-all text-xl uppercase italic tracking-wider border border-white/20"
                    >
                      Login / Sign Up
                    </button>

                    <div className="flex items-center gap-4 py-2">
                      <div className="h-px flex-1 bg-white/20"></div>
                      <span className="text-white/40 font-bold text-sm">OR</span>
                      <div className="h-px flex-1 bg-white/20"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => handleGuestLogin()}
                        className="bg-white/10 hover:bg-white/20 text-white font-black py-4 rounded-2xl shadow-[0_4px_0_rgba(255,255,255,0.1)] active:translate-y-1 active:shadow-none transition-all text-xs uppercase italic tracking-widest border border-white/20"
                      >
                        Guest
                      </button>
                      <button 
                         onClick={() => handleGuestLogin(true)}
                         className="bg-purple-600 hover:bg-purple-500 text-white font-black py-4 rounded-2xl shadow-[0_4px_0_rgb(126,34,206)] active:translate-y-1 active:shadow-none transition-all text-xs uppercase italic tracking-widest border border-white/20"
                      >
                        Private
                      </button>
                    </div>

                    <button 
                       onClick={() => setShowJoinInput(true)}
                       className="w-full bg-white hover:bg-slate-100 text-slate-900 font-black py-4 rounded-2xl shadow-[0_4px_0_rgb(203,213,225)] active:translate-y-1 active:shadow-none transition-all text-xs uppercase italic tracking-widest border border-slate-200 mt-4"
                    >
                      Join with code
                    </button>
                  </>
                )}
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
          <div className="fixed inset-0 z-[105] bg-[#020617] flex items-center justify-center p-0 sm:p-2 overflow-hidden">
             {/* Main Dashboard Container */}
             <div className="w-full sm:max-w-[420px] h-full sm:max-h-[850px] bg-[#020617]/90 sm:rounded-[3rem] border-0 sm:border-2 border-emerald-500/10 flex flex-col p-4 shadow-2xl relative overflow-hidden">
               {/* Top Bar */}
               <div className="flex items-center justify-between gap-2 mb-4 pointer-events-auto shrink-0 pt-2">
                 <button 
                   onClick={() => setActiveTab('shop')}
                   className="bg-black/40 px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5 hover:bg-black/60 transition-colors active:scale-95"
                 >
                    <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
                       <span className="text-[9px] font-black text-black">C</span>
                    </div>
                    <span className="text-[11px] font-black">{userProfile?.currency?.coins || 0}</span>
                    <Plus size={10} className="text-lime-400" />
                 </button>
                 
                 {/* Middle Icon - could be a level info or rank badge */}
                 <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-lime-500 rounded-full border-2 border-white/40 flex items-center justify-center shadow-[0_0_15px_rgba(132,204,22,0.4)]">
                       <Trophy size={14} className="text-lime-900" />
                    </div>
                 </div>

                 <div className="flex items-center gap-2">
                   <button 
                     onClick={() => setActiveTab('shop')}
                     className="bg-black/40 px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5 hover:bg-black/60 transition-colors active:scale-95"
                   >
                      <div className="w-5 h-5 bg-emerald-400 rounded-full flex items-center justify-center shadow-lg rotate-45">
                         <Diamonds size={10} className="text-emerald-900" />
                      </div>
                      <span className="text-[11px] font-black">{userProfile?.currency?.gems || 0}</span>
                      <Plus size={10} className="text-lime-400" />
                   </button>
                   <button 
                     onClick={() => setShowSettings(true)}
                     className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 hover:bg-white/20 transition-all active:scale-95"
                   >
                     <Settings size={16} />
                   </button>
                 </div>
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
             <div className="flex-1 overflow-y-auto pb-20 sm:pb-4">
                {activeTab === 'home' && (
                  <>
                     {/* Welcome Header */}
                     <div className="w-full border border-white/20 rounded-xl py-2 px-4 mb-4 text-center">
                       <span className="text-[10px] font-black uppercase text-white tracking-[0.3em]">Welcome to Court Piece Royale</span>
                     </div>
                     <div className="bg-purple-900/60 border border-white/10 p-3 rounded-[2rem] flex items-center justify-between mb-4 shadow-lg">
                       <div className="flex items-center gap-3">
                         <div className="w-14 h-14 bg-slate-700 rounded-2xl border-2 border-white/20 flex items-center justify-center overflow-hidden">
                            {user?.photoURL ? (
                              <img src={user.photoURL} alt="p" className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon size={28} className="text-white/40" />
                            )}
                         </div>
                         <div className="flex-1">
                            <h3 className="font-black text-base leading-none mb-1">Rajab Nasir</h3>
                            <div className="flex items-center gap-2">
                               <div className="bg-lime-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded uppercase leading-none">Lvl {userProfile?.progression?.level || 1}</div>
                               <div className="w-16 h-1.5 bg-black/40 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-lime-500" 
                                    style={{ width: `${Math.min(100, ((userProfile?.progression?.xp || 0) % 500) / 5)}%` }}
                                  />
                               </div>
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-yellow-400 font-bold text-[9px] uppercase">
                              <Trophy size={10} /> {userProfile?.progression?.trophies || 0}
                            </div>
                         </div>
                       </div>
                       <div className="flex gap-1 items-end pt-2">
                          <div className={`w-8 h-10 rounded-lg flex flex-col items-center justify-center relative transition-all ${userProfile?.badges.includes('super_court') ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-black/40 opacity-40'}`}>
                             <Trophy size={10} className={userProfile?.badges.includes('super_court') ? 'text-yellow-400' : 'text-white/20'} />
                             <div className="text-[6px] font-black uppercase mt-1 opacity-40">Lvl 4</div>
                          </div>
                          <div className={`w-8 h-10 rounded-lg flex flex-col items-center justify-center relative transition-all ${userProfile?.badges.includes('five_streak') ? 'bg-orange-500/20 border border-orange-500/50' : 'bg-black/40 opacity-40'}`}>
                             <RotateCcw size={10} className={userProfile?.badges.includes('five_streak') ? 'text-orange-400' : 'text-white/20'} />
                             <div className="text-[6px] font-black uppercase mt-1 opacity-40">Lvl 4</div>
                          </div>
                          <div className={`w-8 h-10 bg-black/40 rounded-lg flex flex-col items-center justify-center relative opacity-40`}>
                             <Lock size={10} className="text-white/20" />
                             <div className="text-[6px] font-black uppercase mt-1 opacity-40">Lvl 5</div>
                          </div>
                       </div>
                    </div>

              {/* Main Game Options - Side by Side */}
               <div className="space-y-4">
                    {homeSubView === 'main' ? (
                       <div className="grid grid-cols-2 gap-4 auto-rows-min">
                          <motion.button 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowPracticeSetup(true)}
                            className="aspect-square bg-yellow-500 rounded-[2rem] p-0.5 shadow-[0_8px_0_rgb(161,98,7)] relative group overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                            <div className="w-full h-full bg-yellow-500 rounded-[1.8rem] flex flex-col items-center justify-center border-2 border-yellow-400">
                              <div className="bg-yellow-600/30 w-full h-[60%] flex items-center justify-center relative leading-none">
                                  <div className="flex gap-1.5">
                                    <Trophy size={40} className="text-yellow-900/80" />
                                    <Bot size={40} className="text-yellow-900/80" />
                                  </div>
                              </div>
                              <div className="w-full h-[40%] flex items-center justify-center px-1 text-center">
                                <span className="font-black text-base uppercase tracking-tighter italic text-yellow-900/90 leading-tight">Practice Match</span>
                              </div>
                            </div>
                          </motion.button>
 
                          <motion.button 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setHomeSubView('arena')}
                            className="aspect-square bg-emerald-500 rounded-[2rem] p-0.5 shadow-[0_8px_0_rgb(5,150,105)] relative group overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                            <div className="w-full h-full bg-emerald-500 rounded-[1.8rem] flex flex-col items-center justify-center border-2 border-emerald-400">
                               <div className="bg-emerald-600/30 w-full h-[60%] flex items-center justify-center relative group leading-none">
                                   <Globe size={44} className="text-lime-300 group-hover:scale-110 transition-transform" />
                               </div>
                               <div className="w-full h-[40%] flex items-center justify-center px-1 text-center">
                                 <span className="font-black text-base uppercase tracking-tighter italic text-emerald-900/90 leading-tight">Online Arena</span>
                               </div>
                            </div>
                          </motion.button>
                       </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <button onClick={() => setHomeSubView('main')} className="text-[10px] font-black uppercase text-accent/60 flex items-center gap-1 hover:text-accent transition-colors">
                        <Plus size={10} className="rotate-45" /> Back to menu
                      </button>
                      <span className="text-[10px] font-black uppercase text-white/20 tracking-widest italic">Battle Terminal</span>
                    </div>
                    
                     <motion.button 
                       whileHover={{ scale: 1.01 }}
                       whileTap={{ scale: 0.99 }}
                       onClick={() => handleFindMatch(true)}
                       disabled={joining}
                       className={`w-full bg-indigo-600 rounded-3xl border-b-6 border-indigo-800 p-5 flex items-center justify-center text-white shadow-xl transition-all ${joining ? 'opacity-50 grayscale cursor-wait' : ''}`}
                     >
                        <div className="flex items-center gap-4">
                          <Trophy size={32} className={joining ? 'animate-bounce' : ''} />
                          <div className="text-left">
                            <h4 className="text-lg font-black italic uppercase tracking-tighter leading-none mb-0.5">Ranked Battle</h4>
                            <p className="text-[8px] font-bold opacity-60 uppercase">Win Trophies & Increase Rank</p>
                          </div>
                        </div>
                     </motion.button>
                     
                     <motion.button 
                       whileHover={{ scale: 1.01 }}
                       whileTap={{ scale: 0.99 }}
                       onClick={() => handleFindMatch(false)}
                       disabled={joining}
                       className={`w-full bg-emerald-500 rounded-3xl border-b-6 border-emerald-700 p-5 flex items-center justify-center text-slate-900 shadow-xl transition-all ${joining ? 'opacity-50 grayscale cursor-wait' : ''}`}
                     >
                        <div className="flex items-center gap-4">
                          <Globe size={32} className={joining ? 'animate-spin' : ''} />
                          <div className="text-left">
                            <h4 className="text-lg font-black italic uppercase tracking-tighter leading-none mb-0.5">Casual Match</h4>
                            <p className="text-[8px] font-bold opacity-60 uppercase">Join available global lobbies</p>
                          </div>
                        </div>
                     </motion.button>

                     <div className="grid grid-cols-2 gap-3 pt-2">
                       <motion.button 
                         whileHover={{ scale: 1.02 }}
                         whileTap={{ scale: 0.98 }}
                         onClick={() => setShowJoinInput(true)}
                         className="bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-white shadow-lg font-black uppercase italic tracking-tighter"
                       >
                         <Lock size={20} className="text-accent" />
                         <span className="text-xs">Join Code</span>
                       </motion.button>
                       <motion.button 
                         whileHover={{ scale: 1.02 }}
                         whileTap={{ scale: 0.98 }}
                         onClick={() => handleCreateMatch('private')}
                         className="bg-white rounded-2xl border-b-4 border-slate-300 p-4 flex flex-col items-center justify-center gap-2 text-slate-900 shadow-lg font-black uppercase italic tracking-tighter"
                       >
                         <Plus size={20} />
                         <span className="text-xs">Private Room</span>
                       </motion.button>
                     </div>
                  </div>
                )}
</div>
            </>
          )}

          {activeTab === 'shop' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setActiveTab('home')} className="text-xs font-black uppercase text-accent/60 flex items-center gap-1 hover:text-accent transition-colors">
                  <Plus size={12} className="rotate-45" /> Back
                </button>
                <h2 className="text-2xl font-black italic uppercase italic">Royal Shop</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 {[
                   {n:'1k Coins',p:'$0.99',i:<Trophy/>,c:'yellow', p_id: 'coins', a: 1000},
                   {n:'5k Coins',p:'$3.99',i:<Trophy/>,c:'yellow', p_id: 'coins', a: 5000},
                   {n:'50 Gems',p:'$4.99',i:<Diamonds/>,c:'emerald', p_id: 'gems', a: 50},
                   {n:'200 Gems',p:'$14.99',i:<Diamonds/>,c:'emerald', p_id: 'gems', a: 200}
                 ].map((item,idx)=>(
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-3xl p-4 flex flex-col items-center gap-3">
                    <div className={`w-12 h-12 bg-${item.c}-500 rounded-xl flex items-center justify-center shadow-lg text-slate-900`}>{item.i}</div>
                    <p className="font-black text-sm italic">{item.n}</p>
                    <button 
                      onClick={() => buyCurrency(item.p_id as any, item.a)}
                      className="bg-emerald-500 text-slate-900 w-full rounded-xl py-1 text-xs font-black uppercase italic active:scale-95 transition-all"
                    >
                      {item.p}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'friends' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex justify-between items-center bg-black/20 p-4 rounded-3xl border border-white/5 mb-4">
                <button onClick={() => setActiveTab('home')} className="text-xs font-black uppercase text-accent/60 flex items-center gap-1 hover:text-accent transition-colors">
                  <Plus size={12} className="rotate-45" /> Back
                </button>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-black italic uppercase">Friends</h2>
                  <button className="p-2 bg-accent rounded-xl text-slate-900 shadow-lg"><Plus size={16}/></button>
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-3xl p-2 flex items-center gap-2 mb-4">
                 <div className="p-2 text-white/40"><UserIcon size={16}/></div>
                 <input 
                   type="text" 
                   placeholder="Search friends by ID or Name..." 
                   value={friendSearchQuery}
                   onChange={(e) => setFriendSearchQuery(e.target.value)}
                   className="bg-transparent border-none outline-none text-xs w-full font-bold"
                 />
              </div>
              <div className="space-y-2">
                {userProfile?.friends && userProfile.friends.length > 0 ? (
                  userProfile.friends
                    .filter(f => f.displayName.toLowerCase().includes(friendSearchQuery.toLowerCase()) || f.uid.includes(friendSearchQuery))
                    .map(friend => (
                    <div key={friend.uid} className="bg-white/5 border border-white/10 p-3 rounded-2xl flex items-center justify-between animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center border border-white/10">
                          <UserIcon size={20} className="text-white/40" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{friend.displayName}</p>
                          <div className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${friend.status === 'online' ? 'bg-lime-500 shadow-[0_0_8px_rgba(132,204,22,0.6)]' : 'bg-slate-600'}`} />
                            <p className={`text-[9px] font-black uppercase tracking-widest ${friend.status === 'online' ? 'text-lime-500' : 'text-white/20'}`}>{friend.status}</p>
                          </div>
                        </div>
                      </div>
                      <button className="px-3 py-1 bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-accent hover:text-slate-900 transition-all active:scale-95">Duel</button>
                    </div>
                  ))
                ) : (
                  <div className="bg-black/20 rounded-3xl p-8 border border-white/5 text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Users size={32} className="text-white/10" />
                    </div>
                    <p className="text-white/40 font-bold text-sm mb-1">No Friends Found</p>
                    <p className="text-[10px] text-white/20 uppercase tracking-widest">Search for rivals to begin your climb</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'clubs' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setActiveTab('home')} className="text-xs font-black uppercase text-accent/60 flex items-center gap-1">
                  <Plus size={12} className="rotate-45" /> Back
                </button>
                <h2 className="text-2xl font-black italic uppercase italic">Clubs</h2>
              </div>
              <div className="grid grid-cols-1 gap-3">
                 {[
                   { n: 'Vanguard Elites', m: '42/50', t: '5.2k' },
                   { n: 'Rung Masters', m: '12/50', t: '1.8k' },
                   { n: 'Royale Knights', m: '30/50', t: '3.4k' }
                 ].map((club, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/10 p-4 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg text-white">
                             <Users size={24} />
                          </div>
                          <div>
                             <p className="font-black italic text-sm">{club.n}</p>
                             <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{club.m} Members</p>
                          </div>
                       </div>
                       <div className="text-right">
                          <div className="flex items-center gap-1 text-yellow-400 font-bold text-xs mb-1">
                             <Trophy size={10} /> {club.t}
                          </div>
                          <button className="bg-white/10 px-3 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-white text-slate-900 transition-all">Join</button>
                       </div>
                    </div>
                 ))}
                 <button className="w-full py-4 bg-lime-500 rounded-3xl text-slate-900 font-black uppercase italic shadow-[0_4px_0_rgb(101,163,13)] active:translate-y-1 active:shadow-none transition-all mt-4">
                   Create My Club
                 </button>
              </div>
            </div>
          )}

          {activeTab === 'chest' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
               <div className="flex items-center justify-between mb-4">
                <button onClick={() => setActiveTab('home')} className="text-xs font-black uppercase text-accent/60 flex items-center gap-1">
                  <Plus size={12} className="rotate-45" /> Back
                </button>
                <h2 className="text-2xl font-black italic uppercase italic">Mystic Chests</h2>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-[2.5rem] p-8 text-slate-900 relative overflow-hidden group shadow-2xl">
                 <Layers size={120} className="absolute -right-8 -bottom-8 text-amber-900/20 group-hover:scale-125 transition-all duration-700 rotate-12" />
                 <div className="relative z-10 flex flex-col items-center text-center">
                    <div className={`p-6 bg-white/20 rounded-full mb-4 shadow-inner ${openingChest ? 'animate-bounce' : ''}`}>
                       <Trophy size={60} className="text-amber-900" />
                    </div>
                    <h3 className="text-3xl font-black italic uppercase leading-none mb-2 tracking-tighter">Golden Treasure</h3>
                    <p className="text-xs font-black uppercase opacity-70 mb-8 tracking-widest">Unleash Royal Rewards</p>
                    
                    <button 
                      onClick={openChest}
                      disabled={openingChest}
                      className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase italic text-sm shadow-[0_4px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-wait"
                    >
                      {openingChest ? 'Opening...' : 'Open (10 Gems)'}
                    </button>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-8 opacity-40 grayscale pointer-events-none">
                 <div className="bg-white/5 border border-dashed border-white/20 rounded-[2rem] p-6 flex flex-col items-center text-center">
                    <Lock size={24} className="mb-2" />
                    <p className="text-[10px] font-black uppercase">Silver Box</p>
                 </div>
                 <div className="bg-white/5 border border-dashed border-white/20 rounded-[2rem] p-6 flex flex-col items-center text-center">
                    <Lock size={24} className="mb-2" />
                    <p className="text-[10px] font-black uppercase">Royal Pack</p>
                 </div>
              </div>
            </div>
          )}
        </div>

             {/* Native Mobile Bottom Navigation */}
             <div className="absolute bottom-0 inset-x-0 h-16 sm:h-20 sm:static sm:mt-2 bg-[#020617] sm:bg-black/60 p-1 sm:rounded-[2.5rem] border-t sm:border border-white/5 shrink-0 flex items-center justify-around z-20">
                {[
                  { icon: <ShoppingBag size={20} />, label: 'Shop', id: 'shop' },
                  { icon: <Users size={20} />, label: 'Friends', id: 'friends' },
                  { icon: <Home size={22} />, label: 'Home', id: 'home' },
                  { icon: <Trophy size={20} />, label: 'Stats', id: 'clubs' },
                  { icon: <Layers size={20} />, label: 'Chest', id: 'chest' }
                ].map((item: any) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button 
                      key={item.id} 
                      onClick={() => setActiveTab(item.id as any)}
                      className={`flex flex-col items-center justify-center flex-1 h-full rounded-2xl sm:rounded-3xl transition-all ${isActive ? 'text-accent sm:bg-white/10 sm:text-white sm:shadow-inner' : 'text-white/40'}`}
                    >
                      <div className={`mb-1 transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]' : ''}`}>{item.icon}</div>
                      <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest leading-none ${isActive ? 'opacity-100' : 'opacity-60'}`}>{item.label}</span>
                    </button>
                  );
                })}
             </div>
          </div>
        </div>
      )}

        {/* 3rd Page: Room Lobby - Updated with Ace Toggle */}
        {status.state === 'multiplayer_lobby' && match && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 overflow-y-auto">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-slate-900 border-2 border-accent/20 rounded-[2.5rem] p-6 sm:p-10 max-w-md w-full text-center shadow-2xl relative"
            >
               <div className="mb-4 flex flex-col items-center">
                 <div className="px-3 sm:px-4 py-1 bg-white/10 rounded-full border border-white/10 mb-4 flex items-center gap-1.5 sm:gap-2 group relative">
                   <span className="hidden sm:inline text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Room ID</span>
                   <span className="text-base sm:text-lg font-mono font-bold text-accent tracking-tighter">{match.matchId}</span>
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

                <div className="grid grid-cols-2 gap-3 my-6">
                 {[0, 1, 2, 3].map(i => {
                    const p = match.players[i];
                    const isHost = match.hostId === user?.uid;
                    return (
                      <div key={i} className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all ${p ? 'bg-accent/10 border-accent/40' : 'bg-white/5 border-dashed border-white/10 opacity-60'}`}>
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center ${p ? 'bg-accent text-slate-900' : 'bg-white/10 text-slate-500'}`}>
                           {p?.isAI ? <Bot size={16} /> : <UserIcon size={16} />}
                         </div>
                         <div className="flex flex-col items-center">
                           <span className="text-[10px] font-black truncate max-w-full italic">{p ? p.name : 'Empty Slot'}</span>
                           <span className="text-[6px] font-black uppercase tracking-widest opacity-40 leading-none mt-0.5">{['Bottom', 'Left', 'Top', 'Right'][i]}</span>
                         </div>
                         {!p && isHost && (
                           <button 
                             onClick={() => addAIPlayer(match.matchId)}
                             className="mt-1 text-[7px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-full border border-white/10 transition-all active:scale-95"
                           >
                             Add AI
                           </button>
                         )}
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
                  history: [],
                  aceOffMode: status.aceOffMode
                };
                startMatch(match.matchId, initialState as any);
                     }}
                     className="w-full bg-accent text-slate-900 font-bold py-4 rounded-2xl hover:bg-white transition-all shadow-lg"
                   >
                     {match.players.length === 4 ? 'Start Battle' : 'Fill with AI & Start'}
                   </button>
                   <button 
                     onClick={() => setStatus(prev => ({ ...prev, state: 'dashboard' }))}
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
          <div className="fixed inset-x-0 top-0 z-[100] flex items-start justify-center p-2 pt-[4vh] select-none bg-black/20 pointer-events-none">
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-slate-900/95 border border-white/10 rounded-2xl p-3 sm:p-5 max-w-[280px] sm:max-w-md w-full shadow-2xl text-center pointer-events-auto"
            >
              <h2 className="text-sm sm:text-lg font-black uppercase tracking-tight mb-3 italic">Trump Suit</h2>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
                {SUITS.map(suit => (
                  <button
                    key={suit}
                    onClick={() => declareTrump(suit)}
                    className="flex flex-col items-center gap-1.5 p-2 sm:p-4 bg-slate-800 border border-white/5 rounded-xl transition-all hover:scale-105 hover:border-accent hover:bg-slate-700 active:scale-95 group shadow-lg"
                  >
                    {suit === 'hearts' && <Heart size={20} className="text-red-500 fill-red-500" />}
                    {suit === 'diamonds' && <Diamonds size={20} className="text-red-500 fill-red-500" />}
                    {suit === 'clubs' && <Club size={20} className="text-white fill-white group-hover:text-accent" />}
                    {suit === 'spades' && <Spade size={20} className="text-white fill-white group-hover:text-accent" />}
                    <span className="font-black text-[8px] sm:text-xs uppercase tracking-tighter">{suit}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {status.state === 'deciding_secure' && status.pendingSecureTeam && !status.players[status.currentPlayerIndex].isAI && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80">
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-slate-900 border-2 border-accent/20 rounded-3xl p-6 sm:p-10 max-w-sm sm:max-w-md w-full text-center shadow-2xl relative overflow-y-auto max-h-[95vh]"
            >
              <div className="text-accent mb-4">
                <Trophy size={48} className="mx-auto sm:size-[64px]" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Team {status.pendingSecureTeam} Threshold</h2>
              <p className="text-sm sm:text-base text-slate-400 mb-6 sm:mb-8">
                You have won {status.pendingSecureTeam === 1 ? status.scores.team1.tricks : status.scores.team2.tricks} tricks. 
                Do you want to mark this set as SAFE or play for COURT?
              </p>
              
              <div className="flex flex-col gap-3 sm:gap-4">
                <button 
                  onClick={handleSecure}
                  className="w-full bg-emerald-600 text-white font-bold py-4 sm:py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/10 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1"
                >
                  <Trophy size={20} />
                  <span>Mark as Safe</span>
                </button>
                <button 
                  onClick={handleGoForAll}
                  className="w-full bg-slate-800 text-white border-2 border-white/10 font-bold py-4 sm:py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-700 hover:border-accent/40 transition-all shadow-xl"
                >
                  <ChevronRight size={20} />
                  <span>Play for Court</span>
                </button>
              </div>
              <p className="mt-4 sm:mt-6 text-[8px] sm:text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed">
                Winning the set avoids losing. The winner of the hand needs the most tricks.
              </p>
            </motion.div>
          </div>
        )}

        {status.state === 'round_end' && roundEndDetails && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-4 bg-black/98 overflow-y-auto">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 30 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               className="bg-[#020617] border-0 sm:border border-emerald-500/20 rounded-none sm:rounded-[3rem] p-4 sm:p-10 max-w-xl w-full h-full sm:h-auto text-center shadow-2xl relative overflow-hidden sm:max-h-[90vh] flex flex-col justify-center"
            >
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
              
              <div className="mb-4 sm:mb-6 inline-block relative shrink-0">
                <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full scale-150 animate-pulse" />
                <div className="relative text-accent p-3 sm:p-5 bg-slate-800/80 rounded-full border-2 border-accent/30 shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)] mx-auto w-fit">
                  <Trophy size={40} className="sm:size-[56px]" />
                </div>
              </div>

              <div className="min-h-[70px] sm:min-h-[100px] flex flex-col justify-center mb-4 sm:mb-6 shrink-0">
                {roundEndDetails.is13Win ? (
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col items-center"
                  >
                    <div className="relative mb-2">
                       <h2 className="text-3xl sm:text-7xl font-black uppercase italic tracking-tighter text-white leading-none drop-shadow-[0_4px_12px_rgba(255,255,255,0.2)]">
                         {roundEndDetails.type}
                       </h2>
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: "100%" }}
                         className="absolute -bottom-1 left-0 h-1 bg-accent rounded-full shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]"
                       />
                    </div>
                    <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] sm:tracking-[0.5em] text-accent animate-pulse">Absolute Triumph!</p>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center">
                    <h2 className="text-3xl sm:text-5xl font-black uppercase italic tracking-tighter text-white mb-2 drop-shadow-md leading-none">Round Over</h2>
                    <p className="text-[10px] sm:text-[11px] opacity-40 uppercase font-black tracking-[0.4em] text-slate-400">Final Hand Results</p>
                  </div>
                )}
              </div>
              
               <div className="bg-black/50 rounded-2xl sm:rounded-[2.5rem] p-3 sm:p-8 mb-4 sm:mb-8 border border-white/5 shadow-[inset_0_2px_20px_rgba(0,0,0,0.4)] relative overflow-hidden shrink-0">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
                
                <div className="grid grid-cols-2 gap-2 sm:gap-12 text-center relative z-10 min-h-[100px] sm:h-32 items-center">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-16 sm:h-20 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                  
                  <div className="flex flex-col items-center justify-center space-y-1">
                     <div className="flex items-center gap-1.5 mb-1 h-4">
                        <p className={`text-[9px] sm:text-[11px] uppercase font-black tracking-widest transition-all duration-300 ${roundEndDetails.winnerTeamNum === 1 ? 'text-accent opacity-100 scale-105' : 'opacity-30 text-white'}`}>
                           Team 1
                        </p>
                        {roundEndDetails.sirTeamNum === 1 && <div className="size-1.5 sm:size-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" title="Sir Team" />}
                     </div>
                     <div className="relative inline-flex items-center justify-center h-12 sm:h-16">
                        <p className={`text-4xl sm:text-7xl font-black italic tracking-tighter select-none transition-all duration-500 ${status.scores.team1.tricks === 13 ? 'text-accent drop-shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)]' : 'text-white'}`}>
                           {status.scores.team1.tricks}
                        </p>
                        {status.scores.team1.tricks === 13 && (
                          <motion.div 
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 12 }}
                            className="absolute -top-4 -right-4 bg-accent text-slate-900 text-[7px] sm:text-[9px] font-black py-0.5 px-1.5 sm:py-1.5 sm:px-3 rounded-full uppercase tracking-widest shadow-xl border-2 border-slate-900"
                          >
                            Winner
                          </motion.div>
                        )}
                     </div>
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-1">
                     <div className="flex items-center gap-1.5 mb-1 h-4">
                        <p className={`text-[9px] sm:text-[11px] uppercase font-black tracking-widest transition-all duration-300 ${roundEndDetails.winnerTeamNum === 2 ? 'text-accent opacity-100 scale-105' : 'opacity-30 text-white'}`}>
                           Team 2
                        </p>
                        {roundEndDetails.sirTeamNum === 2 && <div className="size-1.5 sm:size-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" title="Sir Team" />}
                     </div>
                     <div className="relative inline-flex items-center justify-center h-12 sm:h-16">
                        <p className={`text-4xl sm:text-7xl font-black italic tracking-tighter select-none transition-all duration-500 ${status.scores.team2.tricks === 13 ? 'text-accent drop-shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)]' : 'text-white'}`}>
                           {status.scores.team2.tricks}
                        </p>
                        {status.scores.team2.tricks === 13 && (
                          <motion.div 
                            initial={{ scale: 0, rotate: 20 }}
                            animate={{ scale: 1, rotate: -12 }}
                            className="absolute -top-4 -right-4 bg-accent text-slate-900 text-[7px] sm:text-[9px] font-black py-0.5 px-1.5 sm:py-1.5 sm:px-3 rounded-full uppercase tracking-widest shadow-xl border-2 border-slate-900"
                          >
                            Winner
                          </motion.div>
                        )}
                     </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:gap-3.5 relative z-10">
                <button 
                  onClick={() => startNewGame(true)}
                  className="w-full bg-emerald-600 text-white font-black uppercase italic py-3 sm:py-4.5 rounded-xl sm:rounded-[1.25rem] flex items-center justify-center gap-2 sm:gap-3 hover:bg-emerald-500 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 group"
                >
                  <RotateCcw size={18} className="sm:size-[22px] group-hover:rotate-180 transition-transform duration-700 ease-out" />
                  <span className="text-lg sm:text-xl tracking-tight">Next Hand</span>
                </button>
                <button 
                  onClick={() => setStatus(prev => ({ ...prev, state: 'dashboard' }))}
                  className="w-full bg-slate-800/40 text-white/50 font-black uppercase tracking-[0.2em] text-[11px] py-4 rounded-[1.25rem] flex items-center justify-center gap-2 hover:bg-slate-700/60 hover:text-white transition-all border border-white/5 active:scale-[0.98]"
                >
                  <LogOut size={16} className="text-red-500/70" />
                  <span>Exit To Lobby</span>
                </button>
              </div>
              
              {/* Subtle background decor */}
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-accent/5 blur-[60px] rounded-full pointer-events-none" />
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-500/5 blur-[60px] rounded-full pointer-events-none" />
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

      {/* Practice Setup Modal */}
      <AnimatePresence>
        {showPracticeSetup && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border-2 border-white/10 rounded-[3rem] p-8 max-w-sm w-full text-center shadow-2xl relative"
            >
              <div className="bg-yellow-500 w-20 h-20 rounded-3xl mx-auto flex items-center justify-center shadow-xl mb-6 -mt-16 rotate-12">
                 <Bot size={40} className="text-yellow-900" />
              </div>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-2">Practice Setup</h2>
              <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-8">Configure your training session</p>
              
              <div className="space-y-6 mb-10 text-left">
                <div className="bg-white/5 border border-white/10 p-5 rounded-3xl">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black uppercase italic">Ace-Off Rule</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold ${status.aceOffMode ? 'opacity-40' : 'text-accent'}`}>OFF</span>
                      <button 
                        onClick={() => setStatus(prev => ({ ...prev, aceOffMode: !prev.aceOffMode }))}
                        className={`w-10 h-6 rounded-full relative transition-colors ${status.aceOffMode ? 'bg-emerald-500' : 'bg-slate-700'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${status.aceOffMode ? 'left-5' : 'left-1'}`} />
                      </button>
                      <span className={`text-[10px] font-bold ${status.aceOffMode ? 'text-accent' : 'opacity-40'}`}>ON</span>
                    </div>
                  </div>
                  <p className="text-[9px] opacity-60 leading-relaxed">
                    {status.aceOffMode 
                      ? "ACE-OFF ON: The Ace remains the highest card, but winning a trick with it prevents securing that pile immediately. A harder challenge." 
                      : "ACE-OFF OFF: Classic Rung. The Ace is the highest card and can be used to secure trick piles normally."}
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center justify-between">
                  <span className="text-xs font-black uppercase italic text-white/40">AI Partners</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${aiPartnersEnabled ? 'opacity-40' : 'text-accent'}`}>OFF</span>
                    <button 
                      onClick={() => setAiPartnersEnabled(!aiPartnersEnabled)}
                      className={`w-10 h-6 rounded-full relative transition-colors ${aiPartnersEnabled ? 'bg-lime-500' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${aiPartnersEnabled ? 'left-5' : 'left-1'}`} />
                    </button>
                    <span className={`text-[10px] font-bold ${aiPartnersEnabled ? 'text-accent' : 'opacity-40'}`}>ON</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => { setShowPracticeSetup(false); setGameMode('single'); startNewGame(); }}
                  className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-500 shadow-xl shadow-emerald-500/10 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 transition-all"
                >
                  START PRACTICE
                </button>
                <button 
                  onClick={() => setShowPracticeSetup(false)}
                  className="text-[10px] font-black uppercase text-white/40 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-black/80 z-[200]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-slate-900 z-[201] shadow-2xl p-8 border-l border-white/10 overflow-y-auto"
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

      {/* Join Room Modal */}
      <AnimatePresence>
        {showJoinInput && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJoinInput(false)}
              className="fixed inset-0 bg-black/90 z-[200]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-slate-900 z-[201] p-8 rounded-[2.5rem] border border-white/10 shadow-2xl"
            >
              <h2 className="text-2xl font-black italic uppercase italic mb-6">Enter Room Code</h2>
              <input 
                autoFocus
                placeholder="EX: KF92LA"
                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-4 text-center text-3xl font-mono font-black uppercase tracking-widest text-accent focus:border-accent transition-all mb-6 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleJoinMatch((e.target as HTMLInputElement).value.toUpperCase());
                    setShowJoinInput(false);
                  }
                }}
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowJoinInput(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 rounded-2xl py-4 font-black uppercase italic text-xs tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  onClick={(e) => {
                    const input = (e.currentTarget.parentElement?.previousElementSibling as HTMLInputElement);
                    handleJoinMatch(input.value.toUpperCase());
                    setShowJoinInput(false);
                  }}
                  className="flex-1 bg-accent text-slate-900 rounded-2xl py-4 font-black uppercase italic text-xs tracking-widest"
                >
                  Join Match
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
