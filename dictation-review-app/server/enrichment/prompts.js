export const systemPrompt = [
  "You enrich junior-middle-school dictation study material for a parent.",
  "Return only data supported by reliable sources found with web search.",
  "When uncertain, leave fields empty, add warnings, and include candidates instead of guessing.",
  "Keep Chinese explanations concise and suitable for junior-middle-school students.",
  "Do not copy long modern translations, annotations, or essays from one webpage.",
  "Every response must match the provided JSON schema exactly."
].join("\n");

export function buildEnglishPrompt({ word }) {
  return [
    `English word: ${word}`,
    "Find reliable dictionary or education sources.",
    "Return the normalized spelling, UK and US phonetics, common parts of speech, and at most 3 common Chinese meanings for junior-middle-school use.",
    "Avoid obscure meanings. If the spelling may refer to multiple candidates, list alternatives."
  ].join("\n");
}

export function buildChinesePrompt({ term }) {
  return [
    `Chinese term: ${term}`,
    "Find reliable dictionary or education sources.",
    "Return normalized term, pinyin, concise definition, common synonyms, common antonyms, pronunciation candidates, sources, confidence, warnings, and ambiguities.",
    "If no reliable antonym exists, return an empty antonyms array. Do not invent antonyms."
  ].join("\n");
}

export function buildPoemPrompt({ title, authorHint }) {
  return [
    `Poem title: ${title}`,
    `Author hint: ${authorHint || "(none)"}`,
    "Find reliable poetry, textbook, or education sources.",
    "Return the standard title, alternative title if any, author, dynasty, full original text, line split, concise annotations, and a concise junior-middle-school translation.",
    "Normalize punctuation and remove unrelated webpage text.",
    "If same-title works or source conflicts exist, return candidates or versionWarnings and do not force a single unsupported choice."
  ].join("\n");
}

export function buildCharacterPrompt({ character, originalText }) {
  return [
    `Target character: ${character}`,
    `Original text: ${originalText}`,
    "Find common words suitable for junior-middle-school reinforcement.",
    "Return pinyin for the character and up to 2 related words.",
    "Each related word must contain the target character, must be common, must not exactly equal the original text, and must not be an obscure combination."
  ].join("\n");
}

