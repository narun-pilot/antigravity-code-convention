import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export async function activate(context: vscode.ExtensionContext) {
    const commands = await vscode.commands.getCommands(true);
    const agCommands = commands.filter(c => c.toLowerCase().includes('antigravity') || c.toLowerCase().includes('agent') || c.toLowerCase().includes('ai'));
    const logPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'debug-commands.json');
    fs.writeFileSync(logPath, JSON.stringify(agCommands, null, 2));
}
