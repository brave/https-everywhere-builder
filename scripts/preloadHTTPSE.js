'use strict'
const fs = require('fs')
const https = require('https')
const levelup = require('level')
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
requestPromise({
    url: rulesetURL,
  })
  .then(buildDataFiles)
  .catch(console.error)
