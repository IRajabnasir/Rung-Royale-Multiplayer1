import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  stats: {
    wins: number;
    sets: number;
    courts: number;
    superCourts: number;
    winStreak: number;
    maxWinStreak: number;
  };
  currency: {
    coins: number;
    gems: number;
  };
  friends: {
    uid: string;
    displayName: string;
    status: 'online' | 'offline';
  }[];
  badges: string[];
}

export const syncUserProfile = async (user: any) => {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const newUser: UserProfile = {
      uid: user.uid,
      displayName: user.displayName || 'Anonymous',
      email: user.email,
      photoURL: user.photoURL,
      stats: {
        wins: 0,
        sets: 0,
        courts: 0,
        superCourts: 0,
        winStreak: 0,
        maxWinStreak: 0
      },
      currency: {
        coins: 500,
        gems: 10
      },
      friends: [],
      badges: []
    };
    await setDoc(userRef, newUser);
    return newUser;
  } else {
    return userSnap.data() as UserProfile;
  }
};

export const updateUserProfile = async (uid: string, updates: Partial<UserProfile> | Record<string, any>) => {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, updates);
};
