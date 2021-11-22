require('dotenv').config()
require('./../config')

import { json } from 'body-parser'
import { success } from 'cli-msg'
import { initialize } from './services/websocket'
import express, { Express } from 'express'
import cors from './middleware/headers'

// Configure routes
const app: Express = express()
app.use(json({ limit: '10mb' }), (err, req, res, next) => {
  if (err) {
    return res.status(400).send({ error: 'Error parsing JSON.' })
  } else {
    next()
  }
})
app.use(cors)
app.use('/api', require('./api').default, require('./middleware/http').sendResponse())
app.use((err, req, res, next) => {
  if (err) {
    res.status(500).send({ error: err.message })
  }
})

require('./services/mongodb').default.connection.once('open', () => {
  const httpServer = app.listen(process.env.PORT, async () => {
    success.wb(`Express server started on port ${process.env.PORT}`)

    app.emit('listening')
  })

  // Start socket.io
  initialize(httpServer)
})

export default app
