# Bazel Test Switcher

VS Code extension to quickly switch between source and test files. Works out of the box with common conventions and is fully configurable for custom project structures.

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Cmd+Shift+T` / `Ctrl+Shift+T` | Switch Test/Source | Toggle between unit test and source file |
| `Cmd+Shift+A` / `Ctrl+Shift+A` | Switch to Acceptance Test | Toggle between source and acceptance test |

## Supported Patterns (Defaults)

- `test_` / `ut_` prefix — `src/modules/X/foo.cpp` ↔ `test/modules/X/test_foo.cpp`
- `_test` suffix — `foo.go` ↔ `foo_test.go`
- `.test.` / `.spec.` suffix — `app.ts` ↔ `app.test.ts`
- Java `Test` prefix/suffix — `Foo.java` ↔ `TestFoo.java` / `FooTest.java`
- Directory mirroring — `src/` ↔ `test/`, `src/main/java` ↔ `src/test/java`, `lib/` ↔ `test/`, etc.

## Configuration

All settings are under `bazelTestSwitcher.*` in VS Code settings.

### `pathMappings`

Directory segment pairs for source ↔ test mirroring. First match wins.

```jsonc
"bazelTestSwitcher.pathMappings": [
  { "source": "src/modules", "test": "test/modules" },
  { "source": "src/main/java", "test": "src/test/java" },
  { "source": "src/main/kotlin", "test": "src/test/kotlin" },
  { "source": "lib", "test": "test" },
  { "source": "src", "test": "__tests__" },
  { "source": "src", "test": "test" }
]
```

### `testFilePrefixes` / `testFileSuffixes`

Filename conventions that identify test files:

```jsonc
"bazelTestSwitcher.testFilePrefixes": ["test_", "ut_"],
"bazelTestSwitcher.testFileSuffixes": ["_test", ".test", ".spec"]
```

### `javaStyle`

Enable `TestFoo` / `FooTest` detection (default: `true`).

### `atMappings`

Template-based mappings for acceptance tests. Placeholders: `{name}` matches one path segment, last placeholder matches multiple segments.

```jsonc
"bazelTestSwitcher.atMappings": [
  {
    "source": "components/{comp}/src/modules/{path}",
    "test": "test/at_components/{comp}/{path}",
    "filePrefix": "at_"
  },
  {
    "source": "components/{comp}/src",
    "test": "test/at_components/{comp}",
    "filePrefix": "at_"
  }
]
```

### Example: Ruby/RSpec

```jsonc
{
  "bazelTestSwitcher.pathMappings": [{ "source": "lib", "test": "spec" }],
  "bazelTestSwitcher.testFilePrefixes": [],
  "bazelTestSwitcher.testFileSuffixes": ["_spec"],
  "bazelTestSwitcher.javaStyle": false
}
```

### Example: Python/pytest

```jsonc
{
  "bazelTestSwitcher.pathMappings": [{ "source": "src", "test": "tests" }],
  "bazelTestSwitcher.testFilePrefixes": ["test_"],
  "bazelTestSwitcher.testFileSuffixes": [],
  "bazelTestSwitcher.javaStyle": false
}
```

## Installation

```sh
npm install && npm run compile
npx @vscode/vsce package
```

Then install via *Extensions → Install from VSIX…*

## Development

```sh
npm run watch    # compile on change
npm test         # run unit tests
```

Press `F5` in VS Code to launch an Extension Development Host.
