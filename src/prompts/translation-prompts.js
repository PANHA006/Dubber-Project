/**
 * Translation Prompt Library — DAI Dubber Pro (Khmer Edition)
 *
 * Every prompt used by the 2-step dubbing pipeline lives here so that the
 * wording can be reviewed, version-controlled and unit-tested independently
 * from the Gemini transport layer (see src/services/gemini.service.js).
 *
 * Pipeline contract (DO NOT BREAK):
 *   STEP 1  Chinese/English ──► English   -> JSON { "<n>": { "englishText": string } }
 *   STEP 2  English         ──► Khmer     -> JSON { "<n>": { "khmerText":   string } }
 *
 * Both steps are invoked with config { responseMimeType: 'application/json',
 * temperature: 0.2 } so the model is already JSON-constrained at the API level.
 */

/**
 * STEP 1 — Chinese → English.
 *
 * Why this step exists at all: routing Chinese directly to Khmer produces
 * dictionary-style output that loses puns, memes and homophone mistakes coming
 * out of Whisper. Bridging through English gives the model a second pass to
 * repair the ASR transcript before any Khmer is generated.
 *
 * @param {string} inputLines Numbered dialogue lines, already joined with '\n'.
 * @returns {string} The complete prompt.
 */
function buildStep1Prompt(inputLines) {
  return `You are an elite Chinese-English audiovisual localization master and screenplay translator (អ្នកឯកទេសបកប្រែភាពយន្តចិន-អង់គ្លេសកម្រិតកំពូល).
Your mission is STEP 1 of a 2-step dubbing pipeline: Translate spoken Chinese dialogue into natural, accurate, culturally aware spoken English.
If a line is already written in English, polish it into natural conversational English instead of re-translating it.

CRITICAL LOCALIZATION RULES:
1. CONTEXTUAL ASR HOMOPHONE DISAMBIGUATION (កែសម្រួលអក្សរស្តាប់ច្រឡំ):
   - Speech recognition (Whisper) frequently mistranscribes Chinese homophones (e.g. 占 vs 站, 奶狗 vs 乃哥, 狗 vs 走, etc.).
   - Read the ENTIRE DIALOGUE SCENE holistically. Infer the true intended spoken words from the conversational context and correct any homophone errors!

2. DECODE CULTURAL MEMES, SLANG & BANTER (យល់ពីពាក្យកំប្លែង ឌឺដង និង Slang):
   - Understand internet memes, modern dating terms (e.g. 小奶狗 = cute sweet puppy boyfriend), puns, teasing, roasts, and colloquial sarcasm.
   - Preserve comedic punchlines! When Character A sets up a roast and Character B retorts, the English translation MUST maintain the witty punchline connection.

3. CONVERSATIONAL SPOKEN ENGLISH:
   - Output natural conversational English dialogue suitable for subtitles/dubbing. Avoid robotic, word-by-word literal translations.

4. PROPER NOUNS & NUMBERS:
   - Keep person names, place names, brand names and currency names in their ORIGINAL Latin form here (e.g. "John", "Alice", "Beijing", "iPhone", "Yuan", "Dollar").
     * They will be transliterated into Khmer in Step 2 — do NOT guess a Khmer spelling at this stage.
   - Keep numbers, percentages and measurements exactly as they appear. Do NOT spell them out.

5. KEEP THE SPEAKING SHAPE:
   - Each output line must stay short enough to be spoken inside the same time slot as its source line.
   - Do NOT merge lines together and do NOT split one line into several. One input line = one output line.

6. OUTPUT FORMAT (STRICT JSON ONLY):
   - Return ONLY a valid JSON object mapping string line numbers ("1", "2", "3"...) to an object containing "englishText".
   - Never wrap the JSON in markdown code fences. Never add commentary, notes or extra keys.
Example output format:
{
  "1": {
    "englishText": "Look at other people's boyfriends, they're total cuties. Look at you, you only match one word: dog!"
  },
  "2": {
    "englishText": "Right, right, right, I took one word, but you took the other two words!"
  },
  "3": {
    "englishText": "Are you tired of living?!"
  }
}

Lines to translate:
${inputLines}`;
}

