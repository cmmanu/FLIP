import * as path from 'path';
import { SwitcherConfig, defaultConfig, templateToRegex, applyTemplate } from './config';

function matchMapping(dir: string, segment: string): boolean {
  return dir.includes(`/${segment}/`) || dir.endsWith(`/${segment}`);
}

function replaceMapping(dir: string, from: string, to: string): string {
  if (dir.includes(`/${from}/`)) {
    return dir.replace(`/${from}/`, `/${to}/`);
  }
  if (dir.endsWith(`/${from}`)) {
    return dir.slice(0, -(from.length)) + to;
  }
  return dir;
}

export function getCandidates(filePath: string, config: SwitcherConfig = defaultConfig): string[] {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const candidates: string[] = [];

  // Check if file matches any test prefix
  for (const prefix of config.testFilePrefixes) {
    if (base.startsWith(prefix)) {
      const srcBase = base.slice(prefix.length);
      for (const mapping of config.pathMappings) {
        if (matchMapping(dir, mapping.test)) {
          const srcDir = replaceMapping(dir, mapping.test, mapping.source);
          candidates.push(path.join(srcDir, `${srcBase}${ext}`));
          candidates.push(path.join(srcDir, `${srcBase}.h`));
        }
      }
      candidates.push(path.join(dir, `${srcBase}${ext}`));
      const parentDir = path.dirname(dir);
      candidates.push(path.join(parentDir, srcBase, `${srcBase}${ext}`));
      candidates.push(path.join(parentDir, srcBase, `${srcBase}.h`));
      candidates.push(path.join(parentDir, `${srcBase}${ext}`));
      return candidates;
    }
  }

  // Check test file suffixes
  for (const suffix of config.testFileSuffixes) {
    if (base.endsWith(suffix)) {
      const srcBase = base.slice(0, -suffix.length);
      candidates.push(path.join(dir, `${srcBase}${ext}`));
      for (const mapping of config.pathMappings) {
        if (matchMapping(dir, mapping.test)) {
          const srcDir = replaceMapping(dir, mapping.test, mapping.source);
          candidates.push(path.join(srcDir, `${srcBase}${ext}`));
        }
      }
      return candidates;
    }
  }

  // Check Java-style Test prefix/suffix
  if (config.javaStyle) {
    if (base.startsWith('Test') && base[4]?.toUpperCase() === base[4]) {
      const srcBase = base.slice(4);
      candidates.push(path.join(dir, `${srcBase}${ext}`));
      for (const mapping of config.pathMappings) {
        if (matchMapping(dir, mapping.test)) {
          const srcDir = replaceMapping(dir, mapping.test, mapping.source);
          candidates.push(path.join(srcDir, `${srcBase}${ext}`));
        }
      }
      return candidates;
    }
    if (base.endsWith('Test')) {
      const srcBase = base.slice(0, -4);
      candidates.push(path.join(dir, `${srcBase}${ext}`));
      for (const mapping of config.pathMappings) {
        if (matchMapping(dir, mapping.test)) {
          const srcDir = replaceMapping(dir, mapping.test, mapping.source);
          candidates.push(path.join(srcDir, `${srcBase}${ext}`));
        }
      }
      return candidates;
    }
  }

  // Source file → generate test candidates
  for (const mapping of config.pathMappings) {
    if (matchMapping(dir, mapping.source)) {
      const testDir = replaceMapping(dir, mapping.source, mapping.test);
      for (const prefix of config.testFilePrefixes) {
        candidates.push(path.join(testDir, `${prefix}${base}${ext}`));
        candidates.push(path.join(testDir, `${prefix}${base}.cpp`));
        candidates.push(path.join(testDir, `${prefix}${base}.h`));
      }
      for (const suffix of config.testFileSuffixes) {
        candidates.push(path.join(testDir, `${base}${suffix}${ext}`));
      }
      if (config.javaStyle && ['.java', '.kt'].includes(ext)) {
        candidates.push(path.join(testDir, `Test${base}${ext}`));
        candidates.push(path.join(testDir, `${base}Test${ext}`));
      }
    }
  }

  // Same directory with prefixes
  for (const prefix of config.testFilePrefixes) {
    candidates.push(path.join(dir, `${prefix}${base}${ext}`));
  }

  // Sibling test/ directory with prefixes
  const parentDir = path.dirname(dir);
  for (const prefix of config.testFilePrefixes) {
    candidates.push(path.join(parentDir, 'test', `${prefix}${base}${ext}`));
    candidates.push(path.join(parentDir, 'test', `${prefix}${base}.cpp`));
  }

  // Suffixes in same directory
  for (const suffix of config.testFileSuffixes) {
    candidates.push(path.join(dir, `${base}${suffix}${ext}`));
  }

  // Java-style in same directory
  if (config.javaStyle && ['.java', '.kt'].includes(ext)) {
    candidates.push(path.join(dir, `Test${base}${ext}`));
    candidates.push(path.join(dir, `${base}Test${ext}`));
  }

  return candidates;
}

