// Download certificate to use for HTTPS server, then start

import { execSync } from 'child_process'
require('dotenv').config()

console.log('Getting certificate...')
execSync(
  `certbot certonly --standalone --preferred-challenges http -d ${process.env.DOMAIN} -m ben@nylund.us --agree-tos -n`,
  {
    stdio: 'inherit',
  },
)
console.log('Done, launching server')

require('./services/http')
