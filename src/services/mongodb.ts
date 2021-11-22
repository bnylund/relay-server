import mongoose = require('mongoose')

mongoose.Promise = Promise

console.log('Connecting to MongoDB')
mongoose.connect(process.env.MONGO_URL, <mongoose.ConnectOptions>{
  useNewUrlParser: true,
  useUnifiedTopology: true,
  retryWrites: false,
  socketTimeoutMS: 10000,
})

mongoose.connection.on('error', console.error.bind(console, 'connection error:'))

mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB!')
})

process.stdin.resume() //so the program will not close instantly

function exitHandler(options, exitCode) {
  mongoose.disconnect((err) => {
    process.exit(err ? 1 : 0)
  })
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, { cleanup: true }))

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit: true }))

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }))
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }))

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { exit: true }))

export default mongoose
