// Product search that understands Sinhala names typed in English ("Singlish").
//
//   matchScore(product, query)  0 = no match, higher = better match
//   matchesProduct(product, query)
//
// It looks at name, searchAlias, code and barcode. Sinhala names are also turned
// into a Latin phonetic form, and both sides are compared by a loose "sound
// skeleton" (vowels dropped, th/t, dh/d, w/v ... folded), so typing
// "yakada", "thahadu", "barrel", "bata", "thamba", "piththala", "motor" or
// "gear" finds යකඩ, තහඩු, බැරල්, බට, තඹ, පිත්තල, මෝටර්, ගියර් even when the
// searchAlias is empty.

const CONS = {
  ක: "k", ඛ: "kh", ග: "g", ඝ: "gh", ඞ: "ng", ඟ: "ng",
  ච: "ch", ඡ: "chh", ජ: "j", ඣ: "jh", ඤ: "ny", ඥ: "gn",
  ට: "t", ඨ: "th", ඩ: "d", ඪ: "dh", ණ: "n", ඬ: "nd",
  ත: "t", ථ: "th", ද: "d", ධ: "dh", න: "n", ඳ: "nd",
  ප: "p", ඵ: "ph", බ: "b", භ: "bh", ම: "m", ඹ: "mb",
  ය: "y", ර: "r", ල: "l", ව: "v", ශ: "sh", ෂ: "sh", ස: "s", හ: "h", ළ: "l", ෆ: "f",
};
const INDEP_VOWELS = {
  අ: "a", ආ: "aa", ඇ: "ae", ඈ: "aae", ඉ: "i", ඊ: "ii", උ: "u", ඌ: "uu", ඍ: "ru",
  එ: "e", ඒ: "ee", ඓ: "ai", ඔ: "o", ඕ: "oo", ඖ: "au",
};
const VOWEL_SIGNS = {
  "\u0DCF": "aa", "\u0DD0": "ae", "\u0DD1": "aae", "\u0DD2": "i", "\u0DD3": "ii",
  "\u0DD4": "u", "\u0DD6": "uu", "\u0DD8": "ru", "\u0DD9": "e", "\u0DDA": "ee",
  "\u0DDB": "ai", "\u0DDC": "o", "\u0DDD": "oo", "\u0DDE": "au",
};
const VIRAMA = "\u0DCA";
const ZWJ = "\u200D";
const HAS_SINHALA = /[\u0D80-\u0DFF]/;

// Sinhala text -> rough Latin phonetics, e.g. "යකඩ" -> "yakada", "තහඩු" -> "tahadu".
export function sinhalaToLatin(text) {
  const s = String(text || "").replace(new RegExp(ZWJ, "g"), "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (CONS[ch]) {
      const next = s[i + 1];
      if (next === VIRAMA) {
        out += CONS[ch];
        i += 1;
      } else if (VOWEL_SIGNS[next]) {
        out += CONS[ch] + VOWEL_SIGNS[next];
        i += 1;
      } else {
        out += CONS[ch] + "a";
      }
    } else if (INDEP_VOWELS[ch]) out += INDEP_VOWELS[ch];
    else if (ch === "\u0D82") out += "n"; // anusvara
    else if (ch === "\u0D83") out += "h"; // visarga
    else if (/[\u0D80-\u0DFF]/.test(ch)) continue;
    else out += ch;
  }
  return out;
}

// Loose "sound skeleton" of a Latin word: same for spelling variants.
export function skeleton(word) {
  let w = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  w = w
    .replace(/ea/g, "iya") // gear -> giyar
    .replace(/ch/g, "\u0001")
    .replace(/c/g, "k")
    .replace(/\u0001/g, "c")
    .replace(/sh/g, "s")
    .replace(/th/g, "t").replace(/dh/g, "d").replace(/kh/g, "k").replace(/gh/g, "g")
    .replace(/ph/g, "p").replace(/bh/g, "b").replace(/jh/g, "j")
    .replace(/w/g, "v").replace(/q/g, "k").replace(/x/g, "ks").replace(/z/g, "j");
  w = w.replace(/[aeiou]/g, "");
  return w.replace(/(.)\1+/g, "$1");
}

const cache = new WeakMap();
function haystack(p) {
  let h = cache.get(p);
  if (h) return h;
  const base = `${p.name || ""} ${p.searchAlias || ""}`;
  const romanized = HAS_SINHALA.test(base) ? sinhalaToLatin(base) : "";
  const raw = `${base} ${romanized} ${p.code || ""} ${p.barcode || ""}`.toLowerCase();
  const skels = [];
  for (const tok of `${base} ${romanized}`.split(/[\s,;/\-_.()]+/)) {
    const sk = skeleton(HAS_SINHALA.test(tok) ? sinhalaToLatin(tok) : tok);
    if (sk) skels.push(sk);
  }
  h = { raw, skels };
  cache.set(p, h);
  return h;
}

export function matchScore(product, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return 1;
  const h = haystack(product);
  let total = 0;
  for (const word of q.split(/\s+/)) {
    let s = 0;
    if (h.raw.includes(word)) s = 3;
    else if (/^[a-z]+$/.test(word)) {
      const sk = skeleton(word);
      if (sk.length >= 2) {
        if (h.skels.some((x) => x.startsWith(sk))) s = 2;
        else if (h.skels.some((x) => x.includes(sk))) s = 1;
      }
    }
    if (!s) return 0;
    total += s;
  }
  return total;
}

export const matchesProduct = (product, query) => matchScore(product, query) > 0;
