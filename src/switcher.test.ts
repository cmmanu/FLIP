import { getCandidates, getRelatedSearchInfo } from './candidates';
import { defaultConfig, SwitcherConfig } from './config';
import { scoreMatch, extractKeywords } from './scoring';

// Simple test runner (no test framework needed)
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertIncludes(arr: string[], expected: string, message: string) {
  const normalizedArr = arr.map((s) => s.replace(/\\/g, '/'));
  const normalizedExpected = expected.replace(/\\/g, '/');
  assert(normalizedArr.includes(normalizedExpected), message);
}

console.log('\n=== Bazel Test Switcher - Unit Tests ===\n');

// --- Source -> Test (Bazel directory mirror with default config) ---
console.log('Source -> Test (directory mirror):');

assertIncludes(
  getCandidates('/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp'),
  '/workspace/qm/components/pdc/test/modules/pdc/test_pdc.cpp',
  'pdc.cpp -> test_pdc.cpp (dir mirror)'
);

assertIncludes(
  getCandidates('/workspace/qm/components/pdc/src/modules/active_pdc/apdc_activation_deactivation/apdc_activation_deactivation.cpp'),
  '/workspace/qm/components/pdc/test/modules/active_pdc/apdc_activation_deactivation/test_apdc_activation_deactivation.cpp',
  'deep nested module -> test (dir mirror)'
);

assertIncludes(
  getCandidates('/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp'),
  '/workspace/qm/components/pdc/test/modules/pdc/ut_pdc.h',
  'pdc.cpp -> ut_pdc.h (test utility)'
);

// --- Test -> Source ---
console.log('\nTest -> Source (directory mirror):');

assertIncludes(
  getCandidates('/workspace/qm/components/pdc/test/modules/pdc/test_pdc.cpp'),
  '/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp',
  'test_pdc.cpp -> pdc.cpp (dir mirror)'
);

assertIncludes(
  getCandidates('/workspace/qm/components/pdc/test/modules/active_pdc/apdc_activation_deactivation/test_apdc_activation_deactivation.cpp'),
  '/workspace/qm/components/pdc/src/modules/active_pdc/apdc_activation_deactivation/apdc_activation_deactivation.cpp',
  'deep nested test -> source (dir mirror)'
);

// --- ut_ prefix -> source ---
console.log('\nTest utility -> Source:');

assertIncludes(
  getCandidates('/workspace/qm/components/pdc/test/modules/pdc/ut_pdc.h'),
  '/workspace/qm/components/pdc/src/modules/pdc/pdc.h',
  'ut_pdc.h -> pdc.h (dir mirror)'
);

// --- Shared/Utils flat test directory ---
console.log('\nShared/Utils flat test dir:');

assertIncludes(
  getCandidates('/workspace/qm/shared/dtc/dtc_error_info.cpp'),
  '/workspace/qm/shared/test/test_dtc_error_info.cpp',
  'shared/dtc/foo.cpp -> shared/test/test_foo.cpp'
);

assertIncludes(
  getCandidates('/workspace/qm/shared/test/test_dtc_error_info.cpp'),
  '/workspace/qm/shared/dtc_error_info/dtc_error_info.cpp',
  'shared/test/test_foo.cpp -> shared/foo/foo.cpp (parent dir pattern)'
);

// --- Go/C++ _test suffix ---
console.log('\n_test suffix (Go/C++):');

assertIncludes(
  getCandidates('/workspace/pkg/handler_test.go'),
  '/workspace/pkg/handler.go',
  'handler_test.go -> handler.go'
);

assertIncludes(
  getCandidates('/workspace/pkg/handler.go'),
  '/workspace/pkg/handler_test.go',
  'handler.go -> handler_test.go'
);

// --- JS/TS .test. / .spec. ---
console.log('\n.test./.spec. suffix (JS/TS):');

assertIncludes(
  getCandidates('/workspace/src/app.test.ts'),
  '/workspace/src/app.ts',
  'app.test.ts -> app.ts'
);

assertIncludes(
  getCandidates('/workspace/src/app.ts'),
  '/workspace/src/app.test.ts',
  'app.ts -> app.test.ts'
);

// --- Java style ---
console.log('\nJava style:');

assertIncludes(
  getCandidates('/workspace/src/main/java/Foo.java'),
  '/workspace/src/test/java/TestFoo.java',
  'Foo.java -> TestFoo.java (Java dir mirror)'
);

assertIncludes(
  getCandidates('/workspace/src/main/java/Foo.java'),
  '/workspace/src/test/java/FooTest.java',
  'Foo.java -> FooTest.java (Java dir mirror)'
);

assertIncludes(
  getCandidates('/workspace/src/test/java/TestFoo.java'),
  '/workspace/src/main/java/Foo.java',
  'TestFoo.java -> Foo.java (Java dir mirror)'
);

// --- Custom config ---
console.log('\nCustom config:');

const customConfig: SwitcherConfig = {
  pathMappings: [{ source: 'lib', test: 'spec' }],
  testFilePrefixes: [],
  testFileSuffixes: ['_spec'],
  javaStyle: false,
  relatedMappings: [],
};

