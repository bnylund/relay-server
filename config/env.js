const joi = require('joi')

const env = joi.object({
  NODE_ENV: joi.string().allow('dev', 'production', 'test', 'local').required(),
  UPDATE_RATE: joi.number().required(),
  PORT: joi.number().required(),
  MONGO_URL: joi.string().required(),
  JWT_SIGNING_KEY: joi.string().required(),
})

const { error, value } = env.validate(process.env, { allowUnknown: true })
if (error) {
  throw new Error(`Failed to validate configuration: ${error.message}`)
}

module.exports = value
