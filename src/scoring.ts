import * as path from 'path';

// Extensions that are implementation files per language family
const IMPL_EXTENSIONS: Record<string, string[]> = {
  '.cpp': ['.cpp', '.cc', '.cxx'],
  '.cc': ['.cpp', '.cc', '.cxx'],
  '.cxx': ['.cpp', '.cc', '.cxx'],
  '.c': ['.c'],
  '.h': ['.h', '.hpp', '.hxx'],
  '.hpp': ['.h', '.hpp', '.hxx'],
  '.go': ['.go'],
  '.ts': ['.ts', '.tsx'],
  '.tsx': ['.ts', '.tsx'],
  '.js': ['.js', '.jsx'],
  '.jsx': ['.js', '.jsx'],
  '.java': ['.java'],
  '.kt': ['.kt'],
  '.py': ['.py'],
  '.rb': ['.rb'],
  '.rs': ['.rs'],
  '.swift': ['.swift'],
  '.dart': ['.dart'],
};

// A .cpp source is tested by test_*.cpp, NOT test_*.h
// A .h header can be tested by test_*.cpp (testing the interface)
const TEST_EXT_FOR_SOURCE: Record<string, string[]> = {
  '.cpp': ['.cpp', '.cc', '.cxx'],
  '.cc': ['.cpp', '.cc', '.cxx'],
  '.cxx': ['.cpp', '.cc', '.cxx'],
  '.c': ['.c', '.cpp'],
  '.h': ['.cpp', '.cc', '.h', '.hpp'],
  '.hpp': ['.cpp', '.cc', '.h', '.hpp'],
};

// ─── Path structure helpers ───────────────────────────────────────────────────

/**
 * Longest Common Subsequence length of two string arrays.
 * Used to measure how structurally similar two paths are while preserving order.
 */
function lcsLength(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  // Use rolling array for memory efficiency
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n];
}

/**
 * Normalize a single path segment for structural comparison:
 * strips test affixes, file extension, camelCase splits, lowercases.
 */
function normalizeSegment(seg: string, testPrefixes: string[]): string {
  let s = seg.replace(/\.[^.]+$/, '').toLowerCase(); // strip extension
  for (const prefix of testPrefixes) {
    if (s.startsWith(prefix.toLowerCase())) {
      s = s.slice(prefix.length);
      break;
    }
  }
  for (const suffix of ['_test', '_spec', 'test', 'spec']) {
    if (s.endsWith(suffix) && s.length > suffix.length) {
      s = s.slice(0, -suffix.length);
      break;
    }
  }
  // Strip generic test-dir names (they don't carry semantic meaning)
  if (['test', 'tests', '__tests__', 'spec', 'src', 'main', 'lib', 'source'].includes(s)) {
    return '';
  }
  return s;
}

/**
 * Compute a structural path similarity score using LCS on normalized segments.
 * Two files that are perfect structural mirrors (only differing in test/src dir name)
 * score very high. Files sharing a long common sub-path score proportionally.
 */
function pathStructureScore(
  sourceFilePath: string,
  candidateFilePath: string,
  testPrefixes: string[]
): number {
  const srcSegs = sourceFilePath.split(/[/\\]/)
    .map(s => normalizeSegment(s, testPrefixes))
    .filter(Boolean);
  const cndSegs = candidateFilePath.split(/[/\\]/)
    .map(s => normalizeSegment(s, testPrefixes))
    .filter(Boolean);

  if (srcSegs.length === 0 || cndSegs.length === 0) return 0;

  const lcs = lcsLength(srcSegs, cndSegs);
  const maxLen = Math.max(srcSegs.length, cndSegs.length);
  const ratio = lcs / maxLen;

  // Bonus: normalized base names match exactly → very strong signal
  const srcBase = srcSegs[srcSegs.length - 1];
  const cndBase = cndSegs[cndSegs.length - 1];
  const exactNameBonus = (srcBase && cndBase && srcBase === cndBase) ? 40 : 0;

  return Math.round(ratio * 60) + exactNameBonus;
}