assertIncludes(
  getCandidates('/workspace/lib/parser.rb', customConfig),
  '/workspace/spec/parser_spec.rb',
  'Ruby: lib/parser.rb -> spec/parser_spec.rb (custom config)'
);

assertIncludes(
  getCandidates('/workspace/spec/parser_spec.rb', customConfig),
  '/workspace/lib/parser.rb',
  'Ruby: spec/parser_spec.rb -> lib/parser.rb (custom config)'
);

// --- React __tests__ ---
console.log('\nReact __tests__:');

assertIncludes(
  getCandidates('/workspace/src/utils/format.ts'),
  '/workspace/__tests__/utils/format.test.ts',
  'src/format.ts -> __tests__/format.test.ts'
);

// --- AT: Source -> Acceptance Test ---
console.log('\nAT: Source -> Acceptance Test:');

{
  const info = getRelatedSearchInfo('/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp');
  assert(info !== undefined, 'getAtSearchInfo returns result for pdc source');
  assert(info!.direction === 'source-to-test', 'direction is source-to-test');
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/test/at_components/pdc/pdc/at_pdc.h',
    'pdc.cpp -> at_pdc.h (exact candidate)'
  );
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/test/at_components/pdc/pdc/test_pdc.cpp',
    'pdc.cpp -> test_pdc.cpp (exact candidate)'
  );
  assert(
    info!.globs.some(g => g.includes('at_components/pdc/pdc/at_*')),
    'pdc.cpp -> glob includes at_* pattern'
  );
  assert(info!.moduleName === 'pdc', 'module name is pdc');
}

{
  const info = getRelatedSearchInfo('/workspace/qm/components/pdc/src/modules/auto_pdc/auto_pdc.cpp');
  assert(info !== undefined, 'getAtSearchInfo returns result for auto_pdc source');
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/test/at_components/pdc/auto_pdc/at_auto_pdc.h',
    'auto_pdc.cpp -> at_auto_pdc.h'
  );
}

// --- AT: AT -> Source ---
console.log('\nAT: Acceptance Test -> Source:');

{
  const info = getRelatedSearchInfo('/workspace/qm/test/at_components/pdc/pdc/at_pdc.h');
  assert(info !== undefined, 'getAtSearchInfo returns result for AT file');
  assert(info!.direction === 'test-to-source', 'direction is test-to-source');
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp',
    'at_pdc.h -> pdc.cpp (exact candidate)'
  );
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/components/pdc/src/modules/pdc/pdc.h',
    'at_pdc.h -> pdc.h (exact candidate)'
  );
}

{
  const info = getRelatedSearchInfo('/workspace/qm/test/at_components/remote_parking/center_locking_requester/at_center_locking_requester.h');
  assert(info !== undefined, 'getAtSearchInfo returns result for AT in subdir');
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/components/remote_parking/src/modules/center_locking_requester/center_locking_requester.cpp',
    'at_center_locking_requester.h -> center_locking_requester.cpp'
  );
}

// --- AT: Component root (swc_*.cpp) ---
console.log('\nAT: Component root -> all ATs:');

{
  const info = getRelatedSearchInfo('/workspace/qm/components/pdc/src/swc_pdc.cpp');
  assert(info !== undefined, 'getAtSearchInfo returns result for swc_pdc.cpp');
  assert(info!.direction === 'source-to-test', 'direction is source-to-test');
  assert(
    info!.globs.some(g => g.includes('at_components/pdc/at_*')),
    'swc_pdc.cpp -> glob searches AT files under pdc'
  );
  assert(info!.moduleName === 'pdc', 'module name is pdc');
}

// --- AT: Unrecognized file ---
console.log('\nAT: Unrecognized file:');

{
  const info = getRelatedSearchInfo('/workspace/some/random/file.cpp');
  assert(info === undefined, 'getAtSearchInfo returns undefined for unrecognized path');
}

// --- AT: Custom mapping ---
console.log('\nAT: Custom mapping:');

{
  const customAtConfig: SwitcherConfig = {
    ...defaultConfig,
    relatedMappings: [
      { source: 'app/features/{feature}', test: 'e2e/{feature}', filePrefix: 'e2e_' },
    ],
  };
  const info = getRelatedSearchInfo('/workspace/app/features/login/login.ts', customAtConfig);
  assert(info !== undefined, 'custom AT mapping matches source');
  assert(info!.direction === 'source-to-test', 'custom AT direction is source-to-test');
  assertIncludes(
    info!.exactCandidates,
    '/workspace/e2e/login/e2e_login.h',
    'custom: login.ts -> e2e/login/e2e_login.h'
  );
}

// --- Fuzzy scoring ---
console.log('\nFuzzy scoring:');

