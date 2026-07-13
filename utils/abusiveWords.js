export const ABUSIVE_WORDS = [
  // Transliterated & Acronyms
  "aad", "aand", "bahenchod", "behenchod", "bhenchod", "bhenchodd", "b.c.", "bc",
  "bakchod", "bakchodd", "bakchodi", "bevda", "bewda", "bevdey", "bewday",
  "bevakoof", "bevkoof", "bevkuf", "bewakoof", "bewkoof", "bewkuf", "bhadua",
  "bhaduaa", "bhadva", "bhadvaa", "bhadwa", "bhadwaa", "bhosada", "bhosda",
  "bhosdaa", "bhosdike", "bhonsdike", "bsdk", "b.s.d.k", "bhosdiki", "bhosdiwala",
  "bhosdiwale", "bhosadchodal", "bhosadchod", "babbe", "babbey", "bube", "bubey",
  "bur", "burr", "buurr", "buur", "charsi", "chooche", "choochi", "chuchi",
  "chhod", "chod", "chodd", "chudne", "chudney", "chudwa", "chudwaa", "chudwane",
  "chudwaane", "choot", "chut", "chute", "chutia", "chutiya", "chutiye", "chuttad",
  "chutad", "dalaal", "dalal", "dalle", "dalley", "fattu", "gadha", "gadhe",
  "gadhalund", "gaand", "gand", "gandu", "gandfat", "gandfut", "gandiya", "gandiye",
  "goo", "gu", "gote", "gotey", "gotte", "hag", "haggu", "hagne", "hagney",
  "harami", "haramjada", "haraamjaada", "haramzyada", "haraamzyaada", "haraamjaade",
  "haraamzaade", "haraamkhor", "haramkhor", "jhat", "jhaat", "jhaatu", "jhatu",
  "kutta", "kutte", "kuttey", "kutia", "kutiya", "kuttiya", "kutti", "landi",
  "landy", "laude", "laudey", "laura", "lora", "lauda", "ling", "loda", "lode",
  "lund", "launda", "lounde", "laundey", "laundi", "loundi", "laundiya", "loundiya",
  "lulli", "maro", "marunga", "madarchod", "madarchodd", "madarchood",
  "madarchoot", "madarchut", "m.c.", "mc", "mamme", "mammey", "moot", "mut",
  "mootne", "mutne", "mooth", "muth", "nunni", "nunnu", "paaji", "paji", "pesaab",
  "pesab", "peshaab", "peshab", "pilla", "pillay", "pille", "pilley", "pisaab",
  "pisab", "pkmkb", "porkistan", "raand", "rand", "randi", "randy", "suar",
  "tatte", "tatti", "tatty", "ullu", "gaand ki tail", "lust", "suck", "lauda", "चुत्तड़",

  // Devanagari Hindi
  "आंड़", "आंड", "आँड", "बहनचोद", "बेहेनचोद", "भेनचोद", "बकचोद", "बकचोदी",
  "बेवड़ा", "बेवड़े", "बेवकूफ", "भड़ुआ", "भड़वा", "भोसड़ा", "भोसड़ीके", "भोसड़ीकी",
  "भोसड़ीवाला", "भोसड़ीवाले", "भोसरचोदल", "भोसदचोद", "भोसड़ाचोदल", "भोसड़ाचोद",
  "बब्बे", "बूबे", "बुर", "चरसी", "चूचे", "चूची", "चुची", "चोद", "चुदने", "चुदवा",
  "चुदवाने", "चूत", "चूतिया", "चुटिया", "चूतिये", "चुत्तड़", "चूत्तड़", "दलाल",
  "दलले", "फट्टू", "गधा", "गधे", "गधालंड", "गांड", "गांडू", "गंडफट", "गंडिया",
  "गंडिये", "गू", "गोटे", "हग", "हग्गू", "हगने", "हरामी", "हरामजादा", "हरामज़ादा",
  "हरामजादे", "हरामज़ादे", "हरामखोर", "झाट", "झाटू", "कुत्ता", "कुत्ते", "कुतिया",
  "कुत्ती", "लेंडी", "लोड़े", "लौड़े", "लौड़ा", "लोड़ा", "लौडा", "लिंग", "लोडा",
  "लोडे", "लंड", "लौंडा", "लौंडे", "लौंडी", "लौंडिया", "लुल्ली", "मारऊंगा",
  "मादरचोद", "मादरचूत", "मादरचुत", "मम्मे", "मूत", "मुत", "मूतने", "मुतने", "मूठ",
  "मुठ", "नुननी", "नुननु", "पाजी", "पेसाब", "पेशाब", "पिल्ला", "पिल्ले", "पिसाब",
  "पोरकिस्तान", "रांड", "रंडी", "सुअर", "सूअर", "टट्टे", "टट्टी", "उल्लू", "चुसो", "हवस",

  // English profanities
  "fuck", "fucking", "fucker", "shit", "bitch", "asshole", "bastard", "cunt",
  "dick", "pussy", "whore", "slut"
];

/**
 * Checks if a string contains any abusive or inappropriate words.
 * Returns { hasAbusive: boolean, foundWords: string[], warning: string }
 */
export function checkAbusiveContent(text) {
  if (!text || typeof text !== "string") {
    return { hasAbusive: false, foundWords: [], warning: "" };
  }

  const normalized = text.toLowerCase();
  const words = normalized.split(/[\s,.\/\\#!$%\^&\*;:{}=\-_`~()"'?<>\[\]]+/);

  const found = new Set();

  for (const pattern of ABUSIVE_WORDS) {
    const pLower = pattern.toLowerCase();

    // Multi-word phrase or abbreviation with dots (e.g. "gaand ki tail", "b.c.", "b.s.d.k")
    if (pLower.includes(" ") || pLower.includes(".")) {
      const cleanPattern = pLower.replace(/\./g, "");
      const cleanText = normalized.replace(/\./g, "");
      if (cleanText.includes(pLower) || cleanText.includes(cleanPattern)) {
        found.add(pattern);
      }
    } else {
      // Short words (3 letters or less) require exact token match to avoid false positives (e.g. "bc" in "because")
      if (pLower.length <= 3) {
        if (words.includes(pLower)) {
          found.add(pattern);
        }
      } else {
        // Substring match for distinctive longer abusive words
        if (normalized.includes(pLower)) {
          found.add(pattern);
        }
      }
    }
  }

  const foundWords = Array.from(found);
  const hasAbusive = foundWords.length > 0;

  return {
    hasAbusive,
    foundWords,
    warning: hasAbusive
      ? `⚠️ Warning: Your text contains abusive language. Please remove abusive words before proceeding.`
      : "",
  };
}
