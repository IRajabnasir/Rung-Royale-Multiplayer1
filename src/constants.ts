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
      bg: '#1a472a',
      table: '#245134',
      cardFront: '#ffffff',
      cardBack: '#b91c1c',
      accent: '#facc15',
      text: '#ffffff',
    },
    pattern: 'https://www.transparenttextures.com/patterns/felt.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/pinstriped-suit.png',
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'midnight',
    name: 'Midnight Noir',
    colors: {
      bg: '#050505',
      table: '#111111',
      cardFront: '#f8fafc',
      cardBack: '#1e293b',
      accent: '#6366f1',
      text: '#f8fafc',
    },
    pattern: 'https://www.transparenttextures.com/patterns/carbon-fibre.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/diagonal-stripes.png',
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'solar',
    name: 'Solar Flare',
    colors: {
      bg: '#450a0a',
      table: '#7f1d1d',
      cardFront: '#fff7ed',
      cardBack: '#ea580c',
      accent: '#fbbf24',
      text: '#fff7ed',
    },
    pattern: 'https://www.transparenttextures.com/patterns/pinstriped-suit.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/honey-comb.png',
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'cyber',
    name: 'Cyber Royale',
    colors: {
      bg: '#0f172a',
      table: '#1e1b4b',
      cardFront: '#1e293b',
      cardBack: '#d946ef',
      accent: '#06b6d4',
      text: '#ffffff',
    },
    pattern: 'https://www.transparenttextures.com/patterns/circuit-board.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/glamour.png',
    fontFamily: 'JetBrains Mono, monospace'
  },
  {
    id: 'forest',
    name: 'Royal Forest',
    colors: {
      bg: '#064e3b',
      table: '#065f46',
      cardFront: '#ecfdf5',
      cardBack: '#166534',
      accent: '#4ade80',
      text: '#ecfdf5',
    },
    pattern: 'https://www.transparenttextures.com/patterns/wood-pattern.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/leaf.png',
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'neon',
    name: 'Neon Oasis',
    colors: {
      bg: '#1e1b4b',
      table: '#312e81',
      cardFront: '#ffffff',
      cardBack: '#f472b6',
      accent: '#22d3ee',
      text: '#ffffff',
    },
    pattern: 'https://www.transparenttextures.com/patterns/black-linen.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/cubes.png',
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'desert',
    name: 'Desert Sands',
    colors: {
      bg: '#451a03',
      table: '#78350f',
      cardFront: '#fff7ed',
      cardBack: '#b45309',
      accent: '#fbbf24',
      text: '#fff7ed',
    },
    pattern: 'https://www.transparenttextures.com/patterns/sandpaper.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/wave-grid.png',
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'ocean',
    name: 'Ocean Mist',
    colors: {
      bg: '#083344',
      table: '#164e63',
      cardFront: '#f0f9ff',
      cardBack: '#0284c7',
      accent: '#7dd3fc',
      text: '#f0f9ff',
    },
    pattern: 'https://www.transparenttextures.com/patterns/wave-grid.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/circles.png',
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'sakura',
    name: 'Sakura Zen',
    colors: {
      bg: '#4c0519',
      table: '#881337',
      cardFront: '#fff1f2',
      cardBack: '#f43f5e',
      accent: '#fb7185',
      text: '#fff1f2',
    },
    pattern: 'https://www.transparenttextures.com/patterns/flowering-jasmine.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/floral.png',
    fontFamily: 'Inter, sans-serif'
  },
  {
    id: 'tactical',
    name: 'Night Scope',
    colors: {
      bg: '#020617',
      table: '#0f172a',
      cardFront: '#f1f5f9',
      cardBack: '#059669',
      accent: '#10b981',
      text: '#f8fafc',
    },
    pattern: 'https://www.transparenttextures.com/patterns/carbon-fibre.png',
    cardPattern: 'https://www.transparenttextures.com/patterns/pixel-weave.png',
    fontFamily: 'JetBrains Mono, monospace'
  }
];
