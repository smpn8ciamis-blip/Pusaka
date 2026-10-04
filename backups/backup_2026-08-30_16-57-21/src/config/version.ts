// Version configuration - fallback values when database is not available
// These values are now primarily managed via database (app_versions table)
export const APP_VERSION = '1.0';
export const REVISION = '20251209.0600';

// Full version string
export const getFullVersion = (): string => {
  return `v${APP_VERSION}.${REVISION}`;
};

// Generate revision timestamp
export const generateRevision = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}.${hour}${minute}`;
};
