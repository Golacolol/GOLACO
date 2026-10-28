import { Game } from "./core/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const ui = document.querySelector<HTMLElement>("#ui-root");
if (!canvas || !ui) throw new Error("Missing canvas or UI root");

const game = new Game(canvas, ui);
game.start().catch((err) => {
  console.error(err);
  ui.innerHTML = `<div class="boot-error">Failed to start. ${String(err)}</div>`;
});
