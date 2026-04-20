/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Rank, Suit, Theme } from './types';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

export const THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic Club',
    colors: {
      bg: '#1a472a', // Deep felt green
      table: '#2d5a3f',
      cardFront: '#ffffff',
      cardBack: '#b91c1c', // Royal Red
      accent: '#facc15', // Gold
      text: '#ffffff',
    },
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'midnight',
    name: 'Midnight Royale',
    colors: {
      bg: '#0f172a', // Midnight blue
      table: '#1e293b',
      cardFront: '#f8fafc',
      cardBack: '#334155',
      accent: '#818cf8',
      text: '#f8fafc',
    },
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'luxury',
    name: 'Gold & Ivory',
    colors: {
      bg: '#f5f2ed', // Warm parchment
      table: '#e7e5e4',
      cardFront: '#ffffff',
      cardBack: '#78350f', // Deep wood
      accent: '#d97706', // Amber gold
      text: '#1c1917',
    },
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'cyber',
    name: 'Cyberpunk',
    colors: {
      bg: '#050505',
      table: '#111111',
      cardFront: '#1a1a1a',
      cardBack: '#f0abfc', // Neon pink
      accent: '#22d3ee', // Cyan
      text: '#ffffff',
    },
    fontFamily: 'JetBrains Mono, monospace'
  }
];
