import { FileTypeResult } from 'file-type'
import * as AWS from 'aws-sdk'

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-2',
})

const s3 = new AWS.S3()

export function uploadFile(buffer: Buffer, name: string, type: FileTypeResult) {
  const params: AWS.S3.PutObjectRequest = {
    ACL: 'public-read',
    Body: buffer,
    Bucket: process.env.S3_BUCKET,
    ContentType: type.mime,
    Key: name,
  }
  return s3.upload(params).promise()
}

export function deleteFile(name: string) {
  const params: AWS.S3.DeleteObjectRequest = {
    Bucket: process.env.S3_BUCKET,
    Key: name,
  }
  return s3.deleteObject(params).promise()
}

export async function removeDirectory(dir) {
  const listParams = {
    Bucket: process.env.S3_BUCKET,
    Prefix: dir,
  }

  const listedObjects = await s3.listObjectsV2(listParams).promise()

  if (listedObjects.Contents.length === 0) return

  const deleteParams = {
    Bucket: process.env.S3_BUCKET,
    Delete: { Objects: [] },
  }

  listedObjects.Contents.forEach(({ Key }) => {
    deleteParams.Delete.Objects.push({ Key })
  })

  await s3.deleteObjects(deleteParams).promise()

  if (listedObjects.IsTruncated) await removeDirectory(dir)
}
