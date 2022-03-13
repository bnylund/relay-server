import { S3Client, GetObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3'
import { execSync } from 'child_process'
import { Readable } from 'stream'
import { writeFileSync } from 'fs'
require('dotenv').config()

export const getLatest = async () => {
  return await getLatestRelay(process.env.BUCKET)
}

export const installUpdate = (latest: any) => {
  global.pendingUpdate = true
  return new Promise((resolve, reject) => {
    getObject(process.env.BUCKET, latest.Key)
      .then((data: Buffer) => {
        writeFileSync('/app/relay.zip', data)

        // unzip
        execSync('unzip -o /app/relay.zip')

        resolve(undefined)
      })
      .catch((err) => {
        global.pendingUpdate = false
        reject(err)
      })
  })
}

const client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.REGION,
})

async function getObject(Bucket, Key): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({
      Key,
      Bucket,
    }),
  )
  const stream = response.Body as Readable

  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.once('end', () => resolve(Buffer.concat(chunks)))
    stream.once('error', reject)
  })
}

async function getLatestRelay(Bucket) {
  const response = await client.send(
    new ListObjectsCommand({
      Bucket,
    }),
  )

  if (!response.Contents || response.Contents.length === 0) return null

  let latest: any = response.Contents[0]
  for (let i = 1; i < response.Contents.length; i++) {
    if (
      response.Contents[i].LastModified >= latest.LastModified &&
      response.Contents[i].Key.startsWith('relay-') &&
      response.Contents[i].Key.endsWith('.zip')
    ) {
      latest = response.Contents[i]
      latest.Changelog = 'No changelog found for this version.'
      try {
        latest.Changelog = (
          await getObject(process.env.BUCKET, response.Contents[i].Key.replace('.zip', '.CHANGELOG'))
        ).toString()
      } catch (err) {}
      latest.Version = response.Contents[i].Key.replace('relay-v', '').replace('.zip', '')
    }
  }

  return latest
}
