import { RequestHandler } from 'express'

export const sendResponse = ({ status, body }: { status?: number; body?: any } = {}): RequestHandler => {
  return (req, res) => {
    res.status(status || res.statusCode).send(body || {})
  }
}
