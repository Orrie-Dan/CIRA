import 'dotenv/config'
import { validateProductionSecrets } from './utils/secrets.js'
import { buildApp } from './app.js'

validateProductionSecrets()

const port = Number(process.env.PORT || 3001)
const app = await buildApp()

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`)
    app.close().then(
      () => process.exit(0),
      (err) => {
        app.log.error(err, 'Error during shutdown')
        process.exit(1)
      }
    )
  })
}

// Start server
const host = '0.0.0.0'

app.listen({ port, host }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
