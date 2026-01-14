import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Helper to create a temp directory for testing
function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shiplog-test-'));
  // Initialize git repo (required for some features)
  execSync('git init', { cwd: tempDir, stdio: 'pipe' });
  return tempDir;
}

// Helper to run shiplog commands
function runShiplog(args: string, cwd: string, allowFailure = false): string {
  const cliPath = path.join(__dirname, '../../dist/index.js');
  try {
    return execSync(`node ${cliPath} ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e: any) {
    if (allowFailure) {
      // Return combined stdout + stderr for inspection
      return (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    }
    throw e;
  }
}

// Helper to read JSON file
function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('shiplog init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates all expected files', () => {
    runShiplog('init --name test-project', tempDir);

    // Check directories exist
    expect(fs.existsSync(path.join(tempDir, '.claude/commands'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'docs/sprints'))).toBe(true);

    // Check core files exist
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'docs/PROGRESS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'docs/DECISIONS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'docs/HANDOFF.md'))).toBe(true);

    // Check command files exist
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/ship.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/status.md'))).toBe(true);

    // Check hooks exist
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks/session-start.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks/session-end.sh'))).toBe(true);

    // Check settings exist
    expect(fs.existsSync(path.join(tempDir, '.claude/settings.json'))).toBe(true);
  });

  it('uses correct project name in files', () => {
    runShiplog('init --name "My Cool Project"', tempDir);

    const claudeMd = fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('# My Cool Project');

    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');
    expect(shipMd).toContain('**My Cool Project**');
  });

  it('makes hook scripts executable', () => {
    runShiplog('init', tempDir);

    const sessionEndStats = fs.statSync(path.join(tempDir, '.claude/hooks/session-end.sh'));
    const sessionStartStats = fs.statSync(path.join(tempDir, '.claude/hooks/session-start.sh'));

    // Check executable bit (mode & 0o111 checks if any execute bit is set)
    expect(sessionEndStats.mode & 0o111).toBeGreaterThan(0);
    expect(sessionStartStats.mode & 0o111).toBeGreaterThan(0);
  });

  it('skips existing files without --force', () => {
    // Create a file first
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'docs/PROGRESS.md'), 'custom content');

    runShiplog('init', tempDir);

    // Original content should be preserved
    const content = fs.readFileSync(path.join(tempDir, 'docs/PROGRESS.md'), 'utf-8');
    expect(content).toBe('custom content');
  });

  it('overwrites files with --force', () => {
    // Create a file first
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'docs/PROGRESS.md'), 'custom content');

    runShiplog('init --force', tempDir);

    // Content should be overwritten
    const content = fs.readFileSync(path.join(tempDir, 'docs/PROGRESS.md'), 'utf-8');
    expect(content).not.toBe('custom content');
    expect(content).toContain('# Progress Log');
  });

  it('preserves mcpServers when using --force', () => {
    // Create settings with mcpServers
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.claude/settings.json'),
      JSON.stringify({
        mcpServers: {
          myServer: { command: 'node', args: ['server.js'] }
        },
        permissions: { allow: [], deny: [] }
      }, null, 2)
    );

    runShiplog('init --force', tempDir);

    const settings = readJson(path.join(tempDir, '.claude/settings.json'));
    expect(settings.mcpServers).toBeDefined();
    expect(settings.mcpServers.myServer).toBeDefined();
    expect(settings.mcpServers.myServer.command).toBe('node');
  });
});

describe('shiplog upgrade', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects when shiplog is not initialized', () => {
    // Empty directory, no .claude or docs
    expect(() => runShiplog('upgrade', tempDir)).toThrow();
  });

  it('adds current files to old installation', () => {
    // Create minimal old structure
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ramp.md'), 'old ramp content');
    fs.writeFileSync(path.join(tempDir, '.claude/settings.json'), '{}');

    runShiplog('upgrade', tempDir);

    // Current files should exist
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/ship.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/status.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks/session-start.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks/session-end.sh'))).toBe(true);

    // Obsolete files should be removed
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/ramp.md'))).toBe(false);
  });

  it('creates backup of existing commands', () => {
    // Create minimal old structure with custom ship.md
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'original ship content');
    fs.writeFileSync(path.join(tempDir, '.claude/settings.json'), '{}');

    runShiplog('upgrade --force', tempDir);

    // Backup directory should exist
    const backupDirs = fs.readdirSync(path.join(tempDir, '.claude'))
      .filter(f => f.startsWith('commands.backup-'));
    expect(backupDirs.length).toBe(1);

    // Original content should be in backup
    const backupContent = fs.readFileSync(
      path.join(tempDir, '.claude', backupDirs[0], 'ship.md'),
      'utf-8'
    );
    expect(backupContent).toBe('original ship content');
  });

  it('preserves mcpServers in settings', () => {
    // Create v1 structure with mcpServers
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(
      path.join(tempDir, '.claude/settings.json'),
      JSON.stringify({
        mcpServers: {
          context7: { command: 'npx', args: ['-y', '@context7/mcp'] }
        }
      }, null, 2)
    );

    runShiplog('upgrade', tempDir);

    const settings = readJson(path.join(tempDir, '.claude/settings.json'));
    expect(settings.mcpServers).toBeDefined();
    expect(settings.mcpServers.context7).toBeDefined();
    expect(settings.hooks).toBeDefined();
  });

  it('detects already-upgraded projects', () => {
    // Create fully up-to-date structure (has ship.md AND autonomy hooks)
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.claude/hooks/autonomy'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'existing ship content');
    fs.writeFileSync(path.join(tempDir, '.claude/hooks/autonomy/stop-hook.sh'), '#!/bin/bash');
    fs.writeFileSync(path.join(tempDir, '.claude/settings.json'), '{}');

    const output = runShiplog('upgrade', tempDir);

    expect(output).toContain('Already up to date');
  });

  it('re-applies templates with --force', () => {
    // Create v2 structure with old content
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'old ship content');
    fs.writeFileSync(path.join(tempDir, '.claude/settings.json'), '{}');

    runShiplog('upgrade --force', tempDir);

    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');
    expect(shipMd).not.toBe('old ship content');
    expect(shipMd).toContain('You are working on');
  });

  it('adds only autonomy hooks when v2 exists but hooks are missing', () => {
    // Create v2 structure (has ship.md) but WITHOUT autonomy hooks
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.claude/hooks'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'existing ship content');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/status.md'), 'existing status content');
    fs.writeFileSync(path.join(tempDir, '.claude/hooks/session-start.sh'), '#!/bin/bash\necho "existing"');
    fs.writeFileSync(path.join(tempDir, '.claude/settings.json'), JSON.stringify({
      permissions: { allow: [], deny: [] },
      hooks: {
        SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'bash test.sh' }] }],
        SessionEnd: [{ matcher: '', hooks: [{ type: 'command', command: 'bash test.sh' }] }]
      }
    }, null, 2));

    const output = runShiplog('upgrade', tempDir);

    // Should indicate hooks-only upgrade
    expect(output).toContain('Adding autonomy hooks');

    // Autonomy hooks should be added
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks/autonomy/stop-hook.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks/autonomy/session-start-autonomy.sh'))).toBe(true);

    // Existing commands should NOT be touched
    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');
    expect(shipMd).toBe('existing ship content');
    const statusMd = fs.readFileSync(path.join(tempDir, '.claude/commands/status.md'), 'utf-8');
    expect(statusMd).toBe('existing status content');

    // Existing hooks should NOT be touched
    const sessionStart = fs.readFileSync(path.join(tempDir, '.claude/hooks/session-start.sh'), 'utf-8');
    expect(sessionStart).toContain('existing');

    // No backup should be created
    const backupDirs = fs.readdirSync(path.join(tempDir, '.claude'))
      .filter(f => f.startsWith('commands.backup-'));
    expect(backupDirs.length).toBe(0);

    // Settings should have Stop hook added
    const settings = readJson(path.join(tempDir, '.claude/settings.json'));
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.Stop[0].hooks[0].command).toContain('stop-hook.sh');
  });
});

describe('settings.json format', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates valid JSON', () => {
    runShiplog('init', tempDir);

    const settingsPath = path.join(tempDir, '.claude/settings.json');
    expect(() => readJson(settingsPath)).not.toThrow();
  });

  it('has correct hook format with matchers', () => {
    runShiplog('init', tempDir);

    const settings = readJson(path.join(tempDir, '.claude/settings.json'));

    // Check hooks structure
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.SessionEnd).toBeDefined();

    // Check SessionStart format
    expect(Array.isArray(settings.hooks.SessionStart)).toBe(true);
    // CRITICAL: matcher MUST be a string, not an object
    // Claude Code validates this and will reject object matchers
    expect(typeof settings.hooks.SessionStart[0].matcher).toBe('string');
    expect(settings.hooks.SessionStart[0].hooks).toBeDefined();
    expect(Array.isArray(settings.hooks.SessionStart[0].hooks)).toBe(true);
    expect(settings.hooks.SessionStart[0].hooks[0].type).toBe('command');
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain('session-start.sh');

    // Check SessionEnd format
    expect(Array.isArray(settings.hooks.SessionEnd)).toBe(true);
    // CRITICAL: matcher MUST be a string, not an object
    expect(typeof settings.hooks.SessionEnd[0].matcher).toBe('string');
    expect(settings.hooks.SessionEnd[0].hooks).toBeDefined();
    expect(Array.isArray(settings.hooks.SessionEnd[0].hooks)).toBe(true);
    expect(settings.hooks.SessionEnd[0].hooks[0].type).toBe('command');
    expect(settings.hooks.SessionEnd[0].hooks[0].command).toContain('session-end.sh');
  });

  it('has permissions structure', () => {
    runShiplog('init', tempDir);

    const settings = readJson(path.join(tempDir, '.claude/settings.json'));

    expect(settings.permissions).toBeDefined();
    expect(settings.permissions.allow).toBeDefined();
    expect(Array.isArray(settings.permissions.allow)).toBe(true);
    expect(settings.permissions.deny).toBeDefined();
    expect(Array.isArray(settings.permissions.deny)).toBe(true);
  });
});

describe('hook scripts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runShiplog('init', tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('session-end.sh generates valid JSONL', () => {
    // Simulate hook input
    const hookInput = JSON.stringify({
      transcript_path: '/test/transcript.jsonl',
      cwd: tempDir,
      reason: 'user_request'
    });

    const result = execSync(
      `echo '${hookInput}' | bash .claude/hooks/session-end.sh`,
      { cwd: tempDir, encoding: 'utf-8' }
    );

    // Check that session-metadata.jsonl was created
    const metadataPath = path.join(tempDir, '.claude/session-metadata.jsonl');
    expect(fs.existsSync(metadataPath)).toBe(true);

    // Check it's valid JSON
    const metadata = fs.readFileSync(metadataPath, 'utf-8').trim();
    expect(() => JSON.parse(metadata)).not.toThrow();

    const parsed = JSON.parse(metadata);
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.reason).toBe('user_request');
    expect(parsed.transcript).toBe('/test/transcript.jsonl');
  });

  it('session-start.sh displays previous session info', () => {
    // Create previous session metadata
    fs.writeFileSync(
      path.join(tempDir, '.claude/session-metadata.jsonl'),
      JSON.stringify({
        timestamp: '2025-12-07T12:00:00-08:00',
        reason: 'user_request',
        files_changed: ['src/index.ts'],
        recent_commits: ['abc123 fix: something']
      }) + '\n'
    );

    const result = execSync(
      `CLAUDE_PROJECT_DIR="${tempDir}" bash .claude/hooks/session-start.sh`,
      { cwd: tempDir, encoding: 'utf-8' }
    );

    expect(result).toContain('Previous session');
  });
});

describe('command files content', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runShiplog('init --name test-project', tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('ship.md contains driver seat persona', () => {
    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');

    expect(shipMd).toContain('You are not an assistant');
    expect(shipMd).toContain('owner');
    expect(shipMd).toContain('Make decisions');
    expect(shipMd).toContain('DRIVE');
  });

  it('ship.md contains mode detection', () => {
    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');

    expect(shipMd).toContain('Continue Mode');
    expect(shipMd).toContain('Planning Mode');
    expect(shipMd).toContain('docs/sprints');
  });

  it('ship.md contains post-compaction recovery', () => {
    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');

    expect(shipMd).toContain('Post-Compaction Recovery');
    expect(shipMd).toContain('Re-read');
    expect(shipMd).toContain('drift');
  });

  it('ship.md includes design mode', () => {
    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');

    expect(shipMd).toContain('Design Mode');
    expect(shipMd).toContain('design signals');
    expect(shipMd).toContain('frontend-design');
  });

  it('ship.md includes quick task mode', () => {
    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');

    expect(shipMd).toContain('Quick Task Mode');
    expect(shipMd).toContain('No sprint file needed');
  });

  it('ship.md emphasizes starting work immediately after planning', () => {
    const shipMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'utf-8');

    expect(shipMd).toContain('START WORKING IMMEDIATELY');
    expect(shipMd).toContain('Do NOT tell the user to run autopilot separately');
  });

  it('status.md recommends /ship', () => {
    const statusMd = fs.readFileSync(path.join(tempDir, '.claude/commands/status.md'), 'utf-8');

    expect(statusMd).toContain('/ship');
  });
});

describe('shiplog autopilot', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runShiplog('init --name test-project', tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('fails when no active sprint exists', () => {
    // No sprint file created yet
    const output = runShiplog('autopilot --dry-run', tempDir, true);

    expect(output).toContain('No active sprint found');
  });

  it('detects active sprint with incomplete features', () => {
    // Create a sprint file with incomplete features
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-11-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Test Feature',
      created: '2025-12-11',
      status: 'in_progress',
      features: [
        { id: 'feat-001', description: 'First feature', passes: false },
        { id: 'feat-002', description: 'Second feature', passes: false }
      ]
    }, null, 2));

    const output = runShiplog('autopilot --dry-run', tempDir, true);

    expect(output).toContain('Test Feature');
    expect(output).toContain('First feature');
    expect(output).toContain('DRY RUN');
  });

  it('creates .shiplog directory structure', () => {
    // Create a sprint
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-11-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Test',
      created: '2025-12-11',
      status: 'in_progress',
      features: [{ id: 'f1', description: 'Test', passes: false }]
    }, null, 2));

    runShiplog('autopilot --dry-run', tempDir, true);

    expect(fs.existsSync(path.join(tempDir, '.shiplog'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.shiplog/sessions'))).toBe(true);
  });

  it('generates continuation prompt with sprint info', () => {
    // Create a sprint
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-11-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Awesome Feature',
      created: '2025-12-11',
      status: 'in_progress',
      features: [{ id: 'f1', description: 'Build the thing', passes: false }]
    }, null, 2));

    const output = runShiplog('autopilot --dry-run', tempDir, true);

    // Check prompt contains task info
    expect(output).toContain('Awesome Feature');
    expect(output).toContain('Build the thing');
    expect(output).toContain('autopilot mode');
  });

  it('includes skillbook in prompt when present', () => {
    // Create skillbook
    fs.writeFileSync(
      path.join(tempDir, 'docs/SKILLBOOK.md'),
      '## What Works\n- Always run tests\n'
    );

    // Create a sprint
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-11-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Test',
      created: '2025-12-11',
      status: 'in_progress',
      features: [{ id: 'f1', description: 'Test', passes: false }]
    }, null, 2));

    const output = runShiplog('autopilot --dry-run', tempDir, true);

    expect(output).toContain('Always run tests');
    expect(output).toContain('Learnings');
  });

  it('shows max iterations and stall threshold', () => {
    // Create a sprint
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-11-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Test',
      created: '2025-12-11',
      status: 'in_progress',
      features: [{ id: 'f1', description: 'Test', passes: false }]
    }, null, 2));

    const output = runShiplog('autopilot -n 5 -s 2 --dry-run', tempDir, true);

    expect(output).toContain('Max iterations: 5');
    expect(output).toContain('Stall threshold: 2');
  });

  it('adds .shiplog to .gitignore', () => {
    // Create .gitignore
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n');

    // Create a sprint
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-11-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Test',
      created: '2025-12-11',
      status: 'in_progress',
      features: [{ id: 'f1', description: 'Test', passes: false }]
    }, null, 2));

    runShiplog('autopilot --dry-run', tempDir, true);

    const gitignore = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.shiplog/');
  });

  it('skips completed sprints', () => {
    // Create a completed sprint
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-11-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Complete',
      created: '2025-12-11',
      status: 'completed',
      features: [{ id: 'f1', description: 'Done', passes: true }]
    }, null, 2));

    const output = runShiplog('autopilot --dry-run', tempDir, true);

    // Should not find active sprint
    expect(output).toContain('No active sprint found');
  });

  it('finds next incomplete feature', () => {
    // Create a sprint with mix of complete/incomplete
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-11-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Mixed',
      created: '2025-12-11',
      status: 'in_progress',
      features: [
        { id: 'f1', description: 'Already done', passes: true },
        { id: 'f2', description: 'Not started', passes: false },
        { id: 'f3', description: 'Also pending', passes: false }
      ]
    }, null, 2));

    const output = runShiplog('autopilot --dry-run', tempDir, true);

    // Should show next incomplete feature, not the completed one
    expect(output).toContain('Not started');
    expect(output).not.toContain('Already done');
  });
});

describe('shiplog doctor', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects when shiplog is not initialized', () => {
    // Empty directory
    expect(() => runShiplog('doctor', tempDir)).toThrow();
  });

  it('passes on healthy installation', () => {
    runShiplog('init', tempDir);

    const output = runShiplog('doctor', tempDir);

    expect(output).toContain('Shiplog installation detected');
    expect(output).toContain('All');
    expect(output).toContain('passed');
  });

  it('detects missing directories', () => {
    // Create partial installation (missing hooks dir)
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'test');

    const output = runShiplog('doctor', tempDir, true);

    expect(output).toContain('Missing directory');
    expect(output).toContain('.claude/hooks');
  });

  it('detects missing critical files', () => {
    // Create minimal structure without ship.md
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.claude/hooks'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs/sprints'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test');
    fs.writeFileSync(path.join(tempDir, 'docs/PROGRESS.md'), 'test');
    fs.writeFileSync(path.join(tempDir, 'docs/HANDOFF.md'), 'test');

    const output = runShiplog('doctor', tempDir, true);

    expect(output).toContain('Missing file');
    expect(output).toContain('ship.md');
  });

  it('detects installation missing ship.md', () => {
    // Create structure without ship.md
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.claude/hooks'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs/sprints'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test');
    fs.writeFileSync(path.join(tempDir, 'docs/PROGRESS.md'), 'test');
    fs.writeFileSync(path.join(tempDir, 'docs/HANDOFF.md'), 'test');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/status.md'), 'test');

    const output = runShiplog('doctor', tempDir, true);

    expect(output).toContain('ship.md');
    expect(output).toContain('Missing');
  });

  it('detects invalid hook format (object matcher)', () => {
    runShiplog('init', tempDir);

    // Corrupt the settings with old object matcher format
    const settingsPath = path.join(tempDir, '.claude/settings.json');
    const settings = readJson(settingsPath);
    settings.hooks.SessionStart[0].matcher = {}; // Object instead of string
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    const output = runShiplog('doctor', tempDir, true);

    expect(output).toContain('matcher must be a string');
  });

  it('detects invalid hook format (missing matcher)', () => {
    runShiplog('init', tempDir);

    // Corrupt the settings with old flat format (missing matcher)
    const settingsPath = path.join(tempDir, '.claude/settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify({
      permissions: { allow: [], deny: [] },
      hooks: {
        SessionStart: [
          { type: 'command', command: 'bash test.sh' }
        ]
      }
    }, null, 2));

    const output = runShiplog('doctor', tempDir, true);

    expect(output).toContain("missing 'matcher' field");
  });

  it('fixes hook format with --fix', () => {
    runShiplog('init', tempDir);

    // Corrupt the settings with object matcher
    const settingsPath = path.join(tempDir, '.claude/settings.json');
    const settings = readJson(settingsPath);
    settings.hooks.SessionStart[0].matcher = {}; // Object instead of string
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    runShiplog('doctor --fix', tempDir, true);

    // Check it was fixed
    const fixedSettings = readJson(settingsPath);
    expect(typeof fixedSettings.hooks.SessionStart[0].matcher).toBe('string');
  });

  it('fixes non-executable hook scripts with --fix', () => {
    runShiplog('init', tempDir);

    // Remove executable bit from hook script
    const hookPath = path.join(tempDir, '.claude/hooks/session-start.sh');
    fs.chmodSync(hookPath, 0o644);

    // Verify it's not executable
    expect(fs.statSync(hookPath).mode & 0o111).toBe(0);

    runShiplog('doctor --fix', tempDir, true);

    // Check it was fixed
    expect(fs.statSync(hookPath).mode & 0o111).toBeGreaterThan(0);
  });

  it('creates missing directories with --fix', () => {
    // Create partial installation
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'test');
    // Missing: .claude/hooks and docs/sprints

    runShiplog('doctor --fix', tempDir, true);

    // Directories should now exist
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'docs/sprints'))).toBe(true);
  });
});

describe('sprint file operations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    // Create minimal shiplog structure
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.claude/hooks'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs/sprints'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.shiplog'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test');
    fs.writeFileSync(path.join(tempDir, '.gitignore'), '.shiplog/\n');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('sprint file can be parsed with multiple features', () => {
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-15-test.json');
    const sprintData = {
      initiative: 'Test Sprint',
      created: '2025-12-15',
      status: 'in_progress',
      context: {
        test_command: 'pnpm test',
        quality_criteria: ['Tests pass', 'No errors']
      },
      features: [
        { id: 'feat-001', description: 'First feature', passes: false },
        { id: 'feat-002', description: 'Second feature', passes: false },
        { id: 'feat-003', description: 'Third feature', passes: true }
      ]
    };
    fs.writeFileSync(sprintPath, JSON.stringify(sprintData, null, 2));

    // Read it back and verify structure
    const parsed = readJson(sprintPath);
    expect(parsed.features).toHaveLength(3);
    expect(parsed.features[0].id).toBe('feat-001');
    expect(parsed.features[2].passes).toBe(true);
  });

  it('sprint file feature passes can be updated', () => {
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-15-test.json');
    const sprintData = {
      initiative: 'Test Sprint',
      created: '2025-12-15',
      status: 'in_progress',
      features: [
        { id: 'feat-001', description: 'First feature', passes: false }
      ]
    };
    fs.writeFileSync(sprintPath, JSON.stringify(sprintData, null, 2));

    // Simulate what update_sprint tool does
    const sprint = readJson(sprintPath);
    const feature = sprint.features.find((f: any) => f.id === 'feat-001');
    feature.passes = true;
    fs.writeFileSync(sprintPath, JSON.stringify(sprint, null, 2) + '\n');

    // Verify update persisted
    const updated = readJson(sprintPath);
    expect(updated.features[0].passes).toBe(true);
  });

  it('sprint status auto-completes when all features pass', () => {
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-15-test.json');
    const sprintData = {
      initiative: 'Test Sprint',
      created: '2025-12-15',
      status: 'in_progress',
      features: [
        { id: 'feat-001', description: 'First feature', passes: false },
        { id: 'feat-002', description: 'Second feature', passes: true }
      ]
    };
    fs.writeFileSync(sprintPath, JSON.stringify(sprintData, null, 2));

    // Simulate update_sprint completing the last feature
    const sprint = readJson(sprintPath);
    const feature = sprint.features.find((f: any) => f.id === 'feat-001');
    feature.passes = true;

    // Check if all features pass and auto-complete
    const allPass = sprint.features.every((f: any) => f.passes);
    if (allPass && sprint.status === 'in_progress') {
      sprint.status = 'completed';
    }

    fs.writeFileSync(sprintPath, JSON.stringify(sprint, null, 2) + '\n');

    const updated = readJson(sprintPath);
    expect(updated.status).toBe('completed');
  });

  it('feature can be found by description substring', () => {
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-15-test.json');
    const sprintData = {
      initiative: 'Test Sprint',
      created: '2025-12-15',
      status: 'in_progress',
      features: [
        { id: 'feat-001', description: 'Add user authentication', passes: false },
        { id: 'feat-002', description: 'Implement API endpoints', passes: false }
      ]
    };
    fs.writeFileSync(sprintPath, JSON.stringify(sprintData, null, 2));

    const sprint = readJson(sprintPath);
    const searchTerm = 'authentication';
    const feature = sprint.features.find(
      (f: any) => f.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    expect(feature).toBeDefined();
    expect(feature.id).toBe('feat-001');
  });

  it('notes can be appended to features', () => {
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-12-15-test.json');
    const sprintData = {
      initiative: 'Test Sprint',
      created: '2025-12-15',
      status: 'in_progress',
      features: [
        { id: 'feat-001', description: 'Test feature', passes: false, notes: 'Initial note' }
      ]
    };
    fs.writeFileSync(sprintPath, JSON.stringify(sprintData, null, 2));

    // Simulate appending notes
    const sprint = readJson(sprintPath);
    const feature = sprint.features[0];
    const existingNotes = feature.notes || '';
    const newNote = 'Added new implementation detail';
    feature.notes = existingNotes
      ? `${existingNotes}\n2025-12-15: ${newNote}`
      : `2025-12-15: ${newNote}`;

    fs.writeFileSync(sprintPath, JSON.stringify(sprint, null, 2) + '\n');

    const updated = readJson(sprintPath);
    expect(updated.features[0].notes).toContain('Initial note');
    expect(updated.features[0].notes).toContain('Added new implementation detail');
  });
});

describe('shiplog status', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows error when not initialized', () => {
    const output = runShiplog('status', tempDir, true);
    expect(output).toContain('No shiplog installation found');
  });

  it('shows no sprint message when no sprints exist', () => {
    runShiplog('init', tempDir);
    const output = runShiplog('status', tempDir);
    expect(output).toContain('No active sprint found');
  });

  it('shows sprint progress correctly', () => {
    runShiplog('init', tempDir);

    // Create a test sprint
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-01-14-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'Test Feature',
      status: 'in_progress',
      created: '2025-01-14',
      features: [
        { id: 'feat-001', description: 'First feature', passes: true },
        { id: 'feat-002', description: 'Second feature', passes: false },
      ]
    }, null, 2));

    const output = runShiplog('status', tempDir);
    expect(output).toContain('Test Feature');
    expect(output).toContain('1/2');
    expect(output).toContain('50%');
    expect(output).toContain('First feature');
    expect(output).toContain('Second feature');
  });

  it('outputs JSON with --json flag', () => {
    runShiplog('init', tempDir);

    // Create a test sprint
    const sprintPath = path.join(tempDir, 'docs/sprints/2025-01-14-test.json');
    fs.writeFileSync(sprintPath, JSON.stringify({
      initiative: 'JSON Test',
      status: 'in_progress',
      created: '2025-01-14',
      features: [
        { id: 'feat-001', description: 'Feature one', passes: true },
      ]
    }, null, 2));

    const output = runShiplog('status --json', tempDir);
    const json = JSON.parse(output);
    expect(json.project).toBeDefined();
    expect(json.sprint).toBeDefined();
    expect(json.sprint.name).toBe('JSON Test');
    expect(json.sprint.progress.completed).toBe(1);
    expect(json.sprint.progress.total).toBe(1);
    expect(json.sprint.progress.percentage).toBe(100);
  });

  it('shows specific sprint with --sprint flag', () => {
    runShiplog('init', tempDir);

    // Create two sprints
    fs.writeFileSync(
      path.join(tempDir, 'docs/sprints/2025-01-10-old.json'),
      JSON.stringify({
        initiative: 'Old Sprint',
        status: 'completed',
        created: '2025-01-10',
        features: [{ id: 'f1', description: 'Old feature', passes: true }]
      }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempDir, 'docs/sprints/2025-01-14-new.json'),
      JSON.stringify({
        initiative: 'New Sprint',
        status: 'in_progress',
        created: '2025-01-14',
        features: [{ id: 'f1', description: 'New feature', passes: false }]
      }, null, 2)
    );

    // Request specific old sprint
    const output = runShiplog('status --sprint old', tempDir);
    expect(output).toContain('Old Sprint');
    expect(output).not.toContain('New Sprint');
  });

  it('shows last session info when metadata exists', () => {
    runShiplog('init', tempDir);

    // Create session metadata
    fs.writeFileSync(
      path.join(tempDir, '.claude/session-metadata.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        reason: 'context_exhausted',
        files_changed: ['file1.ts', 'file2.ts'],
        recent_commits: []
      }) + '\n'
    );

    const output = runShiplog('status', tempDir);
    expect(output).toContain('Last Session');
    expect(output).toContain('context_exhausted');
    expect(output).toContain('Files changed: 2');
  });

  it('fails gracefully with specific sprint not found', () => {
    runShiplog('init', tempDir);

    // Create one sprint
    fs.writeFileSync(
      path.join(tempDir, 'docs/sprints/2025-01-14-exists.json'),
      JSON.stringify({
        initiative: 'Existing Sprint',
        status: 'in_progress',
        created: '2025-01-14',
        features: []
      }, null, 2)
    );

    const output = runShiplog('status --sprint nonexistent', tempDir, true);
    expect(output).toContain('Sprint file not found');
    expect(output).toContain('Available sprints');
  });
});
