import { getCandidates, getAtSearchInfo } from './candidates';

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

// --- Source -> Test (parkmaster-style) ---
console.log('Source -> Test (Bazel directory mirror):');

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

// --- Test -> Source (parkmaster-style) ---
console.log('\nTest -> Source (Bazel directory mirror):');

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

// --- AT: Source -> AT ---
console.log('\nAT: Source -> Acceptance Test:');

{
  const info = getAtSearchInfo('/workspace/qm/components/pdc/src/modules/pdc/pdc.cpp');
  assert(info !== undefined, 'getAtSearchInfo returns result for pdc source');
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
  const info = getAtSearchInfo('/workspace/qm/components/pdc/src/modules/auto_pdc/auto_pdc.cpp');
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
  const info = getAtSearchInfo('/workspace/qm/test/at_components/pdc/pdc/at_pdc.h');
  assert(info !== undefined, 'getAtSearchInfo returns result for AT file');
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
  const info = getAtSearchInfo('/workspace/qm/test/at_components/remote_parking/test_remote_parking_aborts.cpp');
  assert(info !== undefined, 'getAtSearchInfo returns result for remote_parking AT at comp root');
  // AT at component root: srcBase = "remote_parking_aborts", comp = "remote_parking"
  // Should strip comp prefix → look in modules/aborts/
  assert(
    info!.globs.some(g => g.includes('modules/aborts/**') || g.includes('modules/**/aborts')),
    'AT at comp root -> glob searches aborts module'
  );
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/components/remote_parking/src/modules/aborts/aborts.cpp',
    'test_remote_parking_aborts.cpp -> modules/aborts/aborts.cpp'
  );
}

// --- AT at component root (subdir case still works) ---
{
  const info = getAtSearchInfo('/workspace/qm/test/at_components/remote_parking/center_locking_requester/at_center_locking_requester.h');
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
  const info = getAtSearchInfo('/workspace/qm/components/pdc/src/swc_pdc.cpp');
  assert(info !== undefined, 'getAtSearchInfo returns result for swc_pdc.cpp');
  assert(
    info!.globs.some(g => g.includes('at_components/pdc/**/at_*')),
    'swc_pdc.cpp -> glob searches all AT files under pdc'
  );
  assert(info!.moduleName === 'pdc', 'module name is pdc');
}

// --- AT: Source (nested module) -> AT at component root ---
console.log('\nAT: Source module -> AT at component root:');

{
  const info = getAtSearchInfo('/workspace/qm/components/remote_parking/src/modules/aborts/partial_network_timeout.cpp');
  assert(info !== undefined, 'getAtSearchInfo returns result for aborts source');
  // Should search at component root level too
  assert(
    info!.globs.some(g => g.includes('at_components/remote_parking/at_*aborts*')),
    'aborts source -> glob searches AT root for *aborts* files'
  );
  assert(
    info!.globs.some(g => g.includes('at_components/remote_parking/at_*partial_network_timeout*')),
    'aborts source -> glob searches AT root for *partial_network_timeout* files'
  );
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/test/at_components/remote_parking/at_remote_parking_aborts.h',
    'aborts source -> exact candidate includes at_remote_parking_aborts.h'
  );
}

// --- AT: UT test -> AT cross-reference ---
console.log('\nAT: Unit test -> Acceptance Test:');

{
  const info = getAtSearchInfo('/workspace/qm/components/pdc/test/modules/pdc/test_pdc.cpp');
  assert(info !== undefined, 'getAtSearchInfo returns result for UT test file');
  assertIncludes(
    info!.exactCandidates,
    '/workspace/qm/test/at_components/pdc/pdc/at_pdc.h',
    'UT test_pdc.cpp -> AT at_pdc.h'
  );
}

// --- AT: unrecognized file ---
console.log('\nAT: Unrecognized file:');

{
  const info = getAtSearchInfo('/workspace/some/random/file.cpp');
  assert(info === undefined, 'getAtSearchInfo returns undefined for unrecognized path');
}

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
