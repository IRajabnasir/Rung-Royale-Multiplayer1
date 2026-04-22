"""
Train an imitation policy on encoded Rung telemetry.

The model is a small feed-forward net (~400k params) that maps a 162-dim
observation to a 52-dim distribution over cards, masked to legal moves.
"""
import argparse
import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset

N_OBS = 162
N_ACT = 52

class PolicyNet(nn.Module):
    def __init__(self, hidden=256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(N_OBS, hidden),
            nn.GELU(),
            nn.Linear(hidden, hidden),
            nn.GELU(),
            nn.Linear(hidden, N_ACT),
        )
    def forward(self, x, mask):
        logits = self.net(x)
        # Impossible actions get log-prob -inf
        logits = logits.masked_fill(mask < 0.5, -1e9)
        return logits

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default='data/encoded/train.npz')
    ap.add_argument('--epochs', type=int, default=30)
    ap.add_argument('--batch-size', type=int, default=256)
    ap.add_argument('--lr', type=float, default=3e-4)
    ap.add_argument('--out', default='models/checkpoints')
    args = ap.parse_args()

    Path(args.out).mkdir(parents=True, exist_ok=True)

    d = np.load(args.data)
    X = torch.from_numpy(d['X']).float()
    Y = torch.from_numpy(d['Y']).float()
    M = torch.from_numpy(d['mask']).float()

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Device: {device}    Train examples: {len(X)}")

    ds = TensorDataset(X, Y, M)
    dl = DataLoader(ds, batch_size=args.batch_size, shuffle=True)

    net = PolicyNet().to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=args.lr)

    for epoch in range(args.epochs):
        losses = []
        for x, y, m in dl:
            x, y, m = x.to(device), y.to(device), m.to(device)
            logits = net(x, m)
            target = y.argmax(dim=-1)
            loss = F.cross_entropy(logits, target)
            opt.zero_grad()
            loss.backward()
            opt.step()
            losses.append(loss.item())
        print(f"epoch {epoch+1:02d} | loss {np.mean(losses):.4f}")

    ckpt = Path(args.out) / 'best.pt'
    torch.save(net.state_dict(), ckpt)
    print(f"Saved → {ckpt}")

if __name__ == '__main__':
    main()
