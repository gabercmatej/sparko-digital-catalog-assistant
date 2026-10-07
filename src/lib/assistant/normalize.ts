/**
 * Slovenian text normalization for retrieval and intent detection.
 * Pure and deterministic: lowercase, strip diacritics, unify "S-BUDGET", drop punctuation,
 * light suffix stemming so inflections (skuta/skute/skuto/skuti, zrezek/zrezki) collapse.
 */

/** Lowercase, strip diacritics (č→c, š→s, ž→z, ć→c, đ→d), unify S-BUDGET, punctuation → space. */
export function fold(input: string): string {
  let s = input.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/đ/g, "d");
  // "s-budget", "s budget", "s–budget", "sbudget" → "sbudget"
  s = s.replace(/\bs\s*[-–—]?\s*budget\b/g, "sbudget");
  // keep digits, letters, decimal comma/point between digits, € and %
  s = s.replace(/(\d)[,.](\d)/g, "$1·$2");
  s = s.replace(/€/g, " eur ");
  s = s.replace(/%/g, " odstotkov ");
  s = s.replace(/[^a-z0-9·\s]/g, " ");
  s = s.replace(/·/g, ",");
  return s.replace(/\s+/g, " ").trim();
}

/** Function words and question words that carry no product meaning. */
export const STOPWORDS = new Set(
  (
    "a ali in pa je so sem si smo ste bo bi da ne kaj kako koliko kje kdaj kateri katera katero katere " +
    "stane stanejo stal cena cene ceno cenah za na v pri po od do iz z s k h o mi me ti te tebi meni " +
    "imam imate imas imamo ima imajo nekaj kupim kupiti kupis nakupim nakupiti lahko prosim hvala mogoce morda se tudi samo ze res zelo kak kaksna kaksen kaksno " +
    "zdaj danes tukaj tu tam ta to ti te tega temu tem tisti tista tisto ena en eno " +
    "pokazi pokaz povej poisci najdi isci iscem zanima zanimajo rad rada bi hocem hotel hotela zelim " +
    "izdelek izdelka izdelki izdelke izdelkov ponudba ponudbe ponudbo katalog katalogu kataloga letak letaku letaka " +
    "evro evra evrov eur kos kosov pakiranje pakiranja"
  ).split(" "),
);

const SUFFIXES = ["ega", "emu", "ima", "ami", "ih", "im", "om", "em", "ov", "ev", "ja", "je", "ji", "jo", "a", "e", "i", "o", "u"];

/** Light Slovenian stemmer. Keeps at least 3 characters. Not linguistically complete by design. */
export function stem(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token;
  let t = token;
  for (const suf of SUFFIXES) {
    if (t.endsWith(suf) && t.length - suf.length >= 3) {
      // "jajca" → "jajc", but keep "j" inside stems like "jajce"→"jajc"
      t = t.slice(0, -suf.length);
      break;
    }
  }
  // fleeting e: zrezek → zrezk, kruhek → kruhk, jajec → jajc
  if (t.length >= 5 && /[^aeiou]e[kc]$/.test(t)) t = t.slice(0, -2) + t.slice(-1);
  return t;
}

/** Folded tokens (no stopword removal). */
export function tokens(input: string): string[] {
  const f = fold(input);
  return f ? f.split(" ") : [];
}

/** Content tokens: folded, stopwords removed, single letters removed. */
export function contentTokens(input: string, extraStop?: Set<string>): string[] {
  return tokens(input).filter((t) => t.length > 1 && !STOPWORDS.has(t) && !(extraStop && extraStop.has(t)));
}

/** Damerau-free Levenshtein distance with early exit above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** True if `phrase` (already folded) occurs in `text` (already folded) on word boundaries. */
export function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}