export interface AtSearchResult {
  globs: string[];
  exactCandidates: string[];
  moduleName: string | undefined;
  direction: 'test-to-source' | 'source-to-test';
}

export function getRelatedSearchInfo(filePath: string, config: SwitcherConfig = defaultConfig): AtSearchResult | undefined {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  for (const mapping of config.relatedMappings) {
    // Skip mappings that only have searchPaths (no templates)
    if (!mapping.source || !mapping.test || !mapping.filePrefix) continue;

    const testRegex = templateToRegex(mapping.test);
    const sourceRegex = templateToRegex(mapping.source);

    // Check if this is an AT file (matches test pattern)
    const testMatch = dir.match(testRegex);
    if (testMatch?.groups && (base.startsWith(mapping.filePrefix) || base.startsWith('test_'))) {
      const srcBase = base.replace(new RegExp(`^(${escapeRegex(mapping.filePrefix)}|test_)`), '');
      const sourceDir = applyTemplate(mapping.source, testMatch.groups);

      // Find the root (everything before the matched portion)
      const matchStart = dir.indexOf(testMatch[0]);
      const root = dir.slice(0, matchStart);

      const srcDir = path.join(root, sourceDir);
      const exactCandidates = [
        path.join(srcDir, `${srcBase}.cpp`),
        path.join(srcDir, `${srcBase}.h`),
        path.join(srcDir, `${srcBase}${ext}`),
      ];

      // Build globs for broader search
      const globs: string[] = [];
      // Search in the mapped source directory
      globs.push(`**/${sourceDir}/${srcBase}.*`);
      globs.push(`**/${sourceDir}/**/${srcBase}.*`);

      const lastGroup = Object.values(testMatch.groups).pop();
      return {
        globs,
        exactCandidates,
        moduleName: lastGroup?.split('/').pop(),
        direction: 'test-to-source',
      };
    }

    // Check if this is a source file (matches source pattern)
    const srcMatch = dir.match(sourceRegex);
    if (srcMatch?.groups) {
      const testDir = applyTemplate(mapping.test, srcMatch.groups);

      // Find the root
      const matchStart = dir.indexOf(srcMatch[0]);
      const root = dir.slice(0, matchStart);

      const atDir = path.join(root, testDir);
      const exactCandidates = [
        path.join(atDir, `${mapping.filePrefix}${base}.h`),
        path.join(atDir, `${mapping.filePrefix}${base}${ext}`),
        path.join(atDir, `test_${base}.cpp`),
        path.join(atDir, `test_${base}${ext}`),
      ];

      const globs = [
        `**/${testDir}/${mapping.filePrefix}*`,
        `**/${testDir}/test_*`,
      ];

      const lastGroup = Object.values(srcMatch.groups).pop();
      return {
        globs,
        exactCandidates,
        moduleName: lastGroup?.split('/').pop(),
        direction: 'source-to-test',
      };
    }
  }

  return undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
