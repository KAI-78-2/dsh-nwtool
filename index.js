/**
 * Network operations toolbox — Host half.
 *
 * Registers two things:
 *  - an HTTP endpoint the Web panel calls (`/nwtool/api`), which streams one
 *    NDJSON event per update so long-running scans render as they happen;
 *  - agent tools that expose the same engines to the assistant.
 */
import { createApiHandler } from './host/api.js'
import { disposeMonitors } from './host/monitor.js'
import { disposeSessions } from './host/term.js'
import { createDatacomToolDefinitions, createToolDefinitions } from './host/tools.js'

const API_PATH = '/nwtool/api'

export const inject = []

export function apply(ctx) {
  ctx.inject(['webServer'], (scoped) => {
    const handler = createApiHandler()
    scoped.effect(() => scoped.webServer.register({ kind: 'prefix', path: API_PATH, handler }))
    scoped.effect(() => () => {
      disposeSessions()
      disposeMonitors()
    })
  })

  ctx.inject(['tools'], (scoped) => {
    for (const definition of [...createToolDefinitions(), ...createDatacomToolDefinitions()]) {
      scoped.effect(() => scoped.tools.register(definition))
    }
  })
}
