import { fetchEdgeVoiceCatalog } from "./edgeTts.js";

export const DEFAULT_VOICE_ID = "es-ES-ElviraNeural";

/** IDs antiguos del menú reducido → ShortName Edge */
const LEGACY_PERSONA_VOICES = {
  elvira: "es-ES-ElviraNeural",
  alvaro: "es-ES-AlvaroNeural",
  dalia: "es-MX-DaliaNeural",
  jorge: "es-MX-JorgeNeural",
  jenny: "en-US-JennyNeural",
  guy: "en-US-GuyNeural",
  sonia: "en-GB-SoniaNeural",
  francisca: "pt-BR-FranciscaNeural",
  antonio: "pt-BR-AntonioNeural",
  denise: "fr-FR-DeniseNeural",
  henri: "fr-FR-HenriNeural",
};

/** @type {import("./edgeVoices.js").EdgeVoice[]} */
let voices = [];

/** @type {Map<string, import("./edgeVoices.js").EdgeVoice>} */
let voicesByShortName = new Map();

let loadPromise = null;

/**
 * @typedef {object} EdgeVoice
 * @property {string} Name
 * @property {string} ShortName
 * @property {string} Gender
 * @property {string} Locale
 * @property {string} FriendlyName
 * @property {string} [Status]
 */

function formatChoiceName(voice) {
  const label =
    voice.FriendlyName?.trim() ||
    `${voice.ShortName} (${voice.Locale})`;
  const suffix = voice.Gender ? ` · ${voice.Gender}` : "";
  const full = `${label}${suffix}`;
  return full.length > 100 ? `${full.slice(0, 97)}...` : full;
}

/** Palabras de búsqueda → prefijos de Locale o ShortName */
const VOICE_QUERY_HINTS = [
  [["español", "espanol", "spain", "españa", "espana", "castellano"], ["es-"]],
  [["mexico", "mexicano", "méxico"], ["es-mx"]],
  [["inglés", "ingles", "english", "usa", "estados unidos"], ["en-"]],
  [["britanico", "británico", "uk", "reino unido"], ["en-gb"]],
  [["portugués", "portugues", "brasil", "brazil"], ["pt-"]],
  [["francés", "frances", "francia"], ["fr-"]],
  [["alemán", "aleman", "germany", "alemania"], ["de-"]],
  [["italiano", "italia", "italy"], ["it-"]],
  [["japonés", "japones", "japón", "japon", "japanese", "japan"], ["ja-"]],
  [["chino", "china", "mandarin"], ["zh-"]],
  [["coreano", "korea", "korean"], ["ko-"]],
  [["ruso", "russia", "russian"], ["ru-"]],
  [["árabe", "arabe", "arabic"], ["ar-"]],
  [["hindi", "india"], ["hi-"]],
];

function localeHintsForQuery(query) {
  const hints = new Set();
  for (const [words, prefixes] of VOICE_QUERY_HINTS) {
    if (words.some((w) => query.includes(w) || w.includes(query))) {
      for (const p of prefixes) hints.add(p);
    }
  }
  return [...hints];
}

function voiceMatchesQuery(voice, query) {
  const locale = (voice.Locale ?? "").toLowerCase();
  const shortName = (voice.ShortName ?? "").toLowerCase();
  const hints = localeHintsForQuery(query);

  if (hints.length > 0) {
    return hints.some((h) => locale.startsWith(h) || shortName.startsWith(h));
  }

  const haystack = [
    voice.ShortName,
    voice.Locale,
    voice.FriendlyName,
    voice.Gender,
    voice.Name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function compareVoicesForBrowse(a, b) {
  const aEs = a.Locale?.startsWith("es") ? 0 : 1;
  const bEs = b.Locale?.startsWith("es") ? 0 : 1;
  if (aEs !== bEs) return aEs - bEs;
  const localeCmp = (a.Locale ?? "").localeCompare(b.Locale ?? "");
  if (localeCmp !== 0) return localeCmp;
  return (a.ShortName ?? "").localeCompare(b.ShortName ?? "");
}

export function getEdgeVoiceCount() {
  return voices.length;
}

export function getEdgeVoice(shortName) {
  return voicesByShortName.get(shortName);
}

export function resolveStoredVoiceId(doc) {
  if (!doc) return DEFAULT_VOICE_ID;

  if (typeof doc.voiceId === "string" && doc.voiceId.trim()) {
    return doc.voiceId.trim();
  }

  if (typeof doc.personaId === "string") {
    const legacy = LEGACY_PERSONA_VOICES[doc.personaId];
    if (legacy) return legacy;
    if (doc.personaId.includes("Neural")) return doc.personaId;
  }

  return DEFAULT_VOICE_ID;
}

export function isValidEdgeVoiceId(shortName) {
  if (!shortName || typeof shortName !== "string") return false;
  if (voicesByShortName.has(shortName)) return true;
  return /^[a-z]{2,3}-[A-Za-z]+-.+Neural$/i.test(shortName);
}

export async function preloadEdgeVoices() {
  if (voices.length > 0) return voices.length;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const catalog = await fetchEdgeVoiceCatalog();
    voices = catalog
      .filter((v) => typeof v?.ShortName === "string" && v.ShortName.length > 0)
      .sort(compareVoicesForBrowse);

    voicesByShortName = new Map(voices.map((v) => [v.ShortName, v]));
    return voices.length;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export async function ensureEdgeVoicesLoaded() {
  if (voices.length > 0) return voices.length;
  return preloadEdgeVoices();
}

/** @returns {{ name: string, value: string }[]} */
export function searchEdgeVoiceChoices(query, limit = 25) {
  const q = query.trim().toLowerCase();

  let matches = voices;
  if (q) {
    matches = voices.filter((v) => voiceMatchesQuery(v, q));
    matches.sort((a, b) => {
      const aExact = a.ShortName.toLowerCase() === q ? 0 : 1;
      const bExact = b.ShortName.toLowerCase() === q ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aStarts = a.ShortName.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.ShortName.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return compareVoicesForBrowse(a, b);
    });
  } else {
    matches = [...voices].sort(compareVoicesForBrowse);
  }

  return matches.slice(0, limit).map((voice) => ({
    name: formatChoiceName(voice),
    value: voice.ShortName.slice(0, 100),
  }));
}

export function displayNameForVoiceId(shortName) {
  const voice = voicesByShortName.get(shortName);
  if (voice) return formatChoiceName(voice);
  return shortName;
}