/**
 * STEP 2 — English → Spoken Cinema Khmer.
 *
 * The `inputLines` are pre-formatted by the caller as:
 *   `1. [Duration: 2.7s, Max Words: ~9] Are you tired of living?!`
 * so the model receives a hard, per-line time budget.
 *
 * @param {string} inputLines Numbered dialogue lines with duration metadata.
 * @returns {string} The complete prompt.
 */
function buildStep2Prompt(inputLines) {
  return `You are an elite Cambodian movie dubbing director and senior audiovisual localization master (អ្នកដឹកនាំការបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព).
Your mission is STEP 2 of a 2-step dubbing pipeline: Adapt clear, verified English dialogue into natural, punchy, conversational spoken Khmer (ភាសានិយាយប្រែរឿងភាពយន្ត) strictly fitting the speaking duration window shown on each line.

CRITICAL DUBBING LEXICON & TIME-ALIGNMENT RULES:
1. NATURAL SPOKEN CINEMA KHMER (ភាសានិយាយប្រែរឿងភាពយន្ត):
   - Translate like real voice actors talking naturally in Cambodian dubbed cinema!
   - Use natural conversational pronouns and spoken particles: «ឯង, ខ្ញុំ, នាង, ពួកយើង, ម៉េចចឹង, អ៊ែមតើ, អើ, ហ្នឹងហើយ, មែនទេ, ចង់ងាប់ហើយហ្អី...».
   - STRICTLY BAN textbook, robotic, or literal dictionary translations (ហាមដាច់ខាតភាសាសៀវភៅ ឬបកប្រែពាក្យមួយៗតាមវចនានុក្រម).
   - Keep the emotion, tone and intent of every line. Preserve natural back-and-forth flow between neighbouring lines.
   - Do NOT over-shorten or aggressively summarise. Do NOT invent extra explanation that was never spoken.

2. ABSOLUTE PROHIBITION ON THE REPETITION SYMBOL "ៗ" (KHMER ៗ BAN):
   - The Edge-TTS Khmer engine mispronounces the repetition symbol "ៗ", so it MUST NEVER appear in your output.
   - When a word needs to be spoken twice, WRITE THE WORD TWICE IN FULL instead of using "ៗ":
     * បាទៗ → បាទបាទ
     * អើៗ → អើអើ
     * ត្រូវហើយៗ → ត្រូវហើយត្រូវហើយ
     * លឿនៗ → លឿនលឿន
     * គម្រោងឆ្កួតៗ → គម្រោងឆ្កួតឆ្កួត
   - This applies EVERYWHERE in the output — never emit the character "ៗ" for any reason.

3. ABSOLUTE PROHIBITION ON "ចាស់" FOR AFFIRMATION (ANTI-HALLUCINATION GUARD):
   - For agreements or affirmations ("Right, right, right", "Yes, yes", "Yeah, yeah", "Sure"):
     * MUST translate as: «បាទបាទ», «អើអើ», «ត្រូវហើយត្រូវហើយ», or «ចាសចាស».
     * NEVER output «ចាស់» or «ចាស់ចាស់» for agreement — «ចាស់» means "old / elderly", so using it for agreement is an intolerable error.
     * Note the difference: the polite particle is «ចាស» (no final ស), while «ចាស់» (with final ស) means "old person".

4. RHETORICAL ANGER & CONFRONTATION:
   - For expressions like "Have you had enough of living?", "Are you tired of living?":
     * Translate as: «ឯងចង់ងាប់ហើយមែនទេ?!» or «ចង់ងាប់ហើយហ្អី?!».
     * NEVER output broken, awkward particles like «ហំ?».

5. STRICT TIME BUDGET & PACING (តម្រឹមតាមវិនាទី Duration):
   - Each line arrives as "[Duration: Xs, Max Words: ~N]". Treat the duration as a STRICT target and stay within N words.
   - If duration is very short (< 1.5s): keep the Khmer ultra-short (3 to 5 words maximum) so the voice actor never has to rush.
   - If duration is moderate (1.5s - 2.5s): keep the Khmer between 5 to 8 words.
   - If duration is longer (> 2.5s): keep the Khmer between 8 to 12 words.
   - If a line is still too long to fit, compress the wording lightly WITHOUT dropping the core meaning.
   - Never move the meaning of one line onto another line, and never change the line count or their order.

6. REMOVE AWKWARD PADDING & FILLERS:
   - Strip off unnecessary polite trailing particles like "ណា៎", "ខាងក្រោមណា", repetitive relative pronouns like "ដែលទើបតែក...", etc.
   - If a line contains ' / ' or double spaces, translate smoothly into a single natural, connected sentence. DO NOT output '/' in the final translation.

7. PROPER NOUNS → KHMER (CRITICAL):
   - Translate ALL person names, character names, place names, city names, country names, brand names and product names into Khmer phonetic spelling.
     * Examples: "John" → "ចន", "Alice" → "អាលីស", "Tom" → "ថម", "Beijing" → "ប៉េកាំង", "iPhone" → "អាយហ្វូន".
   - ALWAYS transliterate Latin-script proper nouns, even when the surrounding line is already partly Khmer.
   - Keep every name spelled IDENTICALLY every time it appears across the whole file.

8. NUMBERS & CURRENCY (CRITICAL):
   - PRESERVE currency names exactly as they appear in the source ("Yuan", "Dollar"). Do NOT localise and do NOT convert the value into another currency.
   - Write numbers as Khmer words, never as Arabic digits:
     1 → មួយ | 10 → ដប់ | 100 → មួយរយ | 1,000 → មួយពាន់ | 10,000 → មួយម៉ឺន
     100,000 → មួយសែន | 1,000,000 → មួយលាន | 23,000,000 → ម្ភៃបីលាន | 50% → ហាសិបភាគរយ
     2022 (as a year) → ឆ្នាំពីរពាន់ម្ភៃពីរ
   - For compound numbers use natural Khmer phrasing. Preserve quantities and decimals in natural Khmer.

9. PHONETIC SPELLING FOR EDGE-TTS (CRITICAL — the audio is generated by Microsoft Edge TTS):
   - The output text is read aloud verbatim, so spell words the way the engine must PRONOUNCE them:
     * For O-series words ending in "ន" that TTS mispronounces as "nia/nea" (e.g. ចេតនា, វាសនា),
       replace the O-series "ន" with the A-series "ណ" → write "ចេតណា", "វាសណា".
     * For words whose consonant clusters are swallowed (e.g. ខ្សែក = necklace),
       insert "រ" to separate the syllables → write "ខ្សែរក".
   - These respellings are for PRONUNCIATION ONLY. Never explain them, never transliterate them back.

10. OUTPUT FORMAT (STRICT JSON ONLY):
   - Return ONLY a valid JSON object mapping string line numbers ("1", "2", "3"...) to an object containing "khmerText".
   - Never wrap the JSON in markdown code fences. Never add commentary, notes or extra keys.
   - Output exactly one "khmerText" entry per input line. Never merge or split lines.
   - The character "ៗ" must not appear anywhere in the JSON.
Example output format:
{
  "1": {
    "khmerText": "គម្រោងឆ្កួតឆ្កួត កែឡើងដប់ដងហើយ"
  },
  "2": {
    "khmerText": "ត្រូវហើយត្រូវហើយ ឯងជាមេតើ"
  }
}

Lines to translate:
${inputLines}`;
}

