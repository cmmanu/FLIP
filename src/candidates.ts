import * as path from 'path';

/**
 * Given a file path, returns an ordered list of candidate counterpart paths.
 * If the file is a test file, candidates point to source files and vice versa.
 */
export function getCandidates(filePath: string): string[] {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const candidates: string[] = [];

  // --- Detect if current file is a TEST file ---

  // Pattern 1: test_ prefix (Bazel C++ convention)
  if (base.startsWith('test_')) {
    const srcBase = base.replace(/^test_/, '');
    // Directory mirror: test/modules/X/ -> src/modules/X/
    if (dir.includes('/test/')) {
      const srcDir = dir.replace(/\/test\//, '/src/');
      candidates.push(path.join(srcDir, `${srcBase}${ext}`));
      candidates.push(path.join(srcDir, `${srcBase}.h`));
    }
    // Same directory
    candidates.push(path.join(dir, `${srcBase}${ext}`));
    // Parent directory (for flat test/ dirs like shared/test/)
    const parentDir = path.dirname(dir);
    candidates.push(path.join(parentDir, srcBase, `${srcBase}${ext}`));
    candidates.push(path.join(parentDir, srcBase, `${srcBase}.h`));
    candidates.push(path.join(parentDir, `${srcBase}${ext}`));
    return candidates;
  }

  // Pattern 2: ut_ prefix (Bazel test utility)
  if (base.startsWith('ut_')) {
    const srcBase = base.replace(/^ut_/, '');
    if (dir.includes('/test/')) {
      const srcDir = dir.replace(/\/test\//, '/src/');
      candidates.push(path.join(srcDir, `${srcBase}${ext}`));
      candidates.push(path.join(srcDir, `${srcBase}.h`));
    }
    candidates.push(path.join(dir, `${srcBase}${ext}`));
    return candidates;
  }

  // Pattern 3: _test suffix (Go/C++)
  if (base.endsWith('_test')) {
    const srcBase = base.replace(/_test$/, '');
    candidates.push(path.join(dir, `${srcBase}${ext}`));
    if (dir.includes('/test/')) {
      const srcDir = dir.replace(/\/test\//, '/src/');
      candidates.push(path.join(srcDir, `${srcBase}${ext}`));
    }
    return candidates;
  }

  // Pattern 4: .test. / .spec. suffix (JS/TS)
  if (base.endsWith('.test') || base.endsWith('.spec')) {
    const srcBase = base.replace(/\.(test|spec)$/, '');
    candidates.push(path.join(dir, `${srcBase}${ext}`));
    return candidates;
  }

  // Pattern 5: Test prefix/suffix (Java)
  if (base.startsWith('Test') && base[4]?.toUpperCase() === base[4]) {
    const srcBase = base.replace(/^Test/, '');
    candidates.push(path.join(dir, `${srcBase}${ext}`));
    if (dir.includes('/test/')) {
      const srcDir = dir.replace(/\/test\//, '/src/');
      candidates.push(path.join(srcDir, `${srcBase}${ext}`));
    }
    return candidates;
  }
  if (base.endsWith('Test')) {
    const srcBase = base.replace(/Test$/, '');
    candidates.push(path.join(dir, `${srcBase}${ext}`));
    if (dir.includes('/test/')) {
      const srcDir = dir.replace(/\/test\//, '/src/');
      candidates.push(path.join(srcDir, `${srcBase}${ext}`));
    }
    return candidates;
  }

  // --- Current file is a SOURCE file — produce test candidates ---

  // Priority 1: Bazel directory mirror (src/ -> test/) with test_ prefix
  if (dir.includes('/src/')) {
    const testDir = dir.replace(/\/src\//, '/test/');
    candidates.push(path.join(testDir, `test_${base}${ext}`));
    candidates.push(path.join(testDir, `test_${base}.cpp`));
    candidates.push(path.join(testDir, `ut_${base}.h`));
    candidates.push(path.join(testDir, `ut_${base}${ext}`));
  }

  // Priority 2: test_ prefix in same directory
  candidates.push(path.join(dir, `test_${base}${ext}`));

  // Priority 3: Sibling test/ directory (for shared/utils style)
  const parentDir = path.dirname(dir);
  candidates.push(path.join(parentDir, 'test', `test_${base}${ext}`));
  candidates.push(path.join(parentDir, 'test', `test_${base}.cpp`));

  // Priority 4: _test suffix (Go/C++)
  candidates.push(path.join(dir, `${base}_test${ext}`));

  // Priority 5: .test. / .spec. suffix (JS/TS)
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    candidates.push(path.join(dir, `${base}.test${ext}`));
    candidates.push(path.join(dir, `${base}.spec${ext}`));
  }

  // Priority 6: Java style
  if (['.java', '.kt'].includes(ext)) {
    candidates.push(path.join(dir, `Test${base}${ext}`));
    candidates.push(path.join(dir, `${base}Test${ext}`));
    if (dir.includes('/src/')) {
      const testDir = dir.replace(/\/src\//, '/test/');
      candidates.push(path.join(testDir, `Test${base}${ext}`));
      candidates.push(path.join(testDir, `${base}Test${ext}`));
    }
  }

  return candidates;
}

/**
 * Given a file path, returns the glob pattern(s) to find AT (acceptance test) counterparts.
 * Since one source file can map to many AT files, we return glob patterns
 * rather than exact paths so the caller can show a QuickPick.
 *
 * Mapping:
 *   qm/components/<comp>/src/modules/<module>/foo.cpp
 *     -> qm/test/at_components/<comp>/<module>/at_*.h
 *     -> qm/test/at_components/<comp>/<module>/test_*.cpp
 *
 *   qm/test/at_components/<comp>/<module>/at_foo.h  (AT -> source)
 *     -> qm/components/<comp>/src/modules/<module>/
 */
export interface AtSearchResult {
  /** Glob patterns to search for AT files */
  globs: string[];
  /** If we can determine exact candidates, list them here */
  exactCandidates: string[];
  /** The module name extracted from the path */
  moduleName: string | undefined;
}

/**
 * Extract the AT search info for a given file.
 * Returns undefined if the file doesn't belong to a recognized structure.
 */
export function getAtSearchInfo(filePath: string): AtSearchResult | undefined {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  // --- AT file -> Source ---
  // Pattern: qm/test/at_components/<comp>/<module>/at_<name>.h  (nested in subdir)
  //       or qm/test/at_components/<comp>/at_<name>.h           (at component root)
  //       or qm/test/at_components/<comp>/<module>/test_<name>.cpp
  const atComponentMatch = dir.match(/\/test\/at_components\/(.+)/);
  if (atComponentMatch && (base.startsWith('at_') || base.startsWith('test_'))) {
    const relPath = atComponentMatch[1]; // e.g. "pdc/pdc", "pdc/auto_pdc", or "remote_parking"
    const srcBase = base.replace(/^(at_|test_)/, '');

    const parts = relPath.split('/');
    const comp = parts[0]; // e.g. "pdc" or "remote_parking"
    const modulePath = parts.slice(1).join('/'); // e.g. "pdc", "auto_pdc", or "" (empty)

    const componentRoot = dir.replace(/\/test\/at_components\/.*/, '');

    // Build candidates and globs
    const exactCandidates: string[] = [];
    const globs: string[] = [];

    if (modulePath) {
      // AT in subdir → source is in modules/<modulePath>/
      const srcDir = path.join(componentRoot, 'components', comp, 'src', 'modules', modulePath);
      exactCandidates.push(path.join(srcDir, `${srcBase}.cpp`));
      exactCandidates.push(path.join(srcDir, `${srcBase}.h`));
      globs.push(`**/components/${comp}/src/modules/${modulePath}/${srcBase}.*`);
      globs.push(`**/components/${comp}/src/modules/${modulePath}/**/${srcBase}.*`);
    } else {
      // AT at component root (e.g., at_remote_parking_aborts.h)
      // The source could be in any module under this component
      // Also try stripping the component name prefix from srcBase
      // e.g. "remote_parking_aborts" → look for "aborts" module
      const withoutCompPrefix = srcBase.startsWith(comp + '_')
        ? srcBase.slice(comp.length + 1)
        : srcBase;

      globs.push(`**/components/${comp}/src/modules/**/${withoutCompPrefix}.*`);
      globs.push(`**/components/${comp}/src/modules/**/${srcBase}.*`);
      globs.push(`**/components/${comp}/src/modules/${withoutCompPrefix}/**`);

      // Exact guesses
      const srcDir = path.join(componentRoot, 'components', comp, 'src', 'modules');
      exactCandidates.push(path.join(srcDir, withoutCompPrefix, `${withoutCompPrefix}.cpp`));
      exactCandidates.push(path.join(srcDir, withoutCompPrefix, `${withoutCompPrefix}.h`));
      exactCandidates.push(path.join(srcDir, `${srcBase}.cpp`));
      exactCandidates.push(path.join(srcDir, `${srcBase}.h`));
    }

    return {
      globs,
      exactCandidates,
      moduleName: modulePath ? modulePath.split('/').pop() : comp,
    };
  }

  // --- Source -> AT ---
  // Pattern: qm/components/<comp>/src/modules/<module>/foo.cpp
  const srcComponentMatch = dir.match(/\/components\/([^/]+)\/src\/modules\/(.+)/);
  if (srcComponentMatch) {
    const comp = srcComponentMatch[1]; // e.g. "pdc", "remote_parking"
    const modulePath = srcComponentMatch[2]; // e.g. "pdc", "aborts", "active_pdc/apdc_activation_deactivation"

    const componentRoot = dir.replace(/\/components\/.*/, '');
    const atDir = path.join(componentRoot, 'test', 'at_components', comp, modulePath);
    const atCompDir = path.join(componentRoot, 'test', 'at_components', comp);

    // The first module segment (top-level module name)
    const topModule = modulePath.split('/')[0];

    // Since ATs can be in a subdirectory matching the module OR at the component root,
    // search both locations
    return {
      globs: [
        // Exact module subdir
        `**/test/at_components/${comp}/${modulePath}/at_*`,
        `**/test/at_components/${comp}/${modulePath}/test_*`,
        // Top-level module subdir (if nested deeper)
        `**/test/at_components/${comp}/${topModule}/at_*`,
        `**/test/at_components/${comp}/${topModule}/test_*`,
        // Component root (AT files like at_remote_parking_aborts.h that sit at comp level)
        `**/test/at_components/${comp}/at_*${topModule}*`,
        `**/test/at_components/${comp}/test_*${topModule}*`,
        `**/test/at_components/${comp}/at_*${base}*`,
        `**/test/at_components/${comp}/test_*${base}*`,
      ],
      exactCandidates: [
        path.join(atDir, `at_${base}.h`),
        path.join(atDir, `test_${base}.cpp`),
        // Also check component root with comp prefix
        path.join(atCompDir, `at_${comp}_${topModule}.h`),
        path.join(atCompDir, `test_${comp}_${topModule}.cpp`),
        path.join(atCompDir, `at_${base}.h`),
        path.join(atCompDir, `test_${base}.cpp`),
      ],
      moduleName: topModule,
    };
  }

  // --- Source at component root level (swc_<comp>.cpp) ---
  const swcMatch = dir.match(/\/components\/([^/]+)\/src$/);
  if (swcMatch) {
    const comp = swcMatch[1];
    const componentRoot = dir.replace(/\/components\/.*/, '');

    return {
      globs: [
        `**/test/at_components/${comp}/**/at_*`,
        `**/test/at_components/${comp}/**/test_*`,
        `**/test/at_components/${comp}/at_*`,
        `**/test/at_components/${comp}/test_*`,
      ],
      exactCandidates: [],
      moduleName: comp,
    };
  }

  // --- UT test file -> AT (cross-reference) ---
  // Pattern: qm/components/<comp>/test/modules/<module>/test_<name>.cpp
  const utTestMatch = dir.match(/\/components\/([^/]+)\/test\/modules\/(.+)/);
  if (utTestMatch && (base.startsWith('test_') || base.startsWith('ut_'))) {
    const comp = utTestMatch[1];
    const modulePath = utTestMatch[2];
    const srcBase = base.replace(/^(test_|ut_)/, '');
    const topModule = modulePath.split('/')[0];

    const componentRoot = dir.replace(/\/components\/.*/, '');
    const atDir = path.join(componentRoot, 'test', 'at_components', comp, modulePath);
    const atCompDir = path.join(componentRoot, 'test', 'at_components', comp);

    return {
      globs: [
        `**/test/at_components/${comp}/${modulePath}/at_*`,
        `**/test/at_components/${comp}/${modulePath}/test_*`,
        `**/test/at_components/${comp}/${topModule}/at_*`,
        `**/test/at_components/${comp}/${topModule}/test_*`,
        `**/test/at_components/${comp}/at_*${topModule}*`,
        `**/test/at_components/${comp}/test_*${topModule}*`,
      ],
      exactCandidates: [
        path.join(atDir, `at_${srcBase}.h`),
        path.join(atDir, `test_${srcBase}.cpp`),
        path.join(atCompDir, `at_${comp}_${topModule}.h`),
        path.join(atCompDir, `test_${comp}_${topModule}.cpp`),
      ],
      moduleName: topModule,
    };
  }

  return undefined;
}
