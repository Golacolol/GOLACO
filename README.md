# SD Football (Argyle Football)

Browser-based Three.js football match themed around Plymouth Argyle and Home Park. Teams, players, memberships, fixtures, venues and advertising are data-driven.

Player names and ratings are gameplay data, not official licensed likenesses or ratings.

## Run (dev server)

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

On Mac/Windows you can also double-click `Play.command` / `Play.bat` (starts the Vite server).

## Play offline (no server)

Browsers cannot load the TypeScript source entry (`index.html` + `/src/main.ts`) as a local file. Build a static bundle first:

```bash
npm install
npm run build
```

Then open **`dist/index.html`** (double-click or File → Open).  
The build uses relative asset paths (`base: "./"`) and inlines JS/CSS so it works from `file://` and from any static host.

> Keep the whole `dist/` folder together (`index.html` plus `assets/`, `images/`, `audio/`, `data/`).

## GitHub Pages / static hosting

```bash
npm run build
```

Deploy the contents of `dist/` (project site or root). Relative URLs work for both `https://user.github.io/repo/` and custom domains.

## Test

```bash
npm test
```

## Controls

Keyboard:

- `WASD` / arrows — move / aim
- `Space` — short pass (hold for power)
- `Shift+Space` — through ball
- `F` — chip / lofted pass
- `X` — shoot (hold for power)
- `C` — cross
- `Q` — switch player
- `E` — sprint
- `Ctrl` — jockey / contain
- After kick — nudge aim for aftertouch (early window)
- `Esc` — pause

Controller (standard mapping):

- Left stick — move / pass intent
- Right stick — shot aim / aftertouch
- A — pass
- B — shoot
- X — cross
- Y — through pass
- L3 — chip
- LB/RB — switch
- RT — sprint
- LT — jockey
- Start — pause

After 60 seconds without input, autoplay / attract mode starts. Any gameplay input returns control.

## Data

JSON in `public/data/`:

- `players.json` — canonical player database
- `teams.json` — team records
- `teamMemberships.json` — multi-team memberships and optional rating overrides
- `lineups.json` — starting XIs
- `fixtures.json` — next fixture
- `stadiums.json` — Home Park LED screen + Central Park traditional board
- `advertising.json` — replaceable perimeter boards
- `stories.json` — future campaign outline only

Optional image pack under `public/assets/` (portraits, crests, kits). See `src/data/AssetPack.ts`.

Edits in the in-game editors save to `localStorage`.

## License

MIT — see [LICENSE](LICENSE).
