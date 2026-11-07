import express, { type Express } from 'express'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'

/** Attach the Vite SPA only for the persistent local/Hostinger Node server. */
export function attachStaticFrontend(app: Express) {
  const frontendBuildDir = fileURLToPath(new URL('../../dist/', import.meta.url))
  const frontendIndex = fileURLToPath(new URL('../../dist/index.html', import.meta.url))

  app.use(express.static(frontendBuildDir, {
    index: false,
    maxAge: config.NODE_ENV === 'production' ? '1y' : 0,
    immutable: config.NODE_ENV === 'production',
  }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    return res.sendFile(frontendIndex, error => { if (error) next(error) })
  })
}
