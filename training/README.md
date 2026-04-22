# Rung Royale — AI Training Pipeline

Offline imitation-learning pipeline for the Rung Royale AI. Consumes telemetry
events logged by the app into the `game_events` Firestore collection and
produces an ONNX / TFLite model that can be bundled into future app builds.

## Overview

```
game_events (Firestore)
  │
  ▼  export (BigQuery or JSON dump)
data/raw/events_*.jsonl
  │
  ▼  encode.py      (state → tensor, action → label)
data/encoded/*.npz
  │
  ▼  train.py       (supervised imitation of top-20% winners)
models/checkpoints/policy_*.pt
  │
  ▼  export_onnx.py
models/rungroyale_policy.onnx
```

## Prerequisites

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Steps

### 1. Export events from Firestore

Two easy options:

**Option A — BigQuery (recommended).** Enable the Firebase → BigQuery
extension for the `game_events` collection. BigQuery table becomes queryable.

**Option B — gcloud firestore export** to Cloud Storage, then download.

For testing, use `scripts/sample_data.py` to synthesize fake events.

### 2. Encode

```bash
python encode.py --input data/raw --output data/encoded
```

Produces `(X, y, mask)` tensors. X = 156-dim observation (52 hand + 52 trick +
52 voids summary + other); y = 52-dim one-hot over action cards;
mask = 52-dim legal action mask.

### 3. Train

```bash
python train.py --epochs 30 --batch-size 256
```

Only the top 20% of human players (by win rate) are used as training targets.
The model learns to predict winning players' moves from observations.

### 4. Export

```bash
python export_onnx.py --checkpoint models/checkpoints/best.pt
```

Produces a ~1 MB ONNX file. Loaded in-app via `onnxruntime-web`.

## Minimum data requirements

Imitation learning starts producing a better-than-heuristic model around
**10,000 decisions** from winning players — that's ~200 full games worth of
logged events.
