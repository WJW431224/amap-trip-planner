export type CredentialSource = 'env' | 'local';

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