/**
 * Detect structural path mirroring: files in parallel directory trees
 * (e.g. src/modules/foo/ ↔ test/modules/foo/) get a strong bonus.
 */
function subPathMirrorScore(sourceFilePath: string, candidateFilePath: string): number {
  const srcParts = sourceFilePath.split(/[/\\]/);
  const cndParts = candidateFilePath.split(/[/\\]/);

  // Find common prefix length
  let commonLen = 0;
  while (
    commonLen < srcParts.length - 1 &&
    commonLen < cndParts.length - 1 &&
    srcParts[commonLen] === cndParts[commonLen]
  ) {
    commonLen++;
  }

  // Sub-paths after the first diverging segment (skip it, it's the src/test root)
  const srcSuffix = srcParts.slice(commonLen + 1, -1); // directory segments only
  const cndSuffix = cndParts.slice(commonLen + 1, -1);

  if (srcSuffix.length === 0 && cndSuffix.length === 0) return 10; // same directory
  if (srcSuffix.length === 0 || cndSuffix.length === 0) return 0;

  const srcDir = srcSuffix.join('/').toLowerCase();
  const cndDir = cndSuffix.join('/').toLowerCase();

  if (srcDir === cndDir) return 35; // Perfect structural mirror

  // Partial: LCS of sub-path segments
  const lcs = lcsLength(srcSuffix.map(s => s.toLowerCase()), cndSuffix.map(s => s.toLowerCase()));
  const ratio = lcs / Math.max(srcSuffix.length, cndSuffix.length);
  return Math.round(ratio * 20);
}

// ─── Keyword extraction ───────────────────────────────────────────────────────

/**
 * Extract meaningful keywords from a file path for fuzzy matching.
 * Strips test prefixes/suffixes and splits on separators.
 */
export function extractKeywords(filePath: string, testPrefixes: string[] = ['test_', 'ut_', 'at_']): string[] {
  const ext = path.extname(filePath);
  let base = path.basename(filePath, ext);

  for (const prefix of testPrefixes) {
    if (base.startsWith(prefix)) {
      base = base.slice(prefix.length);
      break;
    }
  }

  for (const suffix of ['_test', '.test', '.spec', 'Test']) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }

  const words = base
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\-./]+/)
    .filter(w => w.length > 1);

  return [base.toLowerCase(), ...words];
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Score how well a candidate file matches the source file.
 *
 * Signals (in rough order of strength):
 *  1. Structural path mirroring — same sub-path in parallel trees
 *  2. LCS-based path segment similarity — ordered structural alignment
 *  3. Core name match — stripped filename identity
 *  4. Extension affinity — language-family compatibility
 *  5. Direction indicators — is it in a test/src directory?
 *  6. Keyword word overlap — shared semantic tokens
 */
