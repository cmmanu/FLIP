import * as vscode from 'vscode';
import { switchTestFile, switchAtFile } from './switcher';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('bazelTestSwitcher.switch', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }
      await switchTestFile(editor.document.uri);
    }),
    vscode.commands.registerCommand('bazelTestSwitcher.switchAt', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }
      await switchAtFile(editor.document.uri);
    })
  );
}

export function deactivate() {}
