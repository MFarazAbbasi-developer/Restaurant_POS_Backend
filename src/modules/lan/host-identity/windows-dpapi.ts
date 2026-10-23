import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Windows DPAPI (CurrentUser) via PowerShell ProtectedData.
 * Secrets travel only on stdin/stdout as base64 — never on the command line / argv.
 */

function powershellPath(): string {
  const root = process.env.SystemRoot ?? 'C:\\Windows';
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function runDpapi(operation: 'protect' | 'unprotect', inputBase64: string): string {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$inputText = [Console]::In.ReadToEnd().Trim()',
    '$bytes = [Convert]::FromBase64String($inputText)',
    'Add-Type -AssemblyName System.Security',
    operation === 'protect'
      ? '$result = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)'
      : '$result = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Convert]::ToBase64String($result))',
  ].join('; ');

  const out = execFileSync(
    powershellPath(),
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      input: `${inputBase64}\n`,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const trimmed = String(out).trim();
  if (!trimmed) {
    throw new Error(`DPAPI ${operation} returned empty output`);
  }
  return trimmed;
}

export function isWindowsPlatform(): boolean {
  return process.platform === 'win32';
}

export function dpapiProtect(plaintext: Buffer): Buffer {
  if (!isWindowsPlatform()) {
    throw new Error('DPAPI protect is only available on Windows');
  }
  const protectedB64 = runDpapi('protect', plaintext.toString('base64'));
  return Buffer.from(protectedB64, 'base64');
}

export function dpapiUnprotect(ciphertext: Buffer): Buffer {
  if (!isWindowsPlatform()) {
    throw new Error('DPAPI unprotect is only available on Windows');
  }
  const plainB64 = runDpapi('unprotect', ciphertext.toString('base64'));
  return Buffer.from(plainB64, 'base64');
}
