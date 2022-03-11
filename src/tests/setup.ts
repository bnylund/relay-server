process.env.NODE_ENV = 'test'
global.USE_TLS = 'false'
const { httpServer } = require('../services/http')
