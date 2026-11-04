export {};

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode: string;
      serviceHost?: string;
    };
    AMap?: unknown;
  }
}
