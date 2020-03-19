const fs = require('fs')
const s3 = require('s3-client')
const process = require('process')

const splitVersion = process.env.npm_package_version.split('.')
splitVersion.splice(2)
const dataFileVersion = splitVersion.join('.')

const client = s3.createClient({
  maxAsyncS3: 20,
  s3RetryCount: 3,
  s3RetryDelay: 1000,
  multipartUploadThreshold: 20971520,
  multipartUploadSize: 15728640,
  // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
  s3Options: {}
})

const uploadFile = (key, filePath, filename) => {
  return new Promise((resolve, reject) => {
    var params = {
      localFile: filePath,
      // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
      s3Params: {
        Bucket: 'https-everywhere-data',
        Key: `${key}/${filename}`,
        ACL: 'public-read'
      }
    }
    var uploader = client.uploadFile(params)
    process.stdout.write(`Started uploading to: ${params.s3Params.Key}... `)
    uploader.on('error', function (err) {
      console.error('Unable to upload:', err.stack, 'Do you have ~/.aws/credentials filled out?')
      reject(new Error('Unable to upload'))
    })
    uploader.on('end', function (params) {
      console.log('completed')
      resolve()
    })
  })
}

// Queue up all the uploads one at a time to easily spot errors
let p = Promise.resolve()
const date = new Date().toISOString().split('.')[0]

const dataFilenames = fs.readdirSync('out')
dataFilenames.forEach((filename) => {
  if (process.argv.slice(2).indexOf("--prod") > -1 || process.argv.slice(2).indexOf("-p") > -1) {
    p = p.then(uploadFile.bind(null, dataFileVersion, `out/${filename}`, filename)).catch(() => {
      process.exit(1)
    })
    p = p.then(uploadFile.bind(null, `backups/${date}`, `out/${filename}`, filename)).catch(() => {
      process.exit(1)
    })
  } else {
    p = p.then(uploadFile.bind(null, `test/${dataFileVersion}`, `out/${filename}`, filename)).catch(() => {
      process.exit(1)
    })
  }
})
