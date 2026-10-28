# Image pack (players + crests)

Drop faces and emblems here. The game resolves them automatically.

## Players

Put portraits at:

```
public/assets/players/{playerId}.png
```

Examples:

- `public/assets/players/player_hardie.png`
- `public/assets/players/classic_bergkamp.png`

Also accepted: `.webp`, `.jpg`

If `appearance.portraitAsset` is already set on a player record, that wins.

## Team crests

```
public/assets/crests/{teamId}.png
```

Examples:

- `public/assets/crests/plymouth_argyle_current.png`
- `public/assets/crests/classic_arsenal_2003_04.png`

Short aliases also work ( `_current` / season suffix stripped).

## Kits (shirt wrap textures)

Drop home / away shirt PNGs here — they wrap onto player torsos and arms in-match:

```
public/assets/kits/{teamId}_home.png
public/assets/kits/{teamId}_away.png
```

Examples:

- `public/assets/kits/plymouth_argyle_current_home.png`
- `public/assets/kits/plymouth_argyle_current_away.png`

Also accepted: `.webp`, `.jpg`. Short team-id aliases work like crests.

**Formats**

- Square / portrait jersey textures — used as a full cylindrical wrap (front + back).
- Wide FTS-style kit atlases — the left shirt-body panel is cropped automatically.

Numbers are overlaid at runtime. Missing files fall back to procedural stripes from the team kit colours.

Prematch **Kit Select** (Formation panel) chooses AUTO / HOME / AWAY. AUTO puts the away side in their away strip when shirts clash.

### Import kits

```bash
npm run assets:kits
# current English clubs only (faster):
npm run assets:kits -- --current-only
# force re-download:
npm run assets:kits -- --force
# or from a local pack of {club}_home.png / {club}_away.png:
node scripts/import-kits.mjs --local /path/to/kits
```

Fetches jersey art via TheSportsDB (`strEquipment` + equipment 1st/2nd). Gaps fall back to procedural wraps from each club’s kit colours. Rate-limited — leave it running.

### Import (crests only)

```bash
npm run assets:crests
# or from a local logo pack:
node scripts/import-crests.mjs --local /path/to/logos
# force re-download:
npm run assets:crests -- --force
```

Fetches badges via TheSportsDB into `public/assets/crests/`. Club trademarks remain with their owners — keep packs private / personal use.

## Optional manifest

Edit `public/data/assetPack.json` to map IDs to custom paths or set a fallback portrait pool:

```json
{
  "players": { "player_hardie": "/assets/players/hardie_custom.webp" },
  "crests": { "plymouth_argyle_current": "/assets/crests/pafc.png" },
  "kits": {
    "plymouth_argyle_current_home": "/assets/kits/argyle_home.png",
    "plymouth_argyle_current_away": "/assets/kits/argyle_away.png"
  },
  "fallbackPortraits": ["/assets/players/_generic_01.png"]
}
```

Missing portraits/crests fall back to kit-number badges / abbreviation discs (img `onerror`). Missing kit PNGs keep procedural shirt colours.
