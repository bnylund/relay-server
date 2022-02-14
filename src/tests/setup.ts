before(function (done) {
  process.env.NODE_ENV = 'test'
  this.timeout(20000)
  const { httpServer } = require('../services/http')
  if (httpServer.listening) {
    done()
  }
  httpServer.once('listening', () => {
    done()
  })
})
