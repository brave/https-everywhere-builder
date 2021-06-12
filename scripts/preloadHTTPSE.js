'use strict'
const fs = require('fs')
const https = require('https')
const rmDir = require('./util').rmDir
const exec = require('child_process').exec

const rulesetURL = 'https://raw.githubusercontent.com/brave/https-everywhere-ruleset/main/httpse.json'

function requestPromise(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options.url, res => {
      let data = ""
      res.setEncoding('binary')

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve(Buffer.from(data, 'binary'))
      })
    })

    req.on('error', error => {
      reject(new Error('Unable to fetch: ' + error))
    })

    req.end()
  })
}

const buildDataFiles = buffer => {
  // Manually exclude sites that are broken until they are fixed in the next
  // HTTPS Everywhere release.
  const exclusions = {}

  let rulesets = JSON.parse(buffer.toString('utf8'))
  if (rulesets != null) {
    rulesets = rulesets.rulesets
  }

  console.log('creating httpse-rs.json')

  const rulesetsWithoutExclusions = rulesets.filter((ruleset) => {
    if (ruleset.default_off || ruleset.platform) {
      return false
    }
    if (ruleset.name in exclusions) {
      console.log('NOTE: Excluding ruleset:', ruleset.name)
      return false
    }
    return true
  })

  fs.writeFileSync('./out/httpse-rs.json', JSON.stringify(rulesetsWithoutExclusions), 'utf8')
  exec('zip -r -9 httpse-rs.json.zip httpse-rs.json && GZIP=-9 tar -czf httpse-rs.json.tgz httpse-rs.json', {
    cwd: 'out'
  }, (err) => {
    if (err) {
      throw err
    } else {
      fs.unlinkSync('./out/httpse-rs.json')
      console.log('done')
    }
  })
}

rmDir('./out')
fs.mkdirSync('./out')

console.log('downloading rulesets')
requestPromise({
    url: rulesetURL,
  })
  .then(buildDataFiles)
  .catch(console.error)
