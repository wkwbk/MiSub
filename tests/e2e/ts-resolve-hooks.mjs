import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === 'ERR_MODULE_NOT_FOUND' &&
      (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('file://')) &&
      specifier.endsWith('.js')
    ) {
      const tsSpecifier = specifier.replace(/\.js$/, '.ts');
      try {
        return await nextResolve(tsSpecifier, context);
      } catch {
        // Fall through to check resolved path relative to parentURL
        if (context.parentURL && !specifier.startsWith('file://')) {
          const parentDir = new URL('./', context.parentURL);
          const candidateUrl = new URL(tsSpecifier, parentDir);
          if (existsSync(fileURLToPath(candidateUrl))) {
            return await nextResolve(pathToFileURL(fileURLToPath(candidateUrl)).href, context);
          }
        }
      }
    }
    throw error;
  }
}
