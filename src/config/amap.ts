import AMapLoader from '@amap/amap-jsapi-loader';
import type { AmapCredentials } from './credentials';

export const AMAP_PLUGINS = [
  'AMap.Scale',
  'AMap.ToolBar',
  'AMap.Geocoder',
  'AMap.PlaceSearch',
  'AMap.Driving',
  'AMap.Walking',
  'AMap.Riding',
  'AMap.Transfer',
];

interface CachedLoader {
  key: string;
  promise: Promise<any>;
}

let cachedLoader: CachedLoader | null = null;

export function loadAmap(credentials: AmapCredentials): Promise<any> {
  if (cachedLoader?.key === credentials.key) {
    return cachedLoader.promise;
  }

  window._AMapSecurityConfig = {
    securityJsCode: credentials.securityCode,
  };

  const promise = AMapLoader.load({
    key: credentials.key,
    version: '2.0',
    plugins: AMAP_PLUGINS,
  }).catch((error: unknown) => {
    if (cachedLoader?.key === credentials.key) cachedLoader = null;
    throw error;
  });

  cachedLoader = { key: credentials.key, promise };
  return promise;
}

export interface AmapErrorInfo {
  title: string;
  detail: string;
  code: string;
  raw: string;
}

const ERROR_HINTS: Array<{
  test: RegExp;
  title: string;
  detail: string;
}> = [
  {
    test: /INVALID_USER_KEY/i,
    title: 'Key 无效',
    detail: 'Key 可能复制不完整，或服务平台选错了。请确认申请的是「Web端(JS API)」。',
  },
  {
    test: /INVALID_USER_SCODE/i,
    title: '安全密钥无效',
    detail: '安全密钥与 Key 不匹配，或没有配置。请回到高德控制台重新复制。',
  },
  {
    test: /USERKEY_PLAT_NOMATCH/i,
    title: 'Key 平台不匹配',
    detail: '这个 Key 不是「Web端(JS API)」类型。请重新添加正确服务平台的 Key。',
  },
  {
    test: /INVALID_USER_DOMAIN/i,
    title: '域名未授权',
    detail: '当前访问域名不在 Key 的白名单里。本地开发请把 localhost 加入白名单。',
  },
  {
    test: /OVER_LIMIT|QUOTA|QUERY_OVER/i,
    title: '今日配额已用完',
    detail: 'Key 本身是有效的，但今日调用量到上限了。可以等次日恢复，或在控制台查看配额。',
  },
  {
    test: /Failed to load|NetworkError|ERR_NETWORK|timeout/i,
    title: '地图脚本加载失败',
    detail: '请检查网络连接后重试。公司网络或代理可能拦截了 webapi.amap.com。',
  },
];

function stringifyError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function explainAmapError(error: unknown): AmapErrorInfo {
  const raw = stringifyError(error);
  const known = ERROR_HINTS.find((item) => item.test.test(raw));
  const codeMatch = raw.match(/[A-Z][A-Z0-9_]{5,}/);

  return {
    title: known?.title ?? '地图连接失败',
    detail:
      known?.detail ??
      '高德没有返回可识别的错误。请先确认 Key 和安全密钥是否完整，再重试。',
    code: codeMatch?.[0] ?? 'UNKNOWN',
    raw,
  };
}
