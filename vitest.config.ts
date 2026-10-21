import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// `npm test` runs the regular unit/integration tests. The *.bench.test.ts files and the gigaminxS<N>*.test.ts
// files are offline research / benchmark runs (minutes each, some tied to solver variants that are no longer
// shipped); they stay in the repo and run with `npm run test:research`.
const research = ['**/*.bench.test.ts', 'src/customDodeca/gigaminxS[0-9]*.test.ts', 'src/customDodeca/gigaminxBenchmark.test.ts']

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: process.env.RESEARCH ? { include: research } : { exclude: [...configDefaults.exclude, ...research] },
  }),
)
