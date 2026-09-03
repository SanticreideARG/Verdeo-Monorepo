const runtimePackages = [
  '@verdeo/ai',
  '@verdeo/audit',
  '@verdeo/chat',
  '@verdeo/auth',
  '@verdeo/config',
  '@verdeo/contracts',
  '@verdeo/customers',
  '@verdeo/email',
  '@verdeo/geocoding',
  '@verdeo/db',
  '@verdeo/observability',
  '@verdeo/orders',
  '@verdeo/routing',
];

for (const packageName of runtimePackages) {
  const resolvedUrl = import.meta.resolve(packageName);

  if (!resolvedUrl.includes('/dist/')) {
    throw new Error(`${packageName} resolved to source instead of compiled output: ${resolvedUrl}`);
  }

  await import(packageName);
}

console.log(`Verified compiled runtime exports for ${runtimePackages.length} workspace packages.`);
