/**
 * Unit tests for text analysis tools
 *
 * @module lib/std/tests/textanalysis_test
 */

import { assertEquals } from "@std/assert";
import { textanalysisTools } from "../src/tools/textanalysis.ts";

// Helper to get tool handler
const getHandler = (name: string) => {
  const tool = textanalysisTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler;
};

// Text readability tests
Deno.test("text_readability - calculates scores", () => {
  const handler = getHandler("text_readability");
  const result = handler({
    text: "The quick brown fox jumps over the lazy dog. This is a simple sentence.",
  }) as {
    scores: {
      fleschReadingEase: number;
      fleschKincaidGrade: number;
      gunningFog: number;
    };
  };

  assertEquals(typeof result.scores.fleschReadingEase, "number");
  assertEquals(typeof result.scores.fleschKincaidGrade, "number");
  assertEquals(typeof result.scores.gunningFog, "number");
});

Deno.test("text_readability - simple text is easy to read", () => {
  const handler = getHandler("text_readability");
  const result = handler({
    text: "I like cats. Cats are fun. They play a lot.",
  }) as { scores: { fleschReadingEase: number }; interpretation: string };

  // Simple sentences should have high readability
  assertEquals(result.scores.fleschReadingEase > 60, true);
});

Deno.test("text_readability - returns stats", () => {
  const handler = getHandler("text_readability");
  const result = handler({
    text: "Hello world. This is a test.",
  }) as { stats: { sentences: number; words: number } };

  assertEquals(result.stats.sentences, 2);
  assertEquals(result.stats.words > 0, true);
});

// Text statistics tests
Deno.test("text_statistics - counts characters", () => {
  const handler = getHandler("text_statistics");
  const result = handler({ text: "Hello World" }) as {
    characters: { total: number; withoutSpaces: number };
  };

  assertEquals(result.characters.total, 11);
  assertEquals(result.characters.withoutSpaces, 10);
});

Deno.test("text_statistics - counts words", () => {
  const handler = getHandler("text_statistics");
  const result = handler({ text: "one two three four five" }) as {
    words: { total: number; unique: number };
  };

  assertEquals(result.words.total, 5);
  assertEquals(result.words.unique, 5);
});

Deno.test("text_statistics - counts sentences", () => {
  const handler = getHandler("text_statistics");
  const result = handler({ text: "First sentence. Second sentence! Third?" }) as {
    sentences: { total: number };
  };

  assertEquals(result.sentences.total, 3);
});

Deno.test("text_statistics - calculates reading time", () => {
  const handler = getHandler("text_statistics");
  // 200 words = 1 minute at default 200 wpm
  const words = Array(200).fill("word").join(" ");
  const result = handler({ text: words }) as {
    readingTime: { minutes: number };
  };

  assertEquals(result.readingTime.minutes, 1);
});

Deno.test("text_statistics - counts paragraphs", () => {
  const handler = getHandler("text_statistics");
  const result = handler({
    text: "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
  }) as { paragraphs: number };

  assertEquals(result.paragraphs, 3);
});

Deno.test("text_statistics - calculates readability scores", () => {
  const handler = getHandler("text_statistics");
  const result = handler({
    text: "The quick brown fox jumps over the lazy dog. This is a simple sentence with easy words.",
  }) as {
    readability: {
      fleschReadingEase: number;
      fleschKincaidGrade: number;
      interpretation: string;
      syllables: number;
      avgSyllablesPerWord: number;
      avgWordsPerSentence: number;
    };
  };

  assertEquals(typeof result.readability.fleschReadingEase, "number");
  assertEquals(typeof result.readability.fleschKincaidGrade, "number");
  assertEquals(typeof result.readability.interpretation, "string");
  assertEquals(result.readability.syllables > 0, true);
  assertEquals(result.readability.avgSyllablesPerWord > 0, true);
  assertEquals(result.readability.avgWordsPerSentence > 0, true);
});

Deno.test("text_statistics - simple text has high readability ease", () => {
  const handler = getHandler("text_statistics");
  const result = handler({
    text: "I like cats. Cats are fun. They play a lot. Dogs are nice too.",
  }) as {
    readability: { fleschReadingEase: number };
  };

  // Simple short sentences should have high Flesch Reading Ease (> 60)
  assertEquals(result.readability.fleschReadingEase > 60, true);
});

Deno.test("text_statistics - returns word frequency for word cloud", () => {
  const handler = getHandler("text_statistics");
  const result = handler({
    text: "apple banana apple cherry apple banana orange apple cherry apple",
    wordFrequencyLimit: 5,
  }) as {
    wordFrequency: {
      topWords: Array<{ word: string; count: number; percentage: number }>;
      totalAnalyzed: number;
      uniqueAnalyzed: number;
    };
  };

  // apple appears 5 times, should be first
  assertEquals(result.wordFrequency.topWords[0].word, "apple");
  assertEquals(result.wordFrequency.topWords[0].count, 5);
  assertEquals(result.wordFrequency.topWords.length <= 5, true);
  assertEquals(result.wordFrequency.uniqueAnalyzed, 4); // apple, banana, cherry, orange
});

