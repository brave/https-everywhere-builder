'use strict'
const fs = require('fs')
const { gunzip } = require('zlib')
const crypto = require('crypto')
const https = require('https')
const levelup = require('level')
const rmDir = require('./util').rmDir
const exec = require('child_process').exec

// Taken from https://github.com/EFForg/https-everywhere/issues/18138#issuecomment-509430039

const publicKey = `\
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA1cwvFQu3Kw+Pz8bcEFuV
5zx0ZheDsc4Tva7Qv6BL90/sDLqCW79Y543nDkPtNVfFH/89pt2kSPp/IcS5XnYi
w6zBQeFuILFw5JpvZt14K0s4e025Q9CXfhYKIBKT9PnqihwAacjMa6rQb7RTu7Xx
VvqxRb3b0vx2CR40LSlYZ8H/KpeaUwq2oz+fyrI6LFTeYvbO3ZuLKeK5xV1a32xe
TVMFkIj3LxnQalxq+DRHfj7LRRoTnbRDW4uoDc8aVpLFliuO79jUKbobz4slpiWJ
4wjKR/O6OK13HbZUiOSxi8Bms+UqBPOyzbMVpmA7lv/zWdaLu1IVlVXQyLVbbrqI
6llRqfHdcJoEl+eC48AofuB+relQtjTEK/hyBf7sPwrbqAarjRjlyEx6Qy5gTXyx
M9attfNAeupYR6jm8LKm6TFpfWkyDxUmj/f5pJMBWNTomV74f8iQ2M18/KWMUDCO
f80tR0t21Q1iCWdvA3K/KJn05tTLyumlwwlQijMqRkYuao+CX9L3DJIaB3VPYPTS
IPUr7oi16agsuamOyiOtlZiRpEvoNg2ksJMZtwnj5xhBQydkdhMW2ZpHDzcLuZlh
JYZL/l3/7wuzRM7vpyA9obP92CpZRFJErGZmFxJC93I4U9+0B0wg+sbyMKGJ5j1B
WTnibCklDXtWzXtuiz18EgECAwEAAQ==
-----END PUBLIC KEY-----
`

const baseURL = 'https://www.https-rulesets.org/v1/'

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

const getTimestamp = () =>
  requestPromise({
    url: `${baseURL}latest-rulesets-timestamp`,
  }).then(response => Number(response))

const downloadRulesets = timestamp =>
  Promise.all([
    requestPromise({
      url: `${baseURL}default.rulesets.${timestamp}.gz`,
    }),
    requestPromise({
      url: `${baseURL}rulesets-signature.${timestamp}.sha256`,
    })
  ]).then(
    ([rulesetBuffer, signatureBuffer]) =>
      new Promise((resolve, reject) => {
        if (
          crypto
            .createVerify('sha256')
            .update(rulesetBuffer)
            .verify(
              {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_PSS_PADDING
              },
              signatureBuffer
            )
        ) {
          gunzip(rulesetBuffer, (err, result) => {
            if (err) {
              reject(err)
            } else {
              resolve(result)
            }
          })
        } else {
          reject(new Error('Signature check failed'))
        }
      })
  )

const buildDataFiles = buffer => {
  // Manually exclude sites that are broken until they are fixed in the next
  // HTTPS Everywhere release.
  const exclusions = {}

  let rulesets = JSON.parse(buffer.toString('utf8'))
  if (rulesets != null) {
    rulesets = rulesets.rulesets
  }

  const jsonOutput = {
    rulesetStrings: [],
    targets: {}
  }

  for (const ruleset of rulesets) {
    if (!ruleset.default_off && !ruleset.platform) {
      if (ruleset.name in exclusions) {
        console.log('NOTE: Excluding ruleset:', ruleset.name)
        continue
      }

      for (const target of ruleset.target) {
        if (!jsonOutput.targets[target]) {
          jsonOutput.targets[target] = []
        }
        jsonOutput.targets[target].push(jsonOutput.rulesetStrings.length)
      }

      const r = {
        ruleset: {
          name: ruleset.name,
          rule: ruleset.rule.map((rule) => {
            return {
              from: rule.from,
              to: rule.to
            }
          })
        }
      }

      if (ruleset.exclusion) {
        r.exclusion = ruleset.exclusion.map((exclusion) => {
          return {
            pattern: exclusion
          }
        })
      }

      jsonOutput.rulesetStrings.push(r)
    }
  }

  console.log('Writing httpse.json')
  fs.writeFileSync('./out/httpse.json', JSON.stringify(jsonOutput), 'utf8')

  console.log('creating httpse.leveldb')
  rmDir('./out/httpse.leveldb')

  const httpseLevelDB = levelup('./out/httpse.leveldb', {
    compression: false, errorIfExists: true
  })

  const batch = httpseLevelDB.batch()

  for (const ruleset of rulesets) {
    if (!ruleset.default_off && !ruleset.platform) {
      if (ruleset.name in exclusions) {
        console.log('NOTE: Excluding ruleset:', ruleset.name)
        continue
      }

      let targetRuleSets = []
      const rule = {
        r: ruleset.rule.map((rule) => {
          if (rule.from === '^http:' && rule.to === 'https:') {
            return { d: 1 }
          } else {
            return { f: rule.from, t: rule.to }
          }
        })
      }
      if (ruleset.exclusion) {
        rule.e = ruleset.exclusion.map((exclusion) => {
          return { p: exclusion.pattern }
        })
      }
      targetRuleSets = targetRuleSets.concat(rule)

      for (const target of ruleset.target) {
        const reverseTarget = target.split('.').reverse().join('.')
        if (targetRuleSets.length > 0) {
          batch.put(reverseTarget, JSON.stringify(targetRuleSets), {
            sync: true
          })
        }
      }
    }
  }

  batch.write((err) => {
    if (err) {
      console.error(err)
    } else {
      httpseLevelDB.close((err) => {
        if (err) {
          console.error(err)
        } else {
          exec('zip -r -9 httpse.leveldb.zip httpse.leveldb && GZIP=-9 tar -czf httpse.leveldb.tgz httpse.leveldb', {
            cwd: 'out'
          }, (err) => {
            if (err) {
              throw err
            } else {
              rmDir('./out/httpse.leveldb')
              console.log('done')
            }
          })
        }
      })
    }
  })
}

rmDir('./out')
fs.mkdirSync('./out')

console.log('downloading rulesets')
getTimestamp()
  .then(downloadRulesets)
  .then(buildDataFiles)
  .catch(console.error)
