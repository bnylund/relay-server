import { compare } from 'bcryptjs'
import { verify, sign } from 'jsonwebtoken'

import { User } from '../models/User'

const jwtSecret = process.env.JWT_SIGNING_KEY

export const login = async (email: string, password: string) => {
  const user = await User.findOne({ email })
  if (!user) {
    throw { status: 401, message: "User doesn't exist." }
  }
  const passwordsMatch = await compare(password, user.password)
  if (passwordsMatch) {
    return user
  }
  throw { status: 401, message: 'Invalid password.' }
}

export const generateLoginObject = (user: any) => {
  const objectToSign = {
    id: user._id,
    expiration: new Date(Date.now() + 1000 * 60 * 60 * 24 * (process.env.NODE_ENV === 'local' ? 30 : 1)),
  }

  return {
    user: user.toPublic(),
    token: sign(objectToSign, jwtSecret),
  }
}

export const decodeToken = (authorization: string) => {
  const jwt = verify(authorization, jwtSecret)
  if (!jwt) throw new Error('Invalid token.')
  if (Date.now() > new Date(jwt.expiration).getTime()) {
    throw new Error('Token expired.')
  }

  return User.findById(jwt.id).exec()
}
