// Fonts ship with the game (no network needed) and include Cyrillic.
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/cyrillic-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/cyrillic-700.css";
import "@fontsource/rubik-wet-paint/latin-400.css";
import "@fontsource/rubik-wet-paint/cyrillic-400.css";

const FACES = ['400 16px "JetBrains Mono"', '700 16px "JetBrains Mono"', '400 16px "Rubik Wet Paint"'];
const TIMEOUT = 3000;

/** Canvas text is rasterised once, so fonts must be ready before the first label is drawn. */
export async function loadFonts(): Promise<void> {
  const loads = Promise.all(FACES.map(f => document.fonts.load(f, "AaЯя0")));
  await Promise.race([loads, new Promise(r => setTimeout(r, TIMEOUT))]).catch(() => undefined);
}
