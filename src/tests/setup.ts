import app from '..'

// Don't execute tests until we're connected to MongoDB and the HTTP / WS server is up
// If connection fails, don't execute any tests
before(function (done) {
  process.env.RELAY_ENV = 'test'
  this.timeout(20000)
  app.on('listening', () => {
    done()
  })
})
