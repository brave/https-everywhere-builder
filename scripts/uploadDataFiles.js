const fs = require('fs')
const aws = require('aws-sdk')
const process = require('process')

const splitVersion = process.env.npm_package_version.split('.')
splitVersion.splice(2)
const dataFileVersion = splitVersion.join('.')

const client = new aws.S3({
  maxRetries: 3,
  retryDelayOptions: { base: 1000 },
})

const uploadFile = (key, filePath, filename) => {
  return new Promise((resolve, reject) => {
    var params = {
      // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
      Body: fs.createReadStream(filePath),
      Bucket: S3_BUCKET,
      Key: `${key}/${filename}`,
      GrantFullControl: process.env.S3_CANONICAL_ID,
      GrantRead: process.env.CLOUDFRONT_CANONICAL_ID
    }
    console.log(`Started uploading to: ${params.Key}... `)
    client.putObject(params, function(err, data) {
      if (err) {
        console.error('Unable to upload:', err.stack, 'Do you have ~/.aws/credentials filled out?')
        reject(new Error('Unable to upload'))
      } else {
        console.log('completed')
        resolve()
      }
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