export function scoreMatch(
  sourceFilePath: string,
  candidateFilePath: string,
  direction: 'source-to-test' | 'test-to-source',
  testPrefixes: string[] = ['test_', 'ut_', 'at_']
): number {
  // Same file = reject
  if (path.resolve(sourceFilePath) === path.resolve(candidateFilePath)) {
    return -1000;
  }

  const sourceExt = path.extname(sourceFilePath);
  const candidateExt = path.extname(candidateFilePath);
  const sourceKeywords = extractKeywords(sourceFilePath, testPrefixes);
  const candidateKeywords = extractKeywords(candidateFilePath, testPrefixes);
  const candidateBase = path.basename(candidateFilePath, candidateExt).toLowerCase();
  const sourceCoreName = sourceKeywords[0] || '';
  const candidateCoreName = candidateKeywords[0] || '';

  let score = 0;

  // ── 1. Structural path mirroring ──────────────────────────────────────────
  score += subPathMirrorScore(sourceFilePath, candidateFilePath);

  // ── 2. LCS-based path structure similarity ─────────────────────────────────
  score += pathStructureScore(sourceFilePath, candidateFilePath, testPrefixes);

  // ── 3. Core name matching ─────────────────────────────────────────────────
  if (candidateCoreName === sourceCoreName && sourceCoreName.length > 0) {
    score += 60; // Exact match after stripping test affixes
  } else if (candidateCoreName.includes(sourceCoreName) && sourceCoreName.length >= 3) {
    const coverage = sourceCoreName.length / candidateCoreName.length;
    score += Math.round(40 * coverage);
  } else if (sourceCoreName.includes(candidateCoreName) && candidateCoreName.length >= 3) {
    const coverage = candidateCoreName.length / sourceCoreName.length;
    score += Math.round(35 * coverage);
  }

  // ── 4. Extension affinity ─────────────────────────────────────────────────
  if (direction === 'source-to-test') {
    const preferredTestExts = TEST_EXT_FOR_SOURCE[sourceExt] || IMPL_EXTENSIONS[sourceExt] || [sourceExt];
    if (preferredTestExts.includes(candidateExt)) {
      score += 20;
    } else {
      score -= 15;
    }
  } else {
    const family = IMPL_EXTENSIONS[sourceExt] || [sourceExt];
    if (family.includes(candidateExt)) {
      score += 20;
    } else if (sourceExt === '.cpp' && (candidateExt === '.h' || candidateExt === '.hpp')) {
      score += 10;
    } else {
      score -= 15;
    }
  }

  // ── 5. Direction indicators ───────────────────────────────────────────────
  if (direction === 'source-to-test') {
    for (const prefix of testPrefixes) {
      if (candidateBase.startsWith(prefix.toLowerCase())) {
        score += 15;
        break;
      }
    }
    if (/(?:^|\/)(?:test|tests|__tests__|spec)\//.test(
      candidateFilePath.replace(/\\/g, '/')
    )) {
      score += 10;
    }
    const looksLikeTest = testPrefixes.some(p => candidateBase.startsWith(p.toLowerCase()))
      || ['_test', '.test', '.spec'].some(s => candidateBase.endsWith(s))
      || candidateBase.endsWith('test') || candidateBase.startsWith('test');
    if (!looksLikeTest) {
      score -= 10;
    }
  } else {
    // test-to-source: strongly penalize other test files
    const looksLikeTest = testPrefixes.some(p => candidateBase.startsWith(p.toLowerCase()))
      || ['_test', '.test', '.spec'].some(s => candidateBase.endsWith(s));
    if (looksLikeTest) {
      score -= 40;
    }
    if (/(?:^|\/)(?:test|tests|__tests__|spec|at_components)\//.test(
      candidateFilePath.replace(/\\/g, '/')
    )) {
      score -= 30;
    }
    if (candidateFilePath.includes('/src/')) {
      score += 15;
    }
  }

  // ── 6. Keyword word overlap ───────────────────────────────────────────────
  const sourceWordSet = new Set(sourceKeywords.slice(1));
  const candidateWords = candidateKeywords.slice(1);
  let matchedWords = 0;
  for (const word of candidateWords) {
    if (sourceWordSet.has(word)) matchedWords++;
  }
  if (candidateWords.length > 0) {
    const overlapRatio = matchedWords / Math.max(sourceWordSet.size, candidateWords.length);
    score += Math.round(overlapRatio * 20);
  }

  return score;
}

// ─── Glob builder ─────────────────────────────────────────────────────────────

/**
 * Build glob patterns for fuzzy searching based on file keywords.
 */
export function buildFuzzyGlobs(filePath: string, testPrefixes: string[] = ['test_', 'ut_', 'at_']): string[] {
  const keywords = extractKeywords(filePath, testPrefixes);
  const base = keywords[0];
  const globs: string[] = [];

  if (base) {
    globs.push(`**/*${base}*`);

    // Individual significant words (4+ chars for less noise)
    const significantWords = keywords.slice(1).filter(w => w.length >= 4);
    for (const word of significantWords.slice(0, 3)) {
      globs.push(`**/*${word}*`);
    }
  }

  return globs;
}
