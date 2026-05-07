# FLIP — File-Linked Intelligent Pairing

VS Code extension to quickly switch between source and test files. Works out of the box with common conventions and is fully configurable for custom project structures.

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Cmd+Shift+T` / `Ctrl+Shift+T` | FLIP: Flip to Test/Source | Toggle between unit test and source file |
| `Cmd+Shift+A` / `Ctrl+Shift+A` | FLIP: Flip to Related File | Toggle between source and related file (e.g. acceptance test) |

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

Template-based mappings for related files (e.g. acceptance tests, e2e tests). Placeholders: `{name}` matches one path segment, last placeholder matches multiple segments. `searchPaths` limits the fuzzy search to specific glob patterns.

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

### Example: Ruby/RSpec

```jsonc
{
  "flip.pathMappings": [{ "source": "lib", "test": "spec" }],
  "flip.testFilePrefixes": [],
  "flip.testFileSuffixes": ["_spec"],
  "flip.javaStyle": false
}
```

### Example: Python/pytest

```jsonc
{
  "flip.pathMappings": [{ "source": "src", "test": "tests" }],
  "flip.testFilePrefixes": ["test_"],
  "flip.testFileSuffixes": [],
  "flip.javaStyle": false
}
```

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