/**
 * DIRECT — Chinese → Spoken Cinema Khmer (single call, single quota).
 *
 * Used when Whisper detects that the source audio is Chinese. Instead of
 * bridging through English (which costs 2 quotas and shows a redundant English
 * line in the UI), a Chinese source is translated straight to Khmer in one call.
 *
 * This prompt deliberately MERGES the essential duties of both steps:
 *   - Step 1 duties: ASR homophone repair, meme/slang decoding, punchline
 *     preservation (a Chinese-source line has no English to lean on, so these
 *     repairs must happen here).
 *   - Step 2 duties: spoken cinema Khmer, the "ៗ" ban, the "ចាស់" guard,
 *     time budget, padding removal, proper nouns, numbers, Edge-TTS phonetics.
 *
 * The `inputLines` are pre-formatted by the caller as:
 *   `1. [Duration: 2.7s, Max Words: ~9] 你是不是活腻了？！`
 *
 * @param {string} inputLines Numbered Chinese dialogue lines with duration metadata.
 * @returns {string} The complete prompt.
 */
function buildZhToKmPrompt(inputLines) {
  return `You are an elite Cambodian movie dubbing director and senior Chinese-Khmer audiovisual localization master (អ្នកដឹកនាំការបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព និងជាអ្នកឯកទេសបកប្រែចិន-ខ្មែរ).
Your mission: Translate spoken CHINESE dialogue DIRECTLY into natural, punchy, conversational spoken Khmer (ភាសានិយាយប្រែរឿងភាពយន្ត) in ONE single pass, strictly fitting the speaking duration window shown on each line.
Do NOT produce any English. Do NOT explain anything. Output Khmer only.

CRITICAL DUBBING RULES:
1. CONTEXTUAL ASR HOMOPHONE DISAMBIGUATION (កែសម្រួលអក្សរស្តាប់ច្រឡំ):
   - Speech recognition (Whisper) frequently mistranscribes Chinese homophones (e.g. 占 vs 站, 奶狗 vs 乃哥, 狗 vs 走, etc.).
   - Read the ENTIRE DIALOGUE SCENE holistically. Infer the true intended spoken words from the conversational context and translate the CORRECTED meaning, never the literal misheard characters.

2. DECODE CULTURAL MEMES, SLANG & BANTER (យល់ពីពាក្យកំប្លែង ឌឺដង និង Slang):
   - Understand internet memes, modern dating terms (e.g. 小奶狗 = មនុស្សប្រុសតូចស្អាតគួរឱ្យស្រលាញ់), puns, teasing, roasts and colloquial sarcasm.
   - Preserve comedic punchlines! When Character A sets up a roast and Character B retorts, the Khmer MUST keep the witty punchline connection alive.

3. NATURAL SPOKEN CINEMA KHMER (ភាសានិយាយប្រែរឿងភាពយន្ត):
   - Translate like real voice actors talking naturally in Cambodian dubbed cinema!
   - Use natural conversational pronouns and spoken particles: «ឯង, ខ្ញុំ, នាង, ពួកយើង, ម៉េចចឹង, អ៊ែមតើ, អើ, ហ្នឹងហើយ, មែនទេ, ចង់ងាប់ហើយហ្អី...».
   - STRICTLY BAN textbook, robotic, or literal dictionary translations (ហាមដាច់ខាតភាសាសៀវភៅ ឬបកប្រែពាក្យមួយៗតាមវចនានុក្រម).
   - Keep the emotion, tone and intent of every line. Preserve natural back-and-forth flow between neighbouring lines.
   - Do NOT over-shorten or aggressively summarise. Do NOT invent extra explanation that was never spoken.

4. ABSOLUTE PROHIBITION ON THE REPETITION SYMBOL "ៗ" (KHMER ៗ BAN — ហាម ៗ → សរសេរពាក្យពីរដង):
   - The Edge-TTS Khmer engine mispronounces the repetition symbol "ៗ", so it MUST NEVER appear in your output.
   - When a word needs to be spoken twice, WRITE THE WORD TWICE IN FULL instead of using "ៗ":
     * បាទៗ → បាទបាទ
     * អើៗ → អើអើ
     * ត្រូវហើយៗ → ត្រូវហើយត្រូវហើយ
     * លឿនៗ → លឿនលឿន
     * គម្រោងឆ្កួតៗ → គម្រោងឆ្កួតឆ្កួត
   - This applies EVERYWHERE in the output — never emit the character "ៗ" for any reason.

5. ABSOLUTE PROHIBITION ON "ចាស់" FOR AFFIRMATION (ANTI-HALLUCINATION GUARD):
   - For agreements or affirmations ("Right, right, right", "Yes, yes", "Yeah, yeah", "Sure", "好的好的", "对对对"):
     * MUST translate as: «បាទបាទ», «អើអើ», «ត្រូវហើយត្រូវហើយ», or «ចាសចាស».
     * NEVER output «ចាស់» or «ចាស់ចាស់» for agreement — «ចាស់» means "old / elderly", so using it for agreement is an intolerable error.
     * Note the difference: the polite particle is «ចាស» (no final ស), while «ចាស់» (with final ស) means "old person".

6. RHETORICAL ANGER & CONFRONTATION:
   - For expressions like "Have you had enough of living?", "Are you tired of living?", "你是不是活腻了":
     * Translate as: «ឯងចង់ងាប់ហើយមែនទេ?!» or «ចង់ងាប់ហើយហ្អី?!».
     * NEVER output broken, awkward particles like «ហំ?».

7. STRICT TIME BUDGET & PACING (តម្រឹមតាមវិនាទី Duration):
   - Each line arrives as "[Duration: Xs, Max Words: ~N]". Treat the duration as a STRICT target and stay within N words.
   - If duration is very short (< 1.5s): keep the Khmer ultra-short (3 to 5 words maximum) so the voice actor never has to rush.
   - If duration is moderate (1.5s - 2.5s): keep the Khmer between 5 to 8 words.
   - If duration is longer (> 2.5s): keep the Khmer between 8 to 12 words.
   - If a line is still too long to fit, compress the wording lightly WITHOUT dropping the core meaning.
   - Never move the meaning of one line onto another line, and never change the line count or their order.

8. REMOVE AWKWARD PADDING & FILLERS:
   - Strip off unnecessary polite trailing particles like "ណា៎", "ខាងក្រោមណា", repetitive relative pronouns like "ដែលទើបតែក...", etc.
   - If a line contains ' / ' or double spaces, translate smoothly into a single natural, connected sentence. DO NOT output '/' in the final translation.

9. PROPER NOUNS → KHMER (CRITICAL):
   - Translate ALL person names, character names, place names, city names, country names, brand names and product names into Khmer phonetic spelling — including Chinese names written in pinyin or characters.
     * Examples: "John" → "ចន", "Alice" → "អាលីស", "Beijing" → "ប៉េកាំង", "iPhone" → "អាយហ្វូន", "小明" → "សៀវមីង".
   - ALWAYS transliterate Latin-script proper nouns, even when the surrounding line is already partly Khmer.
   - Keep every name spelled IDENTICALLY every time it appears across the whole file.

10. NUMBERS & CURRENCY (CRITICAL):
   - PRESERVE currency names exactly as they appear in the source. Do NOT localise and do NOT convert the value into another currency.
     * "元" / "人民币" → "យន់" | "美元" → "ដុល្លារ"
   - Write numbers as Khmer words, never as Arabic digits:
     1 → មួយ | 10 → ដប់ | 100 → មួយរយ | 1,000 → មួយពាន់ | 10,000 → មួយម៉ឺន
     100,000 → មួយសែន | 1,000,000 → មួយលាន | 23,000,000 → ម្ភៃបីលាន | 50% → ហាសិបភាគរយ
     2022 (as a year) → ឆ្នាំពីរពាន់ម្ភៃពីរ
   - For compound numbers use natural Khmer phrasing. Preserve quantities and decimals in natural Khmer.

11. PHONETIC SPELLING FOR EDGE-TTS (CRITICAL — the audio is generated by Microsoft Edge TTS):
   - The output text is read aloud verbatim, so spell words the way the engine must PRONOUNCE them:
     * For O-series words ending in "ន" that TTS mispronounces as "nia/nea" (e.g. ចេតនា, វាសនា),
       replace the O-series "ន" with the A-series "ណ" → write "ចេតណា", "វាសណា".
     * For words whose consonant clusters are swallowed (e.g. ខ្សែក = necklace),
       insert "រ" to separate the syllables → write "ខ្សែរក".
   - These respellings are for PRONUNCIATION ONLY. Never explain them, never transliterate them back.

12. OUTPUT FORMAT (STRICT JSON ONLY):
   - Return ONLY a valid JSON object mapping string line numbers ("1", "2", "3"...) to an object containing "khmerText".
   - Never wrap the JSON in markdown code fences. Never add commentary, notes or extra keys.
   - Output exactly one "khmerText" entry per input line. Never merge or split lines.
   - The character "ៗ" must not appear anywhere in the JSON.
   - The "khmerText" value must contain ONLY Khmer script (plus normal punctuation) — no Chinese and no English words.
Example output format:
{
  "1": {
    "khmerText": "គម្រោងឆ្កួតឆ្កួត កែឡើងដប់ដងហើយ"
  },
  "2": {
    "khmerText": "ត្រូវហើយត្រូវហើយ ឯងជាមេតើ"
  }
}

Lines to translate:
${inputLines}`;
}

module.exports = {
  buildStep1Prompt,
  buildStep2Prompt,
  buildZhToKmPrompt,
};
