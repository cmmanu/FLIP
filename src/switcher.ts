import * as vscode from 'vscode';
import * as path from 'path';
import { getCandidates, getAtSearchInfo } from './candidates';

export { getCandidates, getAtSearchInfo };

/**
 * Bazel test/source switcher.
 *
 * Supports the following conventions (ordered by priority):
 *
 * 1. Bazel C++ directory mirror (parkmaster-style):
 *    src/modules/X/X.cpp  <->  test/modules/X/test_X.cpp
 *    src/modules/X/X.h    <->  test/modules/X/ut_X.h
 *
 * 2. Flat shared/utils test directory:
 *    qm/shared/foo/bar.cpp  <->  qm/shared/test/test_bar.cpp
 *    qm/utils/src/foo.cpp   <->  qm/utils/test/test_foo.cpp
 *
 * 3. test_ prefix in same directory:
 *    foo.cpp  <->  test_foo.cpp
 *
 * 4. _test suffix (Go/C++):
 *    foo.go  <->  foo_test.go
 *
 * 5. .test. / .spec. suffix (JS/TS):
 *    foo.ts  <->  foo.test.ts / foo.spec.ts
 *
 * 6. Java Test prefix/suffix:
 *    Foo.java  <->  TestFoo.java / FooTest.java
 */

export async function switchTestFile(uri: vscode.Uri): Promise<void> {
  const filePath = uri.fsPath;
  const candidates = getCandidates(filePath);

  if (candidates.length === 0) {
    vscode.window.showWarningMessage(
      'Could not determine a test/source counterpart for this file.'
    );
    return;
  }

  // Try to find an existing file among candidates (in order of priority)
  for (const candidate of candidates) {
    try {
      const candidateUri = vscode.Uri.file(candidate);
      await vscode.workspace.fs.stat(candidateUri);
      const doc = await vscode.workspace.openTextDocument(candidateUri);
      await vscode.window.showTextDocument(doc);
      return;
    } catch {
      // File doesn't exist, try next candidate
    }
  }

  // Fallback: glob search for the most likely basename across the workspace
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

export async function switchAtFile(uri: vscode.Uri): Promise<void> {
  const filePath = uri.fsPath;
  const atInfo = getAtSearchInfo(filePath);

  if (!atInfo) {
    vscode.window.showWarningMessage(
      'Could not determine AT counterpart. File must be inside components/*/src/modules/ or test/at_components/.'
    );
    return;
  }

  // Determine if we're going AT->Source (want single file) or Source->AT (want suggestions)
  const isAtFile = filePath.includes('/test/at_components/');

  if (isAtFile) {
    // AT -> Source: try exact candidates first, open the first that exists
    for (const candidate of atInfo.exactCandidates) {
      try {
        const candidateUri = vscode.Uri.file(candidate);
        await vscode.workspace.fs.stat(candidateUri);
        const doc = await vscode.workspace.openTextDocument(candidateUri);
        await vscode.window.showTextDocument(doc);
        return;
      } catch {
        // File doesn't exist
      }
    }
    // Fall through to glob search if exact candidates don't exist
  }

  // Glob search to find all matching AT/source files
  const allResults: vscode.Uri[] = [];
  for (const glob of atInfo.globs) {
    const results = await vscode.workspace.findFiles(glob, '**/node_modules/**', 50);
    allResults.push(...results);
  }

  // Deduplicate and exclude current file
  const seen = new Set<string>();
  seen.add(filePath); // Don't show the current file in results
  const uniqueResults = allResults.filter((u) => {
    const key = u.fsPath;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueResults.length === 0) {
    // Try exact candidates as last resort
    for (const candidate of atInfo.exactCandidates) {
      try {
        const candidateUri = vscode.Uri.file(candidate);
        await vscode.workspace.fs.stat(candidateUri);
        const doc = await vscode.workspace.openTextDocument(candidateUri);
        await vscode.window.showTextDocument(doc);
        return;
      } catch {
        // Not found
      }
    }
    vscode.window.showWarningMessage(
      `No AT files found for module "${atInfo.moduleName || 'unknown'}".`
    );
    return;
  }

  if (uniqueResults.length === 1) {
    const doc = await vscode.workspace.openTextDocument(uniqueResults[0]);
    await vscode.window.showTextDocument(doc);
    return;
  }

  // Multiple results — show QuickPick
  const items = uniqueResults.map((u) => ({
    label: path.basename(u.fsPath),
    description: vscode.workspace.asRelativePath(u),
    uri: u,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `AT files for "${atInfo.moduleName || 'module'}" — select one to open:`,
  });
  if (picked) {
    const doc = await vscode.workspace.openTextDocument(picked.uri);
    await vscode.window.showTextDocument(doc);
  }
}
