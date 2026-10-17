import { JARGON_DICTIONARY } from "./src/constants/jargon.dictionary";

export function preprocessText(text) {
  // Cocokkan istilah terpanjang terlebih dahulu.
  const terms = Object.keys(JARGON_DICTIONARY).sort(
    (a, b) => b.length - a.length,
  );

  if (terms.length === 0) return text;

  const escapedTerms = terms.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  // Case-insensitive, tetapi hanya mengganti istilah utuh.
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${escapedTerms.join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );

  return text.replace(pattern, (match) => {
    const key = terms.find(
      (term) => term.toLowerCase() === match.toLowerCase(),
    );

    return key ? JARGON_DICTIONARY[key] : match;
  });
}
