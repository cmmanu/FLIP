# FLIP — File-Linked Intelligent Pairing

VS Code extension to quickly switch between source and test files. Works out of the box with common conventions and is fully configurable for custom project structures.

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Cmd+Shift+T` / `Ctrl+Shift+T` | FLIP: Flip to Test/Source | Toggle between unit test and source file using deterministic candidate matching |
| `Cmd+Shift+A` / `Ctrl+Shift+A` | FLIP: Flip to Related File | Smart search with scoring — finds related files (e.g. acceptance tests) using template matching, fuzzy glob search, and multi-signal scoring |

## How It Works

### `Cmd+Shift+T` — Deterministic Flip

Generates exact candidate paths by combining configured path mappings with test file prefixes/suffixes. Tries each candidate in order, falling back to a workspace-wide glob search by filename if no exact path exists. Fast and predictable.

### `Cmd+Shift+A` — Smart Scored Search

Uses a multi-phase pipeline to find related files:

1. **Template matching** — applies `flip.relatedMappings` templates to resolve exact candidate paths
2. **Glob search** — searches within configured `searchPaths` for broader matches
3. **Fuzzy keyword search** — extracts keywords from the filename and searches for similar files
4. **Scoring** — ranks all results using six signals:
   - Structural path mirroring (parallel directory trees)
   - LCS-based path segment similarity
   - Core name match (stripped of test affixes)
   - Extension affinity (language-family compatibility)
   - Direction indicators (test vs. source directory)
   - Keyword word overlap

If the top result is clearly best (score gap > 20), it opens automatically. Otherwise a QuickPick shows the ranked candidates.

## Supported Patterns (Defaults)

- `test_` / `ut_` prefix — `src/modules/X/foo.cpp` ↔ `test/modules/X/test_foo.cpp`
- `_test` suffix — `foo.go` ↔ `foo_test.go`
- `.test.` / `.spec.` suffix — `app.ts` ↔ `app.test.ts`
- Java `Test` prefix/suffix — `Foo.java` ↔ `TestFoo.java` / `FooTest.java`
- Directory mirroring — `src/` ↔ `test/`, `src/main/java` ↔ `src/test/java`, `lib/` ↔ `test/`, etc.

## Configuration

All settings are under `flip.*` in VS Code settings.

### `flip.pathMappings`

Directory segment pairs for source ↔ test mirroring. Order matters — first match wins.

```jsonc
"flip.pathMappings": [
  { "source": "src/modules", "test": "test/modules" },
  { "source": "src/main/java", "test": "src/test/java" },
  { "source": "src/main/kotlin", "test": "src/test/kotlin" },
  { "source": "lib", "test": "test" },
  { "source": "src", "test": "__tests__" },
  { "source": "src", "test": "test" }
]
```

### `flip.testFilePrefixes` / `flip.testFileSuffixes`

Filename conventions that identify test files:

```jsonc
"flip.testFilePrefixes": ["test_", "ut_"],
"flip.testFileSuffixes": ["_test", ".test", ".spec"]
```

### `flip.javaStyle`

Enable `TestFoo` / `FooTest` detection (default: `true`).

### `flip.relatedMappings`

Template-based mappings for related files (e.g. acceptance tests, e2e tests) used by `Cmd+Shift+A`. Each mapping has:

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string` | Source path template with `{name}` (one segment) or `{path}` (multi-segment) placeholders |
| `test` | `string` | Test path template using the same placeholders |
| `filePrefix` | `string` | Filename prefix for related files (e.g. `at_`, `e2e_`) |
| `searchPaths` | `string[]` | Glob patterns that scope the fuzzy search to specific directories |

```jsonc
"flip.relatedMappings": [
  {
    "source": "components/{comp}/src/modules/{path}",
    "test": "test/at_components/{comp}/{path}",
    "filePrefix": "at_",
    "searchPaths": ["**/test/at_components/**"]
  },
  {
    "source": "components/{comp}/src",
    "test": "test/at_components/{comp}",
    "filePrefix": "at_",
    "searchPaths": ["**/test/at_components/**"]
  }
]
```

## Examples

### Ruby/RSpec

```jsonc
{
  "flip.pathMappings": [{ "source": "lib", "test": "spec" }],
  "flip.testFilePrefixes": [],
  "flip.testFileSuffixes": ["_spec"],
  "flip.javaStyle": false
}
```

### Python/pytest

```jsonc
{
  "flip.pathMappings": [{ "source": "src", "test": "tests" }],
  "flip.testFilePrefixes": ["test_"],
  "flip.testFileSuffixes": [],
  "flip.javaStyle": false
}
```

### Scoped smart search with `searchPaths` only

The simplest way to use `Cmd+Shift+A` is to provide only `searchPaths` — no templates needed. The fuzzy keyword search + scoring will find related files within those directories:

```jsonc
{
  "flip.relatedMappings": [
    {
      "searchPaths": ["**/integration/tests/**"]
    }
  ]
}
```

This makes `Cmd+Shift+A` search for related files only inside `integration/tests/`, using filename keywords and scoring to find the best match.

### Scoped smart search with full template mapping

For more precise matching, add `source`/`test` templates and a `filePrefix`. This enables exact candidate resolution in addition to fuzzy search:

```jsonc
{
  "flip.relatedMappings": [
    {
      "source": "src/{path}",
      "test": "integration/tests/{path}",
      "filePrefix": "test_",
      "searchPaths": ["**/integration/tests/**"]
    }
  ]
}
```

With this configuration, `Cmd+Shift+A` first tries exact template matching, then falls back to fuzzy search scoped to `integration/tests/`. For example:

- `src/services/auth.ts` → finds `integration/tests/services/test_auth.ts`

## Installation

```sh
npm install && npm run compile
npm run package
```

Then install via *Extensions → Install from VSIX…*

## Development

```sh
npm run watch    # compile on change
npm test         # run unit tests
```

Press `F5` in VS Code to launch an Extension Development Host.
