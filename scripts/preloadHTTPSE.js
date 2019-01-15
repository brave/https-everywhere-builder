'use strict'
const fs = require('fs')
const zlib = require('zlib')
const path = require('path')
const https = require('https')
const levelup = require('level')
const rmDir = require('./util').rmDir
const exec = require('child_process').exec

const downloadRulesets = (dir, cb) => {
  let timestamp = ''
  let baseURL = 'https://www.https-rulesets.org/v1/'

  // Obtain the latest rulesets timestamp from EFF's official endpoint
  https.get(baseURL + 'latest-rulesets-timestamp', (response) => {
    response.on('data', (data) => {
      timestamp += data.toString()
    })

    // Download the rulesets once we obtained the timestamp
    response.on('end', () => {
      // ${timestamp} comes with trailing newlines, parse it and convert it back
      let target = `default.rulesets.${Number(timestamp)}.gz`

      https.get(baseURL + target, (stream) => {
        // ${target} is gzipped, gunzip accordingly
        // and pipe the output to ${filename}
        let filename = path.join(dir, 'default.rulesets')
        let output = fs.createWriteStream(filename)

        stream.pipe(zlib.createGunzip()).pipe(output)

        output.on('finish', () => {
          output.close(() => {
            // everything is fine here
            cb()
          }, (err) => {
            console.log(`ERROR: Failed to write to ${filename}: ${err}`)
          })
        })
      }).on('error', (err) => {
        console.log(`ERROR: Failed to retrieve ${target}: ${err}`)
      }).end()
    })
  }).on('error', (err) => {
    console.log(`ERROR: Failed to retrieve the latest rulesets timestamp: ${err}`)
  }).end()
}

const buildDataFiles = () => {
  // Manually exclude sites that are broken until they are fixed in the next
  // HTTPS Everywhere release.
  const exclusions = {
    'Fox News': 'breaks foxnews.com on C70+ with NET::ERR_CERT_SYMANTEC_LEGACY',
    'Digg (partial)': 'breaks digg.com on C70+ with NET::ERR_CERT_SYMANTEC_LEGACY'
  }

  let rulesets = JSON.parse(fs.readFileSync('./https-everywhere/rules/default.rulesets', 'utf8'))
  if (rulesets != null) {
    rulesets = rulesets.rulesets
  }

  let jsonOutput = {
    'rulesetStrings': [],
    'targets': {}
  }

  for (const ruleset of rulesets) {
    if (!ruleset.default_off && !ruleset.platform) {
      if (ruleset.name in exclusions) {
        console.log('NOTE: Excluding ruleset:', ruleset.name)
        continue
      }

      for (const target of ruleset.target) {
        if (!jsonOutput['targets'][target]) {
          jsonOutput['targets'][target] = []
        }
        jsonOutput['targets'][target].push(jsonOutput['rulesetStrings'].length)
      }

      let r = {
        ruleset: {
          'name': ruleset.name,
          'rule': ruleset.rule.map((rule) => {
            return {
              'from': rule.from,
              'to': rule.to
            }
          })
        }
      }

      if (ruleset.exclusion) {
        r.exclusion = ruleset.exclusion.map((exclusion) => {
          return {
            'pattern': exclusion
          }
        })
      }

      jsonOutput['rulesetStrings'].push(r)
    }
  }

  console.log('Writing httpse.json')
  fs.writeFileSync('./out/httpse.json', JSON.stringify(jsonOutput), 'utf8')

  console.log('creating httpse.leveldb')
  rmDir('./out/httpse.leveldb')

  const httpseLevelDB = levelup('./out/httpse.leveldb', {
    compression: false, errorIfExists: true
  })

  let batch = httpseLevelDB.batch()

  for (const ruleset of rulesets) {
    if (!ruleset.default_off && !ruleset.platform) {
      if (ruleset.name in exclusions) {
        console.log('NOTE: Excluding ruleset:', ruleset.name)
        continue
      }

      let targetRuleSets = []
      let rule = {
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
          exec('zip -r httpse.leveldb.zip httpse.leveldb && tar -czf httpse.leveldb.tgz httpse.leveldb', {
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

rmDir('./https-everywhere')
fs.mkdirSync('./https-everywhere')
fs.mkdirSync('./https-everywhere/rules')
rmDir('./out')
fs.mkdirSync('./out')

console.log('downloading rulesets')
downloadRulesets('./https-everywhere/rules', buildDataFiles)
