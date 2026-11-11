import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './ui/style.css';
import { Game } from './core/Game';

async function boot() {
  // fonts are used inside canvas-drawn signage, so they must be ready first
  await Promise.all([document.fonts.load('400 40px "Lilita One"'), document.fonts.load('800 20px Nunito')]).catch(() => {});
  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  (window as unknown as { __game: Game }).__game = game; // debug/e2e hook
  (window as unknown as { __APP_BUILT_CHECK: () => string }).__APP_BUILT_CHECK = () => __APP_BUILT__;
  await game.init();
}
boot().catch((e) => {
  console.error(e);
  document.querySelector('#splash .load p')!.textContent = 'Could not load the game. Check your connection and reload.';
});

