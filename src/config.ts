export interface PathMapping {
  source: string;
  test: string;
}

export interface RelatedMapping {
  source?: string;
  test?: string;
  filePrefix?: string;
  searchPaths?: string[];
}

export interface SwitcherConfig {
  pathMappings: PathMapping[];
  testFilePrefixes: string[];
  testFileSuffixes: string[];
  javaStyle: boolean;
  relatedMappings: RelatedMapping[];
}

export const defaultConfig: SwitcherConfig = {
  pathMappings: [
    { source: 'src/modules', test: 'test/modules' },
    { source: 'src/main/java', test: 'src/test/java' },
    { source: 'src/main/kotlin', test: 'src/test/kotlin' },
    { source: 'lib', test: 'test' },
    { source: 'src', test: '__tests__' },
    { source: 'src', test: 'test' },
  ],
  testFilePrefixes: ['test_', 'ut_'],
  testFileSuffixes: ['_test', '.test', '.spec'],
  javaStyle: true,
  relatedMappings: [
    {
      source: 'components/{comp}/src/modules/{path}',
      test: 'test/at_components/{comp}/{path}',
      filePrefix: 'at_',
      searchPaths: ['**/test/at_components/**'],
    },
    {
      source: 'components/{comp}/src',
      test: 'test/at_components/{comp}',
      filePrefix: 'at_',
      searchPaths: ['**/test/at_components/**'],
    },
  ],
};

/**
 * Parse a template like "components/{comp}/src/modules/{path}" into a regex
 * that captures named groups. {name} matches one segment, {path} matches one or more.
 */
export function templateToRegex(template: string): RegExp {
  let pattern = '';
  let i = 0;
  while (i < template.length) {
    if (template[i] === '{') {
      const end = template.indexOf('}', i);
      if (end === -1) break;
      const name = template.slice(i + 1, end);
      // Use greedy multi-segment for last placeholder, single segment otherwise
      if (end === template.length - 1 || template[end + 1] === undefined) {
        pattern += `(?<${name}>.+)`;
      } else {
        pattern += `(?<${name}>[^/]+)`;
      }
      i = end + 1;
    } else if ('/.*+?^${}()|[]\\'.includes(template[i]) && template[i] !== '{') {
      pattern += '\\' + template[i];
      i++;
    } else {
      pattern += template[i];
      i++;
    }
  }
  return new RegExp(pattern);
}

/**
 * Apply captured groups to a template string.
 * E.g. template "test/at_components/{comp}/{path}" with groups {comp: "pdc", path: "pdc"}
 * → "test/at_components/pdc/pdc"
 */
export function applyTemplate(template: string, groups: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => groups[name] || '');
}
