require('dotenv').config()
import { json } from 'body-parser'
import { success } from 'cli-msg'
import { WebsocketService } from './websocket'
import express, { Express } from 'express'
import cors from '../middleware/headers'
import http from 'http'
import https from 'https'

if (!process.env.NODE_ENV) {
  console.warn('no NODE_ENV specified, defaulting to production.')
  process.env.NODE_ENV = 'production'
}

if (!process.env.BACKEND_URL) {
  console.error('No backend URL specified, terminating relay.')
  process.exit(1)
}

const app: Express = express()
app.use(json({ limit: '10mb' }), (err, req, res, next) => {
  if (err) {
    return res.status(400).send({ error: 'Error parsing JSON.' })
  } else {
    next()
  }
})
app.use(cors)
app.use((err, req, res, next) => {
  if (err) {
    res.status(500).send({ error: err.message })
  }
})

app.get('/', (req, res) => {
  return res.status(200).send({})
})

const PORT = Number(process.env.PORT) || 80
export const httpServer = http.createServer(app).listen(PORT, () => {
  success.wb(`HTTP Server started on port ${PORT}`)

  app.emit('listening')
})

const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 443
export const httpsServer = https.createServer(app).listen(HTTPS_PORT, () => {
  success.wb(`HTTPS Server started on port ${HTTPS_PORT}`)
})

export const websocket = new WebsocketService(app)
websocket.attach(httpServer)
websocket.attach(httpsServer)

export default app
