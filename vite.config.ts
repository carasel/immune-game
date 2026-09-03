import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
  test: {
    /**
     * Vitest looks for tests everywhere under the project, and Claude Code keeps
     * its git worktrees in `.claude/worktrees/` — whole second checkouts of this
     * repo, tests and all. Without this, `npm run check` runs those too and
     * reports failures from a copy of the code nobody is working on.
     *
     * `configDefaults.exclude` is spread in because setting this key replaces
     * the defaults rather than adding to them, and those defaults are what keep
     * node_modules and dist out.
     */
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
