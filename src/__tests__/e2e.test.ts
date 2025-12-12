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

    // Check v2 command files exist
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/ship.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/ship-design.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/status.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/ramp.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/plan.md'))).toBe(true);

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

  it('adds v2 files to v1 installation', () => {
    // Create minimal v1 structure
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ramp.md'), 'old ramp content');
    fs.writeFileSync(path.join(tempDir, '.claude/settings.json'), '{}');

    runShiplog('upgrade', tempDir);

    // v2 files should exist
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/ship.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/commands/ship-design.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks/session-start.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude/hooks/session-end.sh'))).toBe(true);
  });

  it('creates backup of existing commands', () => {
    // Create minimal v1 structure
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ramp.md'), 'original ramp content');
    fs.writeFileSync(path.join(tempDir, '.claude/settings.json'), '{}');

    runShiplog('upgrade', tempDir);

    // Backup directory should exist
    const backupDirs = fs.readdirSync(path.join(tempDir, '.claude'))
      .filter(f => f.startsWith('commands.backup-'));
    expect(backupDirs.length).toBe(1);

    // Original content should be in backup
    const backupContent = fs.readFileSync(
      path.join(tempDir, '.claude', backupDirs[0], 'ramp.md'),
      'utf-8'
    );
    expect(backupContent).toBe('original ramp content');
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
    // Create v2 structure (has ship.md)
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test-project');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ship.md'), 'existing ship content');
    fs.writeFileSync(path.join(tempDir, '.claude/settings.json'), '{}');

    const output = runShiplog('upgrade', tempDir);

    expect(output).toContain('Already at v2');
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

  it('ship-design.md is lighter structure', () => {
    const designMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ship-design.md'), 'utf-8');

    expect(designMd).toContain('design work');
    expect(designMd).toContain('lighter structure');
    expect(designMd).toContain('No sprint file required');
    expect(designMd).toContain('frontend-design');
  });

  it('ramp.md and plan.md redirect to /ship', () => {
    const rampMd = fs.readFileSync(path.join(tempDir, '.claude/commands/ramp.md'), 'utf-8');
    const planMd = fs.readFileSync(path.join(tempDir, '.claude/commands/plan.md'), 'utf-8');

    expect(rampMd).toContain('Consider using `/ship`');
    expect(planMd).toContain('Consider using `/ship`');
  });

  it('status.md recommends /ship', () => {
    const statusMd = fs.readFileSync(path.join(tempDir, '.claude/commands/status.md'), 'utf-8');

    expect(statusMd).toContain('/ship');
    // Should NOT recommend /ramp anymore
    expect(statusMd).not.toContain('Run /ramp');
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

  it('detects v1 installation needing upgrade', () => {
    // Create v1 structure (has ramp.md but no ship.md)
    fs.mkdirSync(path.join(tempDir, '.claude/commands'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.claude/hooks'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs/sprints'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# test');
    fs.writeFileSync(path.join(tempDir, 'docs/PROGRESS.md'), 'test');
    fs.writeFileSync(path.join(tempDir, 'docs/HANDOFF.md'), 'test');
    fs.writeFileSync(path.join(tempDir, '.claude/commands/ramp.md'), 'test');

    const output = runShiplog('doctor', tempDir, true);

    expect(output).toContain('v1');
    expect(output).toContain('upgrade');
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
