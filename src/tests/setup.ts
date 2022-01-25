import { httpServer } from '../services/http'

before(function (done) {
  process.env.RELAY_ENV = 'test'
  this.timeout(20000)
  if (httpServer.listening) {
    done()
  }
  httpServer.once('listening', () => {
    done()
  })
})
