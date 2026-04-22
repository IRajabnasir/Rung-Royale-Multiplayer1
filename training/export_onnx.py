"""Export a trained policy to ONNX for in-app inference."""
import argparse
from pathlib import Path
import torch
from train import PolicyNet, N_OBS, N_ACT

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--checkpoint', required=True)
    ap.add_argument('--output', default='models/rungroyale_policy.onnx')
    args = ap.parse_args()

    net = PolicyNet()
    net.load_state_dict(torch.load(args.checkpoint, map_location='cpu'))
    net.eval()

    dummy_x = torch.zeros(1, N_OBS)
    dummy_m = torch.ones(1, N_ACT)

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        net, (dummy_x, dummy_m), args.output,
        input_names=['obs', 'legal_mask'],
        output_names=['logits'],
        dynamic_axes={'obs': {0: 'batch'}, 'legal_mask': {0: 'batch'}, 'logits': {0: 'batch'}},
        opset_version=17,
    )
    print(f"Exported → {args.output}")

if __name__ == '__main__':
    main()