Deno.test("text_statistics - sentence analysis returns avg length", () => {
  const handler = getHandler("text_statistics");
  const result = handler({
    text: "Short one. This is a medium length sentence here. This is a much longer sentence with many more words in it.",
  }) as {
    sentences: {
      total: number;
      avgLength: number;
      longest: Array<{ text: string; wordCount: number; position: number }>;
      shortest: Array<{ text: string; wordCount: number; position: number }>;
    };
  };

  assertEquals(result.sentences.total, 3);
  assertEquals(typeof result.sentences.avgLength, "number");
  assertEquals(result.sentences.avgLength > 0, true);
  // Longest sentence should have the most words
  assertEquals(result.sentences.longest[0].wordCount > result.sentences.shortest[0].wordCount, true);
});

Deno.test("text_statistics - longest sentences are correctly identified", () => {
  const handler = getHandler("text_statistics");
  const result = handler({
    text: "Hi. This is a longer sentence with more words. Bye.",
  }) as {
    sentences: {
      longest: Array<{ wordCount: number; position: number }>;
    };
  };

  // The middle sentence (position 2) should be the longest
  assertEquals(result.sentences.longest[0].position, 2);
  assertEquals(result.sentences.longest[0].wordCount, 8);
});

// Word frequency tests
Deno.test("text_word_frequency - counts word frequency", () => {
  const handler = getHandler("text_word_frequency");
  const result = handler({
    text: "apple banana apple cherry apple banana",
  }) as { items: Array<{ word: string; count: number }> };

  assertEquals(result.items[0].word, "apple");
  assertEquals(result.items[0].count, 3);
});

Deno.test("text_word_frequency - excludes stopwords", () => {
  const handler = getHandler("text_word_frequency");
  const result = handler({
    text: "the quick brown fox and the lazy dog",
    excludeStopwords: true,
  }) as { items: Array<{ word: string }> };

  const words = result.items.map((i) => i.word);
  assertEquals(words.includes("the"), false);
  assertEquals(words.includes("and"), false);
});

Deno.test("text_word_frequency - includes stopwords when disabled", () => {
  const handler = getHandler("text_word_frequency");
  const result = handler({
    text: "the the the quick",
    excludeStopwords: false,
  }) as { items: Array<{ word: string; count: number }> };

  assertEquals(result.items[0].word, "the");
  assertEquals(result.items[0].count, 3);
});

Deno.test("text_word_frequency - supports bigrams", () => {
  const handler = getHandler("text_word_frequency");
  const result = handler({
    text: "new york new york city",
    ngram: 2,
    excludeStopwords: false,
  }) as { items: Array<{ word: string }>; ngram: number };

  assertEquals(result.ngram, 2);
  assertEquals(result.items[0].word, "new york");
});

Deno.test("text_word_frequency - respects min length", () => {
  const handler = getHandler("text_word_frequency");
  const result = handler({
    text: "a an the apple banana cherry",
    minLength: 4,
    excludeStopwords: false,
  }) as { items: Array<{ word: string }> };

  const words = result.items.map((i) => i.word);
  assertEquals(words.includes("a"), false);
  assertEquals(words.includes("an"), false);
});

// Sentiment analysis tests
Deno.test("text_sentiment_simple - positive text", () => {
  const handler = getHandler("text_sentiment_simple");
  const result = handler({
    text: "I love this amazing product. It is wonderful and fantastic!",
  }) as { sentiment: string; score: number };

  assertEquals(result.sentiment, "Positive");
  assertEquals(result.score > 0, true);
});

Deno.test("text_sentiment_simple - negative text", () => {
  const handler = getHandler("text_sentiment_simple");
  const result = handler({
    text: "This is terrible and awful. I hate it. Very bad experience.",
  }) as { sentiment: string; score: number };

  assertEquals(result.sentiment, "Negative");
  assertEquals(result.score < 0, true);
});

Deno.test("text_sentiment_simple - neutral text", () => {
  const handler = getHandler("text_sentiment_simple");
  const result = handler({
    text: "The meeting is scheduled for tomorrow at 3pm in the conference room.",
  }) as { sentiment: string };

  assertEquals(result.sentiment, "Neutral");
});

Deno.test("text_sentiment_simple - handles negation", () => {
  const handler = getHandler("text_sentiment_simple");
  const result = handler({
    text: "This is not good at all.",
  }) as { negative: { words: string[] } };

  // "not good" should be detected as negative
  assertEquals(result.negative.words.includes("not good"), true);
});

Deno.test("text_sentiment_simple - returns word matches", () => {
  const handler = getHandler("text_sentiment_simple");
  const result = handler({
    text: "Great job! Excellent work!",
  }) as { positive: { words: string[]; score: number } };

  assertEquals(result.positive.words.length > 0, true);
  assertEquals(result.positive.score > 0, true);
});
