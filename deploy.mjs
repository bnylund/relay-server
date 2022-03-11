import fs from 'fs'
import archiver from 'archiver'
import config from './package.json'
import { fileTypeFromFile } from 'file-type'
import AWS from 'aws-sdk'
import dotenv from 'dotenv'
dotenv.config()

/*AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1',
})*/

const s3 = new AWS.S3()

function uploadFile(buffer, name, type) {
  const params = {
    Body: buffer,
    Bucket: process.env.BUCKET,
    ContentType: type.mime,
    Key: name,
  }
  return s3.upload(params).promise()
}

if (!fs.existsSync('./artifacts')) {
  fs.mkdirSync('./artifacts')
}

const name = `./artifacts/relay-v${config.version}.zip`

const out = fs.createWriteStream(name)
const zip = archiver('zip')

out.on('close', async () => {
  console.log(`${zip.pointer()} bytes written to output zip`)
  console.log('Uploading to S3...')

  try {
    const buffer = fs.readFileSync(name)
    const type = await fileTypeFromFile(name)
    const data = await uploadFile(buffer, `relay-v${config.version}.zip`, type)
    console.log('Done!')
    console.log(data)
  } catch (err) {
    console.error(`Failed to upload to S3.`)
    throw err
  }
})

zip.on('error', (err) => {
  throw err
})

zip.pipe(out)
zip.directory(`src`, 'src')
zip.glob('*.*', {
  ignore: ['deploy.mjs'],
})
zip.finalize()