{
  // AT file at comp root should score high for matching source module
  const source = '/workspace/qm/components/remote_parking/src/modules/aborts/aborts.cpp';
  const atMatch = '/workspace/qm/test/at_components/remote_parking/at_remote_parking_aborts.h';
  const atUnrelated = '/workspace/qm/test/at_components/remote_parking/at_remote_parking_startup.h';
  const scoreGood = scoreMatch(source, atMatch, 'source-to-test', ['test_', 'ut_', 'at_']);
  const scoreBad = scoreMatch(source, atUnrelated, 'source-to-test', ['test_', 'ut_', 'at_']);
  assert(scoreGood > scoreBad, `aborts.cpp: at_..._aborts.h scores higher (${scoreGood}) than at_..._startup.h (${scoreBad})`);
  assert(scoreGood > 0, `at_remote_parking_aborts.h has positive score (${scoreGood})`);
}

{
  // AT→Source: at_remote_parking_aborts should prefer source files with "aborts"
  const atFile = '/workspace/qm/test/at_components/remote_parking/at_remote_parking_aborts.h';
  const goodSource = '/workspace/qm/components/remote_parking/src/modules/aborts/aborts.cpp';
  const badSource = '/workspace/qm/components/remote_parking/src/modules/startup/startup.cpp';
  const scoreGood = scoreMatch(atFile, goodSource, 'test-to-source', ['test_', 'ut_', 'at_']);
  const scoreBad = scoreMatch(atFile, badSource, 'test-to-source', ['test_', 'ut_', 'at_']);
  assert(scoreGood > scoreBad, `AT→Source: aborts.cpp scores higher (${scoreGood}) than startup.cpp (${scoreBad})`);
}

{
  // Extension affinity: .cpp source should prefer .cpp test over .h
  const source = '/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp';
  const testCpp = '/workspace/qm/components/pdc/test/modules/pdc/test_pdc.cpp';
  const testH = '/workspace/qm/components/pdc/test/modules/pdc/ut_pdc.h';
  const scoreCpp = scoreMatch(source, testCpp, 'source-to-test', ['test_', 'ut_', 'at_']);
  const scoreH = scoreMatch(source, testH, 'source-to-test', ['test_', 'ut_', 'at_']);
  assert(scoreCpp > scoreH, `.cpp source prefers .cpp test (${scoreCpp}) over .h (${scoreH})`);
}

{
  // But .h source can still find .cpp test (valid in C++)
  const source = '/workspace/qm/components/pdc/src/modules/pdc/pdc.h';
  const testCpp = '/workspace/qm/components/pdc/test/modules/pdc/test_pdc.cpp';
  const score = scoreMatch(source, testCpp, 'source-to-test', ['test_', 'ut_', 'at_']);
  assert(score > 0, `.h source → .cpp test has positive score (${score})`);
}

{
  // Keyword extraction strips prefixes
  const kw = extractKeywords('/workspace/test/at_components/pdc/at_pdc.h', ['test_', 'ut_', 'at_']);
  assert(kw.includes('pdc'), `extractKeywords strips at_ prefix: [${kw.join(', ')}]`);
}

{
  // Same file should get negative score
  const f = '/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp';
  const score = scoreMatch(f, f, 'source-to-test', ['test_', 'ut_', 'at_']);
  assert(score < 0, `same file scores negative (${score})`);
}

{
  // TypeScript: .ts source prefers .ts test, not .tsx
  const source = '/workspace/src/utils/format.ts';
  const testTs = '/workspace/src/utils/format.test.ts';
  const testTsx = '/workspace/src/components/format.test.tsx';
  const scoreTs = scoreMatch(source, testTs, 'source-to-test', ['test_', 'ut_', 'at_']);
  const scoreTsx = scoreMatch(source, testTsx, 'source-to-test', ['test_', 'ut_', 'at_']);
  assert(scoreTs >= scoreTsx, `.ts source prefers .ts (${scoreTs}) over .tsx (${scoreTsx})`);
}

{
  // AT→source: source file should score much higher than another AT file
  const atFile = '/workspace/qm/test/at_components/pdc/at_pdc.h';
  const sourceFile = '/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp';
  const otherAt = '/workspace/qm/test/at_components/pdc/at_pdc_startup.h';
  const scoreSource = scoreMatch(atFile, sourceFile, 'test-to-source', ['test_', 'ut_', 'at_']);
  const scoreOtherAt = scoreMatch(atFile, otherAt, 'test-to-source', ['test_', 'ut_', 'at_']);
  assert(scoreSource > scoreOtherAt, `AT→source: source (${scoreSource}) >> other AT (${scoreOtherAt})`);
  assert(scoreSource > 0, `AT→source: source has positive score (${scoreSource})`);
}

{
  // AT→source: should not pick a .h file from AT directory
  const atFile = '/workspace/qm/test/at_components/remote_parking/at_remote_parking_aborts.h';
  const sourceFile = '/workspace/qm/components/remote_parking/src/modules/aborts/aborts.cpp';
  const otherAtH = '/workspace/qm/test/at_components/remote_parking/at_remote_parking_startup.h';
  const scoreSource = scoreMatch(atFile, sourceFile, 'test-to-source', ['test_', 'ut_', 'at_']);
  const scoreAtH = scoreMatch(atFile, otherAtH, 'test-to-source', ['test_', 'ut_', 'at_']);
  assert(scoreSource > scoreAtH, `AT→source: source (${scoreSource}) >> AT header (${scoreAtH})`);
}

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
