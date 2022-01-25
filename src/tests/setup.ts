import app, { httpServer } from '..'

before(function (done) {
  process.env.RELAY_ENV = 'test'
  this.timeout(20000)
  let d = false
  app.once('listening', () => {
    if (!d) {
      done()
    }
  })

  if (httpServer.listening) {
    d = true
    done()
  }
})
