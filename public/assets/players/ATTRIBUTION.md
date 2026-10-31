# Player 3D assets

## `base_outfield.glb`

Shared skinned humanoid (Mixamo **Vanguard** mesh + Idle/Walk/Run clips), adapted for GOLACO.

- Forward axis in the file is **−Z**; `PlayerVisual.attachSkinnedBody` applies `rotation.y = Math.PI` so it matches gameplay facing (+Z, same as the procedural mannequin).
- Materials: `VanguardBodyMat`, `Vanguard_VisorMat` (visor skipped for kit tint).
- Replace with a football-specific rig anytime — see `public/assets/README.md` (`modelId` / `fullBodyAsset`).
