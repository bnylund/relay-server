const joi = require('joi')

const env = joi.object({
  NODE_ENV: joi.string().allow('dev', 'production', 'test', 'local'),
  MONGO_URL: joi.string().required(),
  PORT: joi.number().required(),
})

const { error, value } = env.validate(process.env, { allowUnknown: true })
if (error) {
  throw new Error(`Failed to validate configuration: ${error.message}`)
}

module.exports = value
