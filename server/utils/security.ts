import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { db } from '../../src/db/index.ts';
import { auditLogs } from '../../src/db/schema.ts';

function isPrivateOrLoopbackIp(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) {
    return true;
  }
  const v4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
  if (!net.isIPv4(v4)) {
    return true;
  }
  const parts = v4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are permitted.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('Access to local or internal metadata hosts is blocked.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrLoopbackIp(hostname)) {
      throw new Error('Access to private or loopback IP addresses is blocked.');
    }
    return parsed;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (!records || records.length === 0) {
    throw new Error('Unable to resolve target hostname.');
  }
  for (const record of records) {
    if (isPrivateOrLoopbackIp(record.address)) {
      throw new Error('Resolved address points to a private or loopback network.');
    }
  }
  return parsed;
}

export function resolveSafePath(baseDir: string, relativeTarget: string): string {
  const normalizedBase = path.resolve(baseDir);
  const cleanedTarget = relativeTarget.replace(/^[/\\]+/, '');
  const resolved = path.resolve(normalizedBase, cleanedTarget);
  if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + path.sep)) {
    throw new Error('Path traversal outside confined directory is forbidden.');
  }
  return resolved;
}

export function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const trimmed = str.trimStart();
  const safe = /^[=+\-@\t\r]/.test(trimmed) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

export async function recordAuditLog(params: {
  userId?: number | null;
  action: string;
  resourceType?: string;
  resourceId?: string | number;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      action: params.action,
      resourceType: params.resourceType ?? '',
      resourceId: params.resourceId !== undefined ? String(params.resourceId) : '',
      detailsJson: params.details ?? {},
      ipAddress: params.ipAddress ?? '',
    });
  } catch (err) {
    console.error('Audit log write skipped:', err);
  }
}
