/**
 * Uninstall hook script for Antigravity Code Review extension.
 * 
 * This script is invoked by VS Code when the extension is uninstalled
 * via the "vscode:uninstall" script in package.json.
 * 
 * It reads the manifest file to discover and remove all installed
 * SKILL.md and code-review.md files from workspace skill directories.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// The manifest file records which paths we've installed skill files to.
const MANIFEST_DIR = path.join(os.homedir(), '.antigravity-code-review');
const MANIFEST_FILE = path.join(MANIFEST_DIR, 'installed-skills.json');

interface InstalledSkillManifest {
    installedPaths: string[];
    extensionVersion: string;
}

function removeSkillFiles(): void {
    console.log('[Antigravity Code Review] Running uninstall cleanup...');

    // 1. Read the manifest to find all installed skill file locations
    if (fs.existsSync(MANIFEST_FILE)) {
        try {
            const raw = fs.readFileSync(MANIFEST_FILE, 'utf8');
            const manifest: InstalledSkillManifest = JSON.parse(raw);

            for (const skillDir of manifest.installedPaths) {
                const skillMd = path.join(skillDir, 'SKILL.md');
                const codeReviewMd = path.join(skillDir, 'code-review.md');

                // Remove SKILL.md
                if (fs.existsSync(skillMd)) {
                    fs.unlinkSync(skillMd);
                    console.log(`  Removed: ${skillMd}`);
                }

                // Remove code-review.md
                if (fs.existsSync(codeReviewMd)) {
                    fs.unlinkSync(codeReviewMd);
                    console.log(`  Removed: ${codeReviewMd}`);
                }

                // Remove the skill directory if it's now empty
                try {
                    const remaining = fs.readdirSync(skillDir);
                    if (remaining.length === 0) {
                        fs.rmdirSync(skillDir);
                        console.log(`  Removed empty directory: ${skillDir}`);
                    }
                } catch {
                    // Directory may already be gone
                }

                // Also remove code-review-request.md from the workspace root
                // (it contains stale references to the now-deleted skill files)
                const wsRoot = path.resolve(skillDir, '..', '..', '..');
                const reviewRequestFile = path.join(wsRoot, 'code-review-request.md');
                if (fs.existsSync(reviewRequestFile)) {
                    fs.unlinkSync(reviewRequestFile);
                    console.log(`  Removed stale review request: ${reviewRequestFile}`);
                }
            }

            // 2. Clean up the manifest file itself
            fs.unlinkSync(MANIFEST_FILE);
            console.log(`  Removed manifest: ${MANIFEST_FILE}`);

            // Remove manifest directory if empty
            try {
                const remaining = fs.readdirSync(MANIFEST_DIR);
                if (remaining.length === 0) {
                    fs.rmdirSync(MANIFEST_DIR);
                    console.log(`  Removed manifest directory: ${MANIFEST_DIR}`);
                }
            } catch {
                // Directory may already be gone
            }
        } catch (e) {
            console.error('[Antigravity Code Review] Error reading manifest:', e);
        }
    } else {
        console.log('[Antigravity Code Review] No manifest found, nothing to clean up.');
    }

    console.log('[Antigravity Code Review] Uninstall cleanup complete.');
}

// Execute
removeSkillFiles();
