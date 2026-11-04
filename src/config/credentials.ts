export type CredentialSource = 'env' | 'server' | 'local';

export interface AmapCredentials {
  key: string;
  securityCode: string;
  source: CredentialSource;
}

export interface CredentialInput {
  key: string;
  securityCode: string;
}

const STORAGE_KEY = 'amap-trip:credentials:v1';

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readEnvCredentials(): CredentialInput | null {
  const key = clean(import.meta.env.VITE_AMAP_KEY);
  const securityCode = clean(import.meta.env.VITE_AMAP_SECURITY_CODE);
  return key && securityCode ? { key, securityCode } : null;
}

export function readStoredCredentials(): CredentialInput | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CredentialInput>;
    const key = clean(parsed.key);
    const securityCode = clean(parsed.securityCode);
    return key && securityCode ? { key, securityCode } : null;
  } catch {
    return null;
  }
}

export function resolveCredentials(): AmapCredentials | null {
  const envCredentials = readEnvCredentials();
  if (envCredentials) return { ...envCredentials, source: 'env' };

  const stored = readStoredCredentials();
  if (stored) return { ...stored, source: 'local' };

  return null;
}

/**
 * 部署在服务器上时，Key 放在服务器环境变量里，由 /api/config 下发，
 * 这样别人打开链接就能直接用，不用自己申请 Key。
 */
export async function fetchServerCredentials(): Promise<CredentialInput | null> {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return null;

    const data = (await response.json()) as { key?: unknown; securityCode?: unknown };
    const key = clean(data.key);
    const securityCode = clean(data.securityCode);
    return key && securityCode ? { key, securityCode } : null;
  } catch {
    return null;
  }
}

export async function resolveCredentialsAsync(): Promise<AmapCredentials | null> {
  const envCredentials = readEnvCredentials();
  if (envCredentials) return { ...envCredentials, source: 'env' };

  const stored = readStoredCredentials();
  if (stored) return { ...stored, source: 'local' };

  const server = await fetchServerCredentials();
  if (server) return { ...server, source: 'server' };

  return null;
}

export function saveCredentials(input: CredentialInput): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      key: input.key.trim(),
      securityCode: input.securityCode.trim(),
      savedAt: Date.now(),
    }),
  );
}

export function clearStoredCredentials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 本地存储不可用时保持内存状态即可。
  }
}

export function validateCredentials(input: CredentialInput): string | null {
  if (!input.key) return '请填入 Key';
  if (!input.securityCode) return '请填入安全密钥';
  if (/\s/.test(input.key)) return 'Key 中间不应有空格，请重新复制';
  if (/\s/.test(input.securityCode)) return '安全密钥中间不应有空格，请重新复制';
  if (input.key.length < 16) return 'Key 看起来不完整，请确认复制全了';
  if (input.securityCode.length < 16) return '安全密钥看起来不完整，请确认复制全了';
  return null;
}

export function maskCredential(value: string): string {
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
