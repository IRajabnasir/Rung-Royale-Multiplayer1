import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  getDocs,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match, MatchState, PlayerPosition } from '../types';

export const createMatch = async (userId: string, userName: string, type: 'public' | 'private' = 'public') => {
  const matchId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const matchRef = doc(db, 'matches', matchId);
  
  const newMatch: Partial<Match> = {
    matchId,
    hostId: userId,
    type,
    status: 'waiting',
    playerIds: [userId],
    players: [{
      id: userId,
      name: userName,
      position: 'bottom',
      isAI: false,
      ready: true
    }],
    state: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(matchRef, newMatch);
  return matchId;
};

export const joinMatch = async (matchId: string, userId: string, userName: string) => {
  const matchRef = doc(db, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  
  if (!matchSnap.exists()) throw new Error('Match not found');
  
  const match = matchSnap.data() as Match;
  if (match.status !== 'waiting') throw new Error('Match already started');
  if (match.players.length >= 4) throw new Error('Match full');
  if (match.playerIds.includes(userId)) return;

  const positions: string[] = ['bottom', 'left', 'top', 'right'];
  const takenPositions = match.players.map(p => p.position);
  const nextPosition = positions.find(pos => !takenPositions.includes(pos as any)) as any;

  await updateDoc(matchRef, {
    playerIds: [...match.playerIds, userId],
    players: [...match.players, {
      id: userId,
      name: userName,
      position: nextPosition,
      isAI: false,
      ready: true
    }],
    updatedAt: serverTimestamp()
  });
};

export const startMatch = async (matchId: string, initialState: MatchState) => {
  const matchRef = doc(db, 'matches', matchId);
  await updateDoc(matchRef, {
    status: 'playing',
    state: initialState,
    updatedAt: serverTimestamp()
  });
};

export const updateMatchState = async (matchId: string, newState: MatchState) => {
  const matchRef = doc(db, 'matches', matchId);
  await updateDoc(matchRef, {
    state: newState,
    updatedAt: serverTimestamp()
  });
};

export const addAIPlayer = async (matchId: string) => {
  const matchRef = doc(db, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) return;
  const match = matchSnap.data() as Match;
  if (match.players.length >= 4) return;

  const positions: PlayerPosition[] = ['bottom', 'left', 'top', 'right'];
  const takenPositions = match.players.map(p => p.position);
  const nextPos = positions.find(pos => !takenPositions.includes(pos))!;

  const aiPlayer = {
    id: `ai-${Math.random().toString(36).substring(2, 5)}`,
    name: `Bot ${match.players.length}`,
    position: nextPos,
    isAI: true,
    ready: true
  };

  await updateDoc(matchRef, {
    players: [...match.players, aiPlayer],
    updatedAt: serverTimestamp()
  });
};

export const listenToMatch = (matchId: string, callback: (match: Match) => void) => {
  return onSnapshot(doc(db, 'matches', matchId), (doc) => {
    if (doc.exists()) {
      callback(doc.data() as Match);
    }
  });
};

export const findPublicMatches = async () => {
  const q = query(collection(db, 'matches'), where('status', '==', 'waiting'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map(doc => doc.data() as Match)
    .filter(m => m.type === 'public');
};
