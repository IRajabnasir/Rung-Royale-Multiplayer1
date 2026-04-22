"""Generate synthetic training data so encode.py / train.py can be tested
before real telemetry exists."""
import json
import random
from pathlib import Path

SUITS = ['hearts', 'diamonds', 'clubs', 'spades']
RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']

def make_card():
    return {'rank': random.choice(RANKS), 'suit': random.choice(SUITS)}

def make_event(i):
    hand = [make_card() for _ in range(random.randint(3, 8))]
    action = random.choice(hand)
    return {
        'type': 'play_card',
        'matchId': f'sim-{i // 52}',
        'handNumber': 0,
        'trickNumber': i % 13,
        'playerId': f'player-{i % 4}',
        'isAI': False,
        'position': ['bottom','left','top','right'][i % 4],
        'trumpSuit': random.choice(SUITS),
        'leadSuit': random.choice(SUITS + [None]),
        'aceOffMode': False,
        'actorHand': hand,
        'trickSoFar': [],
        'legalActions': hand,
        'actionCard': action,
        'teamScoresBefore': {'team1': random.randint(0, 6), 'team2': random.randint(0, 6)},
    }

def main():
    out = Path('data/raw')
    out.mkdir(parents=True, exist_ok=True)
    with open(out / 'sim.jsonl', 'w') as f:
        for i in range(10000):
            f.write(json.dumps(make_event(i)) + '\n')
    print(f"Wrote 10000 synthetic events → {out/'sim.jsonl'}")

if __name__ == '__main__':
    main()
