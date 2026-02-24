import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// --- Manifest types for tracking installed skill files ---
interface InstalledSkillManifest {
    installedPaths: string[];
    extensionVersion: string;
}

const MANIFEST_DIR = path.join(os.homedir(), '.antigravity-code-review');
const MANIFEST_FILE = path.join(MANIFEST_DIR, 'installed-skills.json');

/**
 * Reads the current manifest of installed skill file locations.
 */
function getManifest(): InstalledSkillManifest {
    try {
        if (fs.existsSync(MANIFEST_FILE)) {
            return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
        }
    } catch {
        // Corrupted manifest, start fresh
    }
    return { installedPaths: [], extensionVersion: '' };
}

/**
 * Saves the manifest to disk.
 */
function setManifest(manifest: InstalledSkillManifest): void {
    if (!fs.existsSync(MANIFEST_DIR)) {
        fs.mkdirSync(MANIFEST_DIR, { recursive: true });
    }
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

/**
 * Installs (copies) SKILL.md and code-review.md from the extension's
 * resources/ folder into the workspace's .agents/skills/code-review/ directory.
 * Records the path in the manifest for uninstall cleanup.
 */
function installSkillFiles(extensionPath: string, workspacePath: string, extensionVersion: string): void {
    const srcSkill = path.join(extensionPath, 'resources', 'SKILL.md');
    const srcCodeReview = path.join(extensionPath, 'resources', 'code-review.md');
    const destDir = path.join(workspacePath, '.agents', 'skills', 'code-review');

    // Create destination directory
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy SKILL.md
    if (fs.existsSync(srcSkill)) {
        fs.copyFileSync(srcSkill, path.join(destDir, 'SKILL.md'));
        console.log(`[Antigravity Code Review] Installed SKILL.md → ${destDir}`);
    }

    // Copy code-review.md
    if (fs.existsSync(srcCodeReview)) {
        fs.copyFileSync(srcCodeReview, path.join(destDir, 'code-review.md'));
        console.log(`[Antigravity Code Review] Installed code-review.md → ${destDir}`);
    }

    // Update the manifest
    const manifest = getManifest();
    if (!manifest.installedPaths.includes(destDir)) {
        manifest.installedPaths.push(destDir);
    }
    manifest.extensionVersion = extensionVersion;
    setManifest(manifest);
}

/**
 * Removes previously installed SKILL.md and code-review.md from the workspace.
 * Called before re-installing to ensure stale files are cleaned up.
 */
function removeOldSkillFiles(workspacePath: string): void {
    const destDir = path.join(workspacePath, '.agents', 'skills', 'code-review');
    const skillMd = path.join(destDir, 'SKILL.md');
    const codeReviewMd = path.join(destDir, 'code-review.md');

    if (fs.existsSync(skillMd)) {
        fs.unlinkSync(skillMd);
        console.log(`[Antigravity Code Review] Removed old SKILL.md from ${destDir}`);
    }
    if (fs.existsSync(codeReviewMd)) {
        fs.unlinkSync(codeReviewMd);
        console.log(`[Antigravity Code Review] Removed old code-review.md from ${destDir}`);
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Code Review extension is now active!');

    // --- Read configuration ---
    const getConfig = () => vscode.workspace.getConfiguration('antigravityCodeReview');

    // --- Install / Update skill files into workspace ---
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const extensionVersion = (context.extension.packageJSON as { version: string }).version || '0.0.0';

    if (workspaceFolder && getConfig().get<boolean>('autoInstallSkills', true)) {
        const manifest = getManifest();
        const destDir = path.join(workspaceFolder, '.agents', 'skills', 'code-review');
        const skillExists = fs.existsSync(path.join(destDir, 'SKILL.md'));
        const needsInstall = !skillExists || manifest.extensionVersion !== extensionVersion;

        if (needsInstall) {
            // Remove old files first, then copy fresh ones from the extension bundle
            removeOldSkillFiles(workspaceFolder);
            installSkillFiles(context.extensionPath, workspaceFolder, extensionVersion);
            console.log(`[Antigravity Code Review] Skill files installed/updated (v${extensionVersion})`);
        } else {
            console.log(`[Antigravity Code Review] Skill files already up-to-date (v${extensionVersion})`);
        }
    } else if (workspaceFolder) {
        console.log('[Antigravity Code Review] Auto-install disabled by user setting.');
    }



    // --- Helper Functions ---

    const getWorkspacePath = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const isGitRepo = (cwd: string) => {
        try {
            execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    };

    /**
     * Returns the absolute paths to the skill resource files.
     * The built-in style guide is always used.
     * If additionalRulesPath is configured, it is loaded ON TOP of the defaults.
     * Points to the WORKSPACE copies (not the extension install dir)
     * so paths remain valid only while the extension is installed.
     */
    const getSkillPaths = () => {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const skillDir = ws
            ? path.join(ws, '.agents', 'skills', 'code-review')
            : path.join(context.extensionPath, 'resources');

        const additionalRules = getConfig().get<string>('additionalRulesPath', '');
        return {
            skillPath: path.join(skillDir, 'SKILL.md'),
            styleGuidePath: path.join(skillDir, 'code-review.md'),
            additionalRulesPath: additionalRules && fs.existsSync(additionalRules) ? additionalRules : '',
        };
    };

    /**
     * Reads the SKILL.md content (from workspace copy or extension fallback).
     */
    const getSkillContent = (): string => {
        try {
            const { skillPath } = getSkillPaths();
            if (fs.existsSync(skillPath)) {
                return fs.readFileSync(skillPath, 'utf8');
            }
            console.warn('SKILL.md not found at:', skillPath);
            return '';
        } catch (e) {
            console.error('Failed to read SKILL.md', e);
            return '';
        }
    };

    /**
     * Reads the code-review.md content (from workspace copy or extension fallback).
     */
    const getStyleGuideContent = (): string => {
        try {
            const { styleGuidePath } = getSkillPaths();
            if (fs.existsSync(styleGuidePath)) {
                return fs.readFileSync(styleGuidePath, 'utf8');
            }
            console.warn('code-review.md not found at:', styleGuidePath);
            return '';
        } catch (e) {
            console.error('Failed to read code-review.md', e);
            return '';
        }
    };

    /**
     * Builds the review focus instructions based on user settings.
     */
    const getReviewFocusInstructions = (): string => {
        const focusAreas = getConfig().get<string[]>('reviewFocus', [
            'xss-prevention', 'naming-conventions', 'code-complexity', 'security'
        ]);
        if (!focusAreas.length) { return ''; }

        const focusLabels: Record<string, string> = {
            'xss-prevention': 'XSS Prevention (template injection, unsafe innerHTML, unescaped output)',
            'naming-conventions': 'Naming Conventions (snake_case, CamelCase, function verb prefixes)',
            'code-complexity': 'Code Complexity (cyclomatic complexity, deep nesting, long functions)',
            'security': 'General Security (SQL injection, CSRF, auth issues)',
            'performance': 'Performance (N+1 queries, memory leaks, unnecessary re-renders)',
            'accessibility': 'Accessibility (ARIA labels, semantic HTML, keyboard navigation)',
            'documentation': 'Documentation (JSDoc/docstrings, inline comments, README)',
            'error-handling': 'Error Handling (try/catch coverage, graceful degradation)',
            'test-coverage': 'Test Coverage (missing tests, edge cases, test quality)'
        };

        let instructions = '\n### Review Focus Areas\n';
        instructions += 'Prioritize these areas during review:\n';
        focusAreas.forEach((area, i) => {
            instructions += `${i + 1}. **${focusLabels[area] || area}**\n`;
        });
        return instructions + '\n';
    };

    /**
     * Builds the severity threshold instruction.
     */
    const getSeverityInstruction = (): string => {
        const threshold = getConfig().get<string>('severityThreshold', 'low');
        const levels = ['info', 'low', 'medium', 'high', 'critical'];
        const idx = levels.indexOf(threshold);
        if (idx <= 0) { return ''; }
        return `\n> **Severity Filter**: Only report issues of **${threshold}** severity or above. Omit findings below this level.\n\n`;
    };

    /**
     * Builds the skill reference block that gets appended to the review request file.
     * References the resource files by path instead of inlining the full content.
     * Includes review focus, severity instructions, and optional additional rules.
     */
    const getEmbeddedSkillInstructions = (): string => {
        const { skillPath, styleGuidePath, additionalRulesPath } = getSkillPaths();

        let instructions = '\n## AI Agent Skill References\n';
        instructions += '> **IMPORTANT**: You MUST read and follow the skill files below as your AI Agent Skill for this code review.\n\n';

        if (fs.existsSync(skillPath)) {
            instructions += `### Skill Instructions\n`;
            instructions += `Read the skill file at: \`${skillPath}\`\n\n`;
        }
        if (fs.existsSync(styleGuidePath)) {
            instructions += `### Morakot Coding Style Guide (Built-in)\n`;
            instructions += `Read the style guide at: \`${styleGuidePath}\`\n\n`;
        }
        if (additionalRulesPath) {
            instructions += `### Additional Rules (Team/Project)\n`;
            instructions += `> These rules are applied **on top of** the built-in Morakot conventions above. They do NOT replace them.\n\n`;
            instructions += `Read the additional rules at: \`${additionalRulesPath}\`\n\n`;
        }

        instructions += getReviewFocusInstructions();
        instructions += getSeverityInstruction();

        return instructions;
    };

    /**
     * Builds the prompt text that is sent to the AI agent.
     * References the SKILL.md and code-review.md by file path
     * so the agent reads them directly instead of receiving inline content.
     */
    const buildAgentPrompt = (): string => {
        const { skillPath, styleGuidePath, additionalRulesPath } = getSkillPaths();

        let prompt = 'Please perform the code review based on code-review-request.md.\n\n';
        prompt += 'You MUST read and follow these files as your AI Agent Skill:\n\n';
        prompt += `1. **Skill Instructions (SKILL.md)**: \`${skillPath}\`\n`;
        prompt += `2. **Morakot Style Guide (code-review.md)**: \`${styleGuidePath}\`\n`;
        if (additionalRulesPath) {
            prompt += `3. **Additional Rules**: \`${additionalRulesPath}\` (applied on top of the built-in rules)\n`;
        }
        prompt += '\nRead all files FIRST, then perform the code review according to their instructions.\n';

        return prompt;
    };

    const outputChannel = vscode.window.createOutputChannel("Antigravity Code Review");

    const createReviewRequestFile = async (content: string, cwd: string) => {
        const reviewFilePath = path.join(cwd, 'code-review-request.md');
        const fullContent = content + "\n\n---" + getEmbeddedSkillInstructions();
        
        fs.writeFileSync(reviewFilePath, fullContent);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(reviewFilePath));
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
        
        // --- AUTO-PROMPT LOGIC ---
        const prompt = buildAgentPrompt();
        outputChannel.appendLine(`Starting auto-trigger for prompt: "${prompt}"`);
        
        async function tryCommands() {
            const configs = [
                // Priority A: Direct Text Interaction (Discovered from available-commands.json)
                { id: 'antigravity.sendTextToChat', args: [prompt] },
                { id: 'antigravity.sendPromptToAgentPanel', args: [prompt] },
                
                // Priority B: Sidebar/Panel Openers (targeting specific Antigravity views)
                { id: 'antigravity.agentSidePanel.open', args: [] },
                { id: 'antigravity.agentPanel.open', args: [] },
                { id: 'antigravity.toggleChatFocus', args: [] },
                
                // Priority C: Prioritized Openers with parameters
                { id: 'antigravity.prioritized.chat.open', args: { query: prompt, target: 'sidebar', submit: true } },
                { id: 'antigravity.prioritized.chat.open', args: { prompt: prompt, autoSubmit: true } },
                
                // Priority D: Standard Workbench Actions
                { id: 'workbench.action.chat.open', args: [{ query: prompt }] },
                { id: 'workbench.action.chat.send', args: [{ query: prompt }] },
                
                // Priority E: Agent/AskAI Variants
                { id: 'antigravity.askAI', args: { query: prompt, submit: true } },
                { id: 'antigravity.agent.submit', args: { prompt: prompt } },
                { id: 'cascades.askAI', args: { query: prompt, submit: true } }
            ];

            let lastMatched = false;
            for (const config of configs) {
                try {
                    outputChannel.appendLine(`Attempting: ${config.id} with ${JSON.stringify(config.args)}`);
                    // Use spreading for multiple args if config.args is an array, otherwise wrap it
                    const args = Array.isArray(config.args) ? config.args : [config.args];
                    await vscode.commands.executeCommand(config.id, ...args);
                    outputChannel.appendLine(`SUCCESS: ${config.id}`);
                    lastMatched = true;
                    
                    // If we just opened/focused, we might want to continue to the "send" commands
                    if (config.id.includes('focus') || config.id.includes('open') || config.id.includes('toggle')) {
                        // Special case: if we just called an opener, wait a bit before trying to send
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue; 
                    }
                    return true;
                } catch (e: any) {
                    outputChannel.appendLine(`FAILED: ${config.id} - ${e.message}`);
                }
            }
            return lastMatched;
        }

        const success = await tryCommands();
        if (!success) {
            outputChannel.show();
            vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(
                'Auto-trigger failed. Details in Output channel. Prompt copied to clipboard; please paste it into the Sidebar Chat.',
                'Ok'
            );
        } else {
            vscode.window.showInformationMessage('Review request submitted to Antigravity AI Agent. The request file will be auto-deleted shortly.');
        }

        // Auto-cleanup after 2 minutes to keep the workspace clean
        setTimeout(async () => {
            try {
                const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
                for (const tab of tabs) {
                    if (tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === reviewFilePath) {
                        await vscode.window.tabGroups.close(tab);
                    }
                }
                if (fs.existsSync(reviewFilePath)) {
                    fs.unlinkSync(reviewFilePath);
                    outputChannel.appendLine(`[Cleanup] Auto-deleted ${reviewFilePath}`);
                }
            } catch (e) {
                console.error('Failed to auto-cleanup review file', e);
            }
        }, 120000); // 2 minutes
    };

    // --- Commands ---

    // 1. Review All Changes
    let reviewChanges = vscode.commands.registerCommand('antigravity.reviewChanges', async () => {
        const cwd = getWorkspacePath();
        if (!cwd) return vscode.window.showErrorMessage('No workspace folder open.');

        if (!isGitRepo(cwd)) {
            const init = await vscode.window.showErrorMessage('Not a Git repository.', 'Initialize Git');
            if (init === 'Initialize Git') execSync('git init', { cwd });
            return;
        }

        try {
            const headSha = execSync('git rev-parse HEAD', { cwd }).toString().trim();
            const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim();
            // Determine base for diff: 'auto' uses current branch, otherwise use configured value
            const configuredBase = getConfig().get<string>('diffBaseBranch', 'auto');
            let baseSha: string;
            if (configuredBase === 'auto') {
                // Auto-detect: use the current branch the dev is working on
                // Compare against the remote tracking branch, or fallback to HEAD~1
                const trackingBranch = `origin/${branch}`;
                try {
                    execSync(`git rev-parse ${trackingBranch}`, { cwd, stdio: 'ignore' });
                    baseSha = trackingBranch;
                } catch {
                    try { execSync('git rev-parse HEAD~1', { cwd, stdio: 'ignore' }); baseSha = 'HEAD~1'; } catch { baseSha = headSha; }
                }
            } else {
                baseSha = configuredBase;
                try { execSync(`git rev-parse ${configuredBase}`, { cwd, stdio: 'ignore' }); } catch {
                    try { execSync('git rev-parse HEAD~1', { cwd, stdio: 'ignore' }); baseSha = 'HEAD~1'; } catch { baseSha = headSha; }
                }
            }

            const what = await vscode.window.showInputBox({ 
                prompt: 'What was implemented?', 
                placeHolder: 'e.g., Added logic for XSS prevention in user forms',
                ignoreFocusOut: true 
            });
            if (what === undefined) return;

            const reviewRequest = `
# Code Review Request (Full Diff)

**WHAT_WAS_IMPLEMENTED:** ${what}
**BASE_SHA:** ${baseSha}
**HEAD_SHA:** ${headSha}
**DESCRIPTION:** Comprehensive review of changes in ${branch}.

## TASK FOR AGENT
1. Analyze the diff between \`${baseSha}\` and \`${headSha}\`.
2. Apply the Morakot Coding Style Guide (embedded below).
3. Check for naming conventions, code complexity, and security (XSS).
`;
            await createReviewRequestFile(reviewRequest, cwd);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Error: ${e.message}`);
        }
    });

    // 2. Review Active File
    let reviewActiveFile = vscode.commands.registerCommand('antigravity.reviewActiveFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return vscode.window.showErrorMessage('No file is currently open.');

        const filePath = editor.document.fileName;
        const fileName = path.basename(filePath);
        const cwd = getWorkspacePath() || path.dirname(filePath);

        const reviewRequest = `
# Code Review Request (Single File)

**TARGET_FILE:** ${fileName}
**FILE_PATH:** ${filePath}
**DESCRIPTION:** Targeted review for the current active file.

## TASK FOR AGENT
Perform a deep-dive review of the code provided below. Focus heavily on:
- Morakot snake_case/CamelCase naming rules.
- XSS prevention in Jinja/HTML templates.
- Function verb requirements (is, get, set, etc.).

---
### Source Code
\`\`\`${editor.document.languageId}
${editor.document.getText()}
\`\`\`
`;
        await createReviewRequestFile(reviewRequest, cwd);
    });

    // 3. Review Specific Commit or Range
    let reviewByCommit = vscode.commands.registerCommand('antigravity.reviewByCommit', async () => {
        const cwd = getWorkspacePath();
        if (!cwd) return vscode.window.showErrorMessage('No workspace folder open.');

        const commitRange = await vscode.window.showInputBox({
            prompt: 'Enter commit SHA or range (e.g. abc1234 or HEAD~3..HEAD)',
            placeHolder: 'e.g. main..feature-branch',
            ignoreFocusOut: true
        });

        if (!commitRange) return;

        try {
            const reviewRequest = `
# Code Review Request (Commit/Range)

**COMMIT_RANGE:** ${commitRange}
**DESCRIPTION:** Reviewing changes specifically for the range: ${commitRange}

## TASK FOR AGENT
1. Inspect the commits in range \`${commitRange}\`.
2. Evaluate against Morakot standards.
3. Provide a grading (Rank A-F) based on complexity.
`;
            await createReviewRequestFile(reviewRequest, cwd);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Error: ${e.message}`);
        }
    });

    // 4. Review Staged & Unpushed Changes
    let reviewStagedChanges = vscode.commands.registerCommand('antigravity.reviewStagedChanges', async () => {
        const cwd = getWorkspacePath();
        if (!cwd) return vscode.window.showErrorMessage('No workspace folder open.');

        if (!isGitRepo(cwd)) {
            return vscode.window.showErrorMessage('Not a Git repository.');
        }

        try {
            const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim();

            const reviewRequest = `
# Code Review Request (Staged & Unpushed Changes)

**BRANCH:** ${branch}
**DESCRIPTION:** Reviewing currently staged changes and/or any unpushed commits on this branch.

## TASK FOR AGENT
1. Inspect the staged changes (\`git diff --cached\`).
2. Inspect unpushed commits on this branch compared to its upstream (\`git log @{u}..HEAD\` and \`git diff @{u}..HEAD\` if an upstream exists, otherwise review recent unpushed commits).
3. Evaluate against Morakot standards.
4. Provide a unified review of these local, unpushed changes.
`;
            await createReviewRequestFile(reviewRequest, cwd);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Error: ${e.message}`);
        }
    });

    context.subscriptions.push(reviewChanges, reviewActiveFile, reviewByCommit, reviewStagedChanges);
}

/**
 * Called when the extension is deactivated (window close, disable, or uninstall).
 * Removes the workspace skill files so they don't persist after uninstall.
 * On next activation, activate() will re-install fresh copies.
 */
export function deactivate() {
    // Check if cleanup is enabled (default: true)
    const cleanupEnabled = vscode.workspace.getConfiguration('antigravityCodeReview').get<boolean>('cleanupOnDeactivate', true);
    if (!cleanupEnabled) {
        console.log('[Antigravity Code Review] Deactivating — cleanup disabled by user setting, skill files preserved.');
        return;
    }

    console.log('[Antigravity Code Review] Deactivating — cleaning up workspace skill files...');

    // Remove skill files from all tracked workspaces via manifest
    const manifest = getManifest();
    for (const skillDir of manifest.installedPaths) {
        const skillMd = path.join(skillDir, 'SKILL.md');
        const codeReviewMd = path.join(skillDir, 'code-review.md');

        try {
            if (fs.existsSync(skillMd)) {
                fs.unlinkSync(skillMd);
                console.log(`  Removed: ${skillMd}`);
            }
        } catch (e) {
            console.error(`  Failed to remove ${skillMd}:`, e);
        }

        try {
            if (fs.existsSync(codeReviewMd)) {
                fs.unlinkSync(codeReviewMd);
                console.log(`  Removed: ${codeReviewMd}`);
            }
        } catch (e) {
            console.error(`  Failed to remove ${codeReviewMd}:`, e);
        }

        // Remove the skill directory if now empty
        try {
            if (fs.existsSync(skillDir) && fs.readdirSync(skillDir).length === 0) {
                fs.rmdirSync(skillDir);
                console.log(`  Removed empty directory: ${skillDir}`);
            }
        } catch {
            // Directory may not exist or not be empty
        }

        // Also remove the code-review-request.md from the workspace root
        // (it contains stale skill file references)
        const wsRoot = path.resolve(skillDir, '..', '..', '..');
        const reviewRequestFile = path.join(wsRoot, 'code-review-request.md');
        try {
            if (fs.existsSync(reviewRequestFile)) {
                fs.unlinkSync(reviewRequestFile);
                console.log(`  Removed stale review request: ${reviewRequestFile}`);
            }
        } catch (e) {
            console.error(`  Failed to remove ${reviewRequestFile}:`, e);
        }
    }

    // Clear the manifest since all files have been removed
    try {
        if (fs.existsSync(MANIFEST_FILE)) {
            fs.unlinkSync(MANIFEST_FILE);
        }
        if (fs.existsSync(MANIFEST_DIR) && fs.readdirSync(MANIFEST_DIR).length === 0) {
            fs.rmdirSync(MANIFEST_DIR);
        }
    } catch {
        // Best effort cleanup
    }

    console.log('[Antigravity Code Review] Cleanup complete.');
}
