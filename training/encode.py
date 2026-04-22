"""
Encode raw telemetry events into training tensors.

Input: JSONL files of play_card events from Firestore.
Output: .npz files with X (obs), y (action label), mask (legal actions).

Observation layout (52*3 + 6 = 162 dims):
  [0..52)    : actor hand  (1 if held, else 0)                  — 52 suits×ranks
  [52..104)  : trick so far (1 if played in current trick)      — 52
  [104..156) : cards seen this hand (1 if played in any trick)  — 52
  [156]      : trump suit one-hot -> compressed into 4 floats   — 4 dims
  [160]      : my team tricks this round (normalized)           — 1
  [161]      : opp team tricks this round (normalized)          — 1

Label: one of 52 card indices = chosen card.
Mask:  52-dim binary — which of the 52 are legal given lead suit + hand.
"""
import argparse
import json
import os
from pathlib import Path

import numpy as np

SUITS = ['hearts', 'diamonds', 'clubs', 'spades']
RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
N = 52  # 4*13

def card_index(rank: str, suit: str) -> int:
    return SUITS.index(suit) * 13 + RANKS.index(rank)

def trump_onehot(trump):
    v = np.zeros(4, dtype=np.float32)
    if trump in SUITS:
        v[SUITS.index(trump)] = 1.0
    return v

def encode_event(e) -> dict:
    hand = np.zeros(N, dtype=np.float32)
    for c in e['actorHand']:
        hand[card_index(c['rank'], c['suit'])] = 1.0

    trick = np.zeros(N, dtype=np.float32)
    for tc in e['trickSoFar']:
        c = tc['card']
        trick[card_index(c['rank'], c['suit'])] = 1.0

    # "seen this hand" requires cross-event context; leave zeros for now.
    seen = np.zeros(N, dtype=np.float32)

    trump = trump_onehot(e.get('trumpSuit'))
    my_score = np.array([min(1.0, e['teamScoresBefore']['team1'] / 13.0)], dtype=np.float32)
    opp_score = np.array([min(1.0, e['teamScoresBefore']['team2'] / 13.0)], dtype=np.float32)

    x = np.concatenate([hand, trick, seen, trump, my_score, opp_score])

    y = np.zeros(N, dtype=np.float32)
    y[card_index(e['actionCard']['rank'], e['actionCard']['suit'])] = 1.0

    mask = np.zeros(N, dtype=np.float32)
    for c in e['legalActions']:
        mask[card_index(c['rank'], c['suit'])] = 1.0

    return {'x': x, 'y': y, 'mask': mask}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True, help='Dir of .jsonl files')
    ap.add_argument('--output', required=True, help='Output .npz path')
    args = ap.parse_args()

    X, Y, M = [], [], []
    for jsonl in Path(args.input).glob('*.jsonl'):
        with open(jsonl) as f:
            for line in f:
                e = json.loads(line)
                if e.get('type') != 'play_card':
                    continue
                enc = encode_event(e)
                X.append(enc['x'])
                Y.append(enc['y'])
                M.append(enc['mask'])

    os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
    np.savez_compressed(
        args.output,
        X=np.stack(X),
        Y=np.stack(Y),
        mask=np.stack(M),
    )
    print(f"Encoded {len(X)} decisions → {args.output}")

if __name__ == '__main__':
    main()
