import * as vscode from 'vscode';
import * as path from 'path';
import { getCandidates, getRelatedSearchInfo } from './candidates';
import { SwitcherConfig, defaultConfig } from './config';
import { scoreMatch, buildFuzzyGlobs } from './scoring';

export { getCandidates, getRelatedSearchInfo };

function getConfig(): SwitcherConfig {
  const cfg = vscode.workspace.getConfiguration('flip');
  return {
    pathMappings: cfg.get('pathMappings', defaultConfig.pathMappings),
    testFilePrefixes: cfg.get('testFilePrefixes', defaultConfig.testFilePrefixes),
    testFileSuffixes: cfg.get('testFileSuffixes', defaultConfig.testFileSuffixes),
    javaStyle: cfg.get('javaStyle', defaultConfig.javaStyle),
    relatedMappings: cfg.get('relatedMappings', defaultConfig.relatedMappings),
  };
}

export async function switchTestFile(uri: vscode.Uri): Promise<void> {
  const filePath = uri.fsPath;
  const config = getConfig();
  const candidates = getCandidates(filePath, config);

  if (candidates.length === 0) {
    vscode.window.showWarningMessage(
      'Could not determine a test/source counterpart for this file.'
    );
    return;
  }

  // Try candidates in priority order
  for (const candidate of candidates) {
    try {
      const candidateUri = vscode.Uri.file(candidate);
      await vscode.workspace.fs.stat(candidateUri);
      const doc = await vscode.workspace.openTextDocument(candidateUri);
      await vscode.window.showTextDocument(doc);
      return;
    } catch {}
  }

  // Fallback: glob search
  const basenames = [...new Set(candidates.map((c) => path.basename(c)))];
  for (const basename of basenames) {
    const globResults = await vscode.workspace.findFiles(
      `**/${basename}`,
      '**/node_modules/**',
      10
    );

    if (globResults.length === 1) {
      const doc = await vscode.workspace.openTextDocument(globResults[0]);
      await vscode.window.showTextDocument(doc);
      return;
    }

    if (globResults.length > 1) {
      const items = globResults.map((u) => ({
        label: vscode.workspace.asRelativePath(u),
        uri: u,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Multiple matches found. Select the target file:',
      });
      if (picked) {
        const doc = await vscode.workspace.openTextDocument(picked.uri);
        await vscode.window.showTextDocument(doc);
      }
      return;
    }
  }

  vscode.window.showWarningMessage(
    `No matching file found. Searched for: ${basenames.join(', ')}`
  );
}

export async function switchRelatedFile(uri: vscode.Uri): Promise<void> {
  const filePath = uri.fsPath;
  const config = getConfig();
  const relatedInfo = getRelatedSearchInfo(filePath, config);
  const allPrefixes = config.testFilePrefixes.concat(
    config.relatedMappings.filter(m => m.filePrefix).map(m => m.filePrefix!)
  );

  // Collect configured searchPaths from related mappings
  const atSearchPaths = config.relatedMappings
    .filter(m => m.searchPaths && m.searchPaths.length > 0)
    .flatMap(m => m.searchPaths!);

  // If no template-based matching and no searchPaths, nothing to do
  if (!relatedInfo && atSearchPaths.length === 0) {
    vscode.window.showWarningMessage(
      'Could not determine related file. Configure flip.relatedMappings with source/test templates or searchPaths.'
    );
    return;
  }

  // Determine direction: use template match if available,
  // otherwise check if current file is inside a configured related search path
  let direction: 'source-to-test' | 'test-to-source';
  if (relatedInfo) {
    direction = relatedInfo.direction;
  } else {
    const currentRel = vscode.workspace.asRelativePath(uri);
    const inAtPath = atSearchPaths.some(sp => {
      const seg = sp.replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
      return currentRel.includes(seg) || filePath.includes(seg);
    });
    direction = inAtPath ? 'test-to-source' : 'source-to-test';
  }

  // Build exclusion patterns for test directories (used when searching for source)
  const testExcludeGlobs = [
    '**/node_modules/**',
    ...atSearchPaths,
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '**/spec/**',
  ];
  const testExcludePattern = `{${testExcludeGlobs.join(',')}}`;

  const allResults: vscode.Uri[] = [];

  // Phase 1: Exact candidates from template matching
  if (relatedInfo) {
    for (const candidate of relatedInfo.exactCandidates) {
      try {
        const candidateUri = vscode.Uri.file(candidate);
        await vscode.workspace.fs.stat(candidateUri);
        allResults.push(candidateUri);
      } catch {}
    }

    // Phase 2: Glob search from template (already direction-aware)
    for (const glob of relatedInfo.globs) {
      // When looking for source, exclude test directories at search level
      const exclude = direction === 'test-to-source' ? testExcludePattern : '**/node_modules/**';
      const results = await vscode.workspace.findFiles(glob, exclude, 50);
      allResults.push(...results);
    }
  }

  // Phase 3: Fuzzy search
  const fuzzyGlobs = buildFuzzyGlobs(filePath, allPrefixes);
  if (direction === 'source-to-test' && atSearchPaths.length > 0) {
    // Source→AT: scope search to AT directories only
    for (const searchPath of atSearchPaths) {
      for (const fuzzyGlob of fuzzyGlobs) {
        const basePart = fuzzyGlob.replace(/^\*\*\//, '');
        const pathBase = searchPath.replace(/\/?\*\*\/?$/, '');
        const results = await vscode.workspace.findFiles(
          `${pathBase}/**/${basePart}`, '**/node_modules/**', 30
        );
        allResults.push(...results);
      }
    }
  } else if (direction === 'test-to-source') {
    // AT→source: exclude all test directories from search
    for (const glob of fuzzyGlobs) {
      const results = await vscode.workspace.findFiles(glob, testExcludePattern, 30);
      allResults.push(...results);
    }
  }

  // Deduplicate and exclude self
  const seen = new Set<string>();
  seen.add(filePath);
  const unique = allResults.filter(u => {
    if (seen.has(u.fsPath)) return false;
    seen.add(u.fsPath);
    return true;
  });

  // Post-filter: when going to source, strip any remaining test files
  // (e.g. exact candidates that were in a test dir, or false positives)
  let filtered = unique;
  if (direction === 'test-to-source') {
    const base = (u: vscode.Uri) => path.basename(u.fsPath, path.extname(u.fsPath));
    const withoutTests = unique.filter(u => {
      const b = base(u);
      if (allPrefixes.some(p => b.toLowerCase().startsWith(p.toLowerCase()))) return false;
      if (/_test$|\.test$|\.spec$|Test$|_spec$/.test(b)) return false;
      return true;
    });
    filtered = withoutTests.length > 0 ? withoutTests : unique;
  } else if (direction === 'source-to-test' && atSearchPaths.length > 0) {
    // Source→AT: keep only files within AT search paths
    const inAtPath = (u: vscode.Uri) => {
      const rel = vscode.workspace.asRelativePath(u);
      return atSearchPaths.some(sp => {
        const seg = sp.replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
        return rel.includes(seg) || u.fsPath.includes(seg);
      });
    };
    const onlyAt = unique.filter(inAtPath);
    filtered = onlyAt.length > 0 ? onlyAt : unique;
  }

  const scored = filtered
    .map(u => ({ uri: u, score: scoreMatch(filePath, u.fsPath, direction, allPrefixes) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    vscode.window.showWarningMessage(
      `No related file found for "${relatedInfo?.moduleName || 'unknown'}".`
    );
    return;
  }

  // Auto-open if single result or top result clearly best
  if (scored.length === 1 || (scored[0].score - scored[1].score) > 20) {
    const doc = await vscode.workspace.openTextDocument(scored[0].uri);
    await vscode.window.showTextDocument(doc);
    return;
  }

  // Multiple good candidates — show QuickPick ranked by score
  const top = scored.slice(0, 15);
  const items = top.map(s => ({
    label: path.basename(s.uri.fsPath),
    description: vscode.workspace.asRelativePath(s.uri),
    detail: `score: ${s.score}`,
    uri: s.uri,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select related file for "${relatedInfo?.moduleName || 'module'}":`,
  });
  if (picked) {
    const doc = await vscode.workspace.openTextDocument(picked.uri);
    await vscode.window.showTextDocument(doc);
  }
}
