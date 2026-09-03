import { createServer } from 'vite'

/**
 * Runs `scratch/explore.ts` — a throwaway script for poking at the simulation.
 *
 *   npm run explore
 *
 * Write whatever you want to find out in scratch/explore.ts, run this, read the
 * output, throw it away. The folder is gitignored, so nothing you scribble in
 * there ends up in the repository.
 *
 * It goes through Vite rather than running under node directly, which means the
 * script can import from src/ exactly the way the game does:
 *
 *   import { World } from '../src/sim/world'
 *   import { theCut, TISSUE_VIEW } from '../src/content/levels'
 *
 * That is the whole reason this file exists — node on its own can't resolve the
 * project's extensionless imports, and the simulation is the interesting part.
 */

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  logLevel: 'error',
})

try {
  await server.ssrLoadModule('/scratch/explore.ts')
} finally {
  await server.close()
}
