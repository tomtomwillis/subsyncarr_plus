export interface ScanConfig {
  includePaths: string[];
  excludePaths: string[];
}

function validatePath(path: string): boolean {
  // Add any path validation logic you need
  return path.startsWith('/') && !path.includes('..');
}

export function getScanConfig(): ScanConfig {
  const scanPaths = process.env.SCAN_PATHS?.split(',').filter(Boolean) || ['/scan_dir'];
  const excludePaths = process.env.EXCLUDE_PATHS?.split(',').filter(Boolean) || [];

  // Validate paths
  const validIncludePaths = scanPaths.filter((path) => {
    const isValid = validatePath(path);
    if (!isValid) {
      console.warn(`Invalid include path: ${path}`);
    }
    return isValid;
  });

  const validExcludePaths = excludePaths.filter((path) => {
    const isValid = validatePath(path);
    if (!isValid) {
      console.warn(`Invalid exclude path: ${path}`);
    }
    return isValid;
  });

  if (validIncludePaths.length === 0) {
    console.warn('No valid scan paths provided, defaulting to /scan_dir');
    validIncludePaths.push('/scan_dir');
  }

  console.log('Scan configuration:', {
    includePaths: validIncludePaths,
    excludePaths: validExcludePaths,
  });

  return {
    includePaths: validIncludePaths,
    excludePaths: validExcludePaths,
  };
}
