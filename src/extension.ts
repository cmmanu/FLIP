import * as vscode from 'vscode';
import { switchTestFile, switchRelatedFile } from './switcher';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('flip.switch', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }
      await switchTestFile(editor.document.uri);
    }),
    vscode.commands.registerCommand('flip.switchRelated', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }
      await switchRelatedFile(editor.document.uri);
    })
  );
}

export function deactivate() {}
