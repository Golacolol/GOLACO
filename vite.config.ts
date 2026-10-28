import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function listImageFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXTS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function writePlayerImageManifest(imagesDir: string, outFile: string): string[] {
  const names = listImageFiles(imagesDir);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  // Relative paths so assetUrl(BASE_URL) works on file:// and GitHub Pages.
  fs.writeFileSync(outFile, `${JSON.stringify({ images: names.map((n) => `images/${n}`) }, null, 2)}\n`);
  return names;
}

function copyAudioAssets(root: string, outDir: string): void {
  const audioDir = path.join(root, "audio");
  if (!fs.existsSync(audioDir)) return;
  const destDir = path.join(outDir, "audio");
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(audioDir)) {
    if (!name.toLowerCase().endsWith(".mp3")) continue;
    fs.copyFileSync(path.join(audioDir, name), path.join(destDir, name));
  }
}

function playerImagesPlugin(): Plugin {
  const root = process.cwd();
  const imagesDir = path.join(root, "images");
  const audioDir = path.join(root, "audio");
  const manifestPath = path.join(root, "public", "data", "playerImages.json");

  const refreshLeagueResults = () => {
    try {
      const result = spawnSync(process.execPath, [path.join(root, "scripts", "refresh-league-results.mjs")], {
        cwd: root,
        encoding: "utf8",
        timeout: 45000,
      });
      if (result.stdout?.trim()) console.log(result.stdout.trim());
      if (result.status !== 0) {
        console.warn("[league-results]", result.stderr?.trim() || `refresh exited ${result.status}`);
      }
    } catch (error) {
      console.warn("[league-results]", error instanceof Error ? error.message : error);
    }
  };

  const sendJson = (res: import("http").ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };

  return {
    name: "player-images",
    buildStart() {
      fs.mkdirSync(imagesDir, { recursive: true });
      writePlayerImageManifest(imagesDir, manifestPath);
      if (process.env.SKIP_RESULTS_REFRESH !== "1") refreshLeagueResults();
    },
    configureServer(server) {
      fs.mkdirSync(imagesDir, { recursive: true });
      writePlayerImageManifest(imagesDir, manifestPath);
      if (process.env.SKIP_RESULTS_REFRESH !== "1") refreshLeagueResults();

      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";

        if (url === "/api/player-images" && req.method === "GET") {
          const names = listImageFiles(imagesDir);
          sendJson(res, 200, { images: names.map((n) => `images/${n}`) });
          return;
        }

        if (url === "/api/player-images" && req.method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                filename?: string;
                data?: string;
              };
              const rawName = path.basename(parsed.filename ?? "upload.png").replace(/[^\w.\-]+/g, "_");
              const ext = path.extname(rawName).toLowerCase();
              if (!IMAGE_EXTS.has(ext)) {
                sendJson(res, 400, { error: "Unsupported image type" });
                return;
              }
              const data = parsed.data ?? "";
              const base64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
              const buf = Buffer.from(base64, "base64");
              if (!buf.length) {
                sendJson(res, 400, { error: "Empty image data" });
                return;
              }
              fs.mkdirSync(imagesDir, { recursive: true });
              fs.writeFileSync(path.join(imagesDir, rawName), buf);
              writePlayerImageManifest(imagesDir, manifestPath);
              sendJson(res, 200, { path: `images/${rawName}` });
            } catch (error) {
              sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          });
          return;
        }

        if (url.startsWith("/images/")) {
          const rel = decodeURIComponent(url.slice("/images/".length));
          const file = path.resolve(imagesDir, rel);
          if (!file.startsWith(imagesDir + path.sep) && file !== imagesDir) {
            res.statusCode = 403;
            res.end("Forbidden");
            return;
          }
          if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404;
            res.end("Not found");
            return;
          }
          const ext = path.extname(file).toLowerCase();
          const types: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
          };
          res.setHeader("Content-Type", types[ext] ?? "application/octet-stream");
          res.setHeader("Cache-Control", "no-cache");
          fs.createReadStream(file).pipe(res);
          return;
        }

        if (url.startsWith("/audio/")) {
          const rel = decodeURIComponent(url.slice("/audio/".length));
          const file = path.resolve(audioDir, rel);
          if (!file.startsWith(audioDir + path.sep) && file !== audioDir) {
            res.statusCode = 403;
            res.end("Forbidden");
            return;
          }
          if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404;
            res.end("Not found");
            return;
          }
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "public, max-age=86400");
          fs.createReadStream(file).pipe(res);
          return;
        }

        next();
      });
    },
    closeBundle() {
      const outDir = path.resolve(root, "dist");
      const destDir = path.join(outDir, "images");
      fs.mkdirSync(destDir, { recursive: true });
      for (const name of listImageFiles(imagesDir)) {
        fs.copyFileSync(path.join(imagesDir, name), path.join(destDir, name));
      }
      writePlayerImageManifest(imagesDir, path.join(outDir, "data", "playerImages.json"));
      copyAudioAssets(root, outDir);
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [playerImagesPlugin()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    open: false,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
  preview: {
    port: 4173,
    host: "127.0.0.1",
  },
}));
