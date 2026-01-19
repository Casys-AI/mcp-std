/**
 * Text analysis tools
 *
 * Pure Deno implementations - no external dependencies.
 * Readability scores, text statistics, word analysis.
 *
 * @module lib/std/textanalysis
 */

import type { MiniTool } from "./types.ts";

// Helper: Count syllables in a word (English approximation)
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 2) return 1;

  // Exceptions
  const exceptions: Record<string, number> = {
    simile: 3, facsimile: 4, sesame: 3,
  };
  if (exceptions[w]) return exceptions[w];

  let count = 0;
  const vowels = "aeiouy";
  let prevWasVowel = false;

  for (let i = 0; i < w.length; i++) {
    const isVowel = vowels.includes(w[i]);
    if (isVowel && !prevWasVowel) {
      count++;
    }
    prevWasVowel = isVowel;
  }

  // Adjust for silent 'e'
  if (w.endsWith("e") && !w.endsWith("le") && count > 1) {
    count--;
  }

  // Adjust for -ed endings
  if (w.endsWith("ed") && !w.endsWith("ted") && !w.endsWith("ded") && count > 1) {
    count--;
  }

  return Math.max(1, count);
}

// Helper: Split text into sentences
function getSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Helper: Get words from text
function getWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

export const textanalysisTools: MiniTool[] = [
  {
    name: "text_readability",
    description:
      "Calculate readability scores for text. Returns Flesch-Kincaid Grade, Flesch Reading Ease, Gunning Fog, SMOG, Coleman-Liau, and ARI. Use to assess content difficulty. Keywords: readability score, Flesch-Kincaid, reading level, text difficulty, grade level.",
    category: "textanalysis",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
      },
      required: ["text"],
    },
    handler: ({ text }) => {
      const txt = text as string;
      const sentences = getSentences(txt);
      const words = getWords(txt);
      const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
      const characters = words.join("").length;

      const sentenceCount = sentences.length || 1;
      const wordCount = words.length || 1;

      // Words per sentence
      const wordsPerSentence = wordCount / sentenceCount;
      // Syllables per word
      const syllablesPerWord = syllables / wordCount;
      // Characters per word
      const charsPerWord = characters / wordCount;

      // Count complex words (3+ syllables)
      const complexWords = words.filter((w) => countSyllables(w) >= 3).length;
      const percentComplexWords = (complexWords / wordCount) * 100;

      // Flesch Reading Ease (0-100, higher = easier)
      const fleschReadingEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;

      // Flesch-Kincaid Grade Level
      const fleschKincaidGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;

      // Gunning Fog Index
      const gunningFog = 0.4 * (wordsPerSentence + percentComplexWords);

      // SMOG Index (requires at least 30 sentences for accuracy)
      const smog = 1.0430 * Math.sqrt(complexWords * (30 / sentenceCount)) + 3.1291;

      // Coleman-Liau Index
      const L = (characters / wordCount) * 100;
      const S = (sentenceCount / wordCount) * 100;
      const colemanLiau = 0.0588 * L - 0.296 * S - 15.8;

      // Automated Readability Index
      const ari = 4.71 * charsPerWord + 0.5 * wordsPerSentence - 21.43;

      // Interpret Flesch Reading Ease
      let interpretation: string;
      if (fleschReadingEase >= 90) interpretation = "Very Easy (5th grade)";
      else if (fleschReadingEase >= 80) interpretation = "Easy (6th grade)";
      else if (fleschReadingEase >= 70) interpretation = "Fairly Easy (7th grade)";
      else if (fleschReadingEase >= 60) interpretation = "Standard (8th-9th grade)";
      else if (fleschReadingEase >= 50) interpretation = "Fairly Difficult (10th-12th grade)";
      else if (fleschReadingEase >= 30) interpretation = "Difficult (College)";
      else interpretation = "Very Difficult (College graduate)";

      return {
        scores: {
          fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
          fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
          gunningFog: Math.round(gunningFog * 10) / 10,
          smog: Math.round(smog * 10) / 10,
          colemanLiau: Math.round(colemanLiau * 10) / 10,
          ari: Math.round(ari * 10) / 10,
        },
        interpretation,
        stats: {
          sentences: sentenceCount,
          words: wordCount,
          syllables,
          characters,
          complexWords,
          avgWordsPerSentence: Math.round(wordsPerSentence * 10) / 10,
          avgSyllablesPerWord: Math.round(syllablesPerWord * 100) / 100,
        },
      };
    },
  },
  {
    name: "text_statistics",
    description:
      "Get detailed statistics about text. Character counts, word counts, sentence counts, paragraph counts, reading time, and more. Keywords: text stats, word count, character count, reading time, text analysis.",
    category: "textanalysis",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
        wordsPerMinute: { type: "number", description: "Reading speed (default: 200)" },
      },
      required: ["text"],
    },
    handler: ({ text, wordsPerMinute = 200 }) => {
      const txt = text as string;
      const words = getWords(txt);
      const sentences = getSentences(txt);
      const paragraphs = txt.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      const lines = txt.split("\n");

      // Character counts
      const chars = txt.length;
      const charsNoSpaces = txt.replace(/\s/g, "").length;
      const letters = txt.replace(/[^a-zA-Z]/g, "").length;
      const digits = txt.replace(/[^0-9]/g, "").length;
      const spaces = txt.replace(/[^\s]/g, "").length;

      // Word analysis
      const wordLengths = words.map((w) => w.length);
      const avgWordLength = wordLengths.length > 0
        ? wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length
        : 0;
      const longestWord = words.reduce((a, b) => (a.length > b.length ? a : b), "");
      const shortestWord = words.reduce((a, b) => (a.length < b.length ? a : b), words[0] || "");

      // Reading and speaking time
      const wpm = wordsPerMinute as number;
      const readingTimeSeconds = (words.length / wpm) * 60;
      const speakingTimeSeconds = (words.length / 150) * 60; // ~150 wpm speaking

      return {
        characters: {
          total: chars,
          withoutSpaces: charsNoSpaces,
          letters,
          digits,
          spaces,
        },
        words: {
          total: words.length,
          unique: new Set(words).size,
          avgLength: Math.round(avgWordLength * 10) / 10,
          longest: longestWord,
          shortest: shortestWord,
        },
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        lines: lines.length,
        readingTime: {
          seconds: Math.round(readingTimeSeconds),
          minutes: Math.round(readingTimeSeconds / 60 * 10) / 10,
          formatted: formatDuration(readingTimeSeconds),
        },
        speakingTime: {
          seconds: Math.round(speakingTimeSeconds),
          minutes: Math.round(speakingTimeSeconds / 60 * 10) / 10,
          formatted: formatDuration(speakingTimeSeconds),
        },
      };
    },
  },
  {
    name: "text_word_frequency",
    description:
      "Analyze word frequency in text. Get most common words, word cloud data, and n-gram analysis. Use for content analysis or keyword extraction. Keywords: word frequency, common words, word count, term frequency, text mining.",
    category: "textanalysis",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
        limit: { type: "number", description: "Max words to return (default: 20)" },
        minLength: { type: "number", description: "Minimum word length (default: 1)" },
        excludeStopwords: { type: "boolean", description: "Exclude common words (default: true)" },
        ngram: { type: "number", description: "N-gram size (1=words, 2=bigrams, 3=trigrams)" },
      },
      required: ["text"],
    },
    handler: ({ text, limit = 20, minLength = 1, excludeStopwords = true, ngram = 1 }) => {
      const words = getWords(text as string);

      // Common English stopwords
      const stopwords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
        "be", "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "must", "shall", "can", "need",
        "it", "its", "this", "that", "these", "those", "i", "you", "he", "she",
        "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
        "her", "our", "their", "what", "which", "who", "whom", "when", "where",
        "why", "how", "all", "each", "every", "both", "few", "more", "most",
        "other", "some", "such", "no", "not", "only", "same", "so", "than",
        "too", "very", "just", "also", "now", "here", "there", "then",
      ]);

      // Filter words
      let filtered = words.filter((w) => w.length >= (minLength as number));
      if (excludeStopwords) {
        filtered = filtered.filter((w) => !stopwords.has(w));
      }

      // Generate n-grams if requested
      const items: string[] = [];
      const n = ngram as number;
      if (n > 1) {
        for (let i = 0; i <= filtered.length - n; i++) {
          items.push(filtered.slice(i, i + n).join(" "));
        }
      } else {
        items.push(...filtered);
      }

      // Count frequencies
      const freq = new Map<string, number>();
      for (const item of items) {
        freq.set(item, (freq.get(item) || 0) + 1);
      }

      // Sort by frequency
      const sorted = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit as number);

      const total = items.length;

      return {
        items: sorted.map(([word, count]) => ({
          word,
          count,
          percentage: Math.round((count / total) * 10000) / 100,
        })),
        totalWords: words.length,
        uniqueWords: new Set(words).size,
        analyzed: items.length,
        ngram: n,
      };
    },
  },
  {
    name: "text_sentiment_simple",
    description:
      "Simple sentiment analysis using word lists. Returns positive/negative score and overall sentiment. Basic analysis without ML. Keywords: sentiment analysis, positive negative, text sentiment, opinion mining, emotion detect.",
    category: "textanalysis",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
      },
      required: ["text"],
    },
    handler: ({ text }) => {
      const words = getWords(text as string);

      // Simple positive/negative word lists
      const positiveWords = new Set([
        "good", "great", "excellent", "amazing", "wonderful", "fantastic",
        "beautiful", "love", "happy", "joy", "best", "better", "perfect",
        "awesome", "brilliant", "outstanding", "superb", "pleasant", "nice",
        "positive", "success", "win", "winner", "winning", "delightful",
        "enjoy", "enjoyed", "enjoying", "thank", "thanks", "grateful",
        "appreciate", "impressive", "incredible", "remarkable", "exceptional",
      ]);

      const negativeWords = new Set([
        "bad", "terrible", "horrible", "awful", "poor", "worst", "worse",
        "hate", "sad", "angry", "fail", "failed", "failure", "ugly",
        "negative", "wrong", "mistake", "error", "problem", "issue",
        "difficult", "hard", "pain", "painful", "disappointing", "disappointed",
        "frustrating", "frustrated", "annoying", "annoyed", "boring", "bored",
        "useless", "waste", "wasted", "stupid", "dumb", "broken",
      ]);

      const intensifiers = new Set([
        "very", "really", "extremely", "absolutely", "totally", "completely",
        "highly", "incredibly", "remarkably", "exceptionally",
      ]);

      const negators = new Set([
        "not", "no", "never", "neither", "nobody", "nothing", "nowhere",
        "hardly", "barely", "scarcely", "dont", "doesn", "didn", "won",
        "wouldn", "couldn", "shouldn", "isn", "aren", "wasn", "weren",
      ]);

      let positiveScore = 0;
      let negativeScore = 0;
      const positiveMatches: string[] = [];
      const negativeMatches: string[] = [];
      let negatorActive = false;
      let intensifierActive = false;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];

        if (negators.has(word)) {
          negatorActive = true;
          continue;
        }

        if (intensifiers.has(word)) {
          intensifierActive = true;
          continue;
        }

        const multiplier = intensifierActive ? 1.5 : 1;

        if (positiveWords.has(word)) {
          if (negatorActive) {
            negativeScore += multiplier;
            negativeMatches.push(`not ${word}`);
          } else {
            positiveScore += multiplier;
            positiveMatches.push(word);
          }
        } else if (negativeWords.has(word)) {
          if (negatorActive) {
            positiveScore += multiplier;
            positiveMatches.push(`not ${word}`);
          } else {
            negativeScore += multiplier;
            negativeMatches.push(word);
          }
        }

        negatorActive = false;
        intensifierActive = false;
      }

      const total = positiveScore + negativeScore || 1;
      const normalizedScore = (positiveScore - negativeScore) / total;

      let sentiment: string;
      if (normalizedScore > 0.3) sentiment = "Positive";
      else if (normalizedScore < -0.3) sentiment = "Negative";
      else sentiment = "Neutral";

      return {
        sentiment,
        score: Math.round(normalizedScore * 100) / 100,
        positive: {
          score: Math.round(positiveScore * 10) / 10,
          words: positiveMatches.slice(0, 10),
        },
        negative: {
          score: Math.round(negativeScore * 10) / 10,
          words: negativeMatches.slice(0, 10),
        },
        wordCount: words.length,
        confidence: total > 5 ? "high" : total > 2 ? "medium" : "low",
      };
    },
  },
];

// Helper to format duration
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours} hr ${remainingMins} min`;
}
