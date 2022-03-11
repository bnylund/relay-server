import { Schema, model } from 'mongoose'
import { pick } from 'underscore'
import { genSalt, hash } from 'bcryptjs'
import { validateEmail } from './_User'

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    validate: validateEmail,
  },
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  password: { type: String, required: true, minlength: 8 },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
})

userSchema.methods.toPublic = function () {
  let publicProps = ['email', 'lastname', 'firstname', '_id', 'organizations', 'createdAt', 'updatedAt']
  const user = this
  const initials = `${user.firstname.substr(0, 1).toUpperCase()}${user.lastname.substr(0, 1).toUpperCase()}`
  const fullname = `${user.firstname} ${user.lastname}`

  return {
    ...pick(this, (val, key, obj) => {
      return publicProps.indexOf(key) > -1
    }),
    initials,
    fullname,
  }
}

userSchema.pre('save', function (next) {
  let user = this

  user.updatedAt = new Date()

  if (!user.isModified('password')) return next()

  genSalt(10, (err, salt) => {
    if (err) return next(err)
    hash(user.password, salt, (err, hash) => {
      if (err) return next(err)
      user.password = hash
      next()
    })
  })
})

export const User = model('User', userSchema, 'users')
