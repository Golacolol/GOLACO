import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5173;
const URL = `http://127.0.0.1:${PORT}/`;

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.ok || (res.status > 0 && res.status < 500);
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin" ? `open "${url}"` : process.platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

function waitFor(url, ms = 40000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await isUp(url)) return resolve(true);
      if (Date.now() - start > ms) return reject(new Error("Timed out waiting for the game server."));
      setTimeout(tick, 250);
    };
    tick();
  });
}

if (!existsSync(join(root, "node_modules"))) {
  await new Promise((resolve, reject) => {
    const install = spawn("npm", ["install"], { cwd: root, stdio: "inherit", shell: true });
    install.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("npm install failed"))));
  });
}

const already = await isUp(URL);
if (!already) {
  const child = spawn("npm", ["run", "dev"], { cwd: root, stdio: "inherit", shell: true });
  child.on("error", (err) => {
    console.error(err);
    process.exit(1);
  });
  await waitFor(URL);
  openBrowser(URL);
  console.log(`GOLAÇO → ${URL}`);
  await new Promise((resolve) => child.on("exit", resolve));
} else {
  openBrowser(URL);
  console.log(`GOLAÇO → ${URL}`);
}
