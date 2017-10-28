'use strict'
const fs = require('fs')
const http = require('https')
const parseString = require('xml2js').parseString
const levelup = require('level')
const rmDir = require('./util').rmDir
const exec = require('child_process').exec

const xpiVersion = '5.2.21' // Manually update this to latest version

const downloadRulesets = (dir, cb) => {
  const downloadURL = `https://www.eff.org/files/https-everywhere-${xpiVersion}-eff.xpi`
  const xpiFile = fs.createWriteStream('httpse.xpi')
  http.get(downloadURL, (response) => {
    response.pipe(xpiFile)
    xpiFile.on('finish', () => {
      xpiFile.close(() => {
        exec('unzip ../httpse.xpi', {
          cwd: 'https-everywhere'
        }, (err) => {
          if (err) {
            throw err
          } else {
            cb()
          }
        })
      })
    })
  })
  .on('error', (err) => {
    console.log(`Error downloading ${downloadURL}`, err)
  })
}

const buildDataFiles = () => {
  // Manually exclude sites that are broken until they are fixed in the next
  // HTTPS Everywhere release.
  const exclusions = {
    'Nike.com.xml': 'breaks nikeplus.com',
    'PJ_Media.xml': 'mixed content on https://pjmedia.com/instapundit/',
    'Slashdot.xml': 'redirect loop on mobile slashdot.org',
    'Delta.com.xml': 'https://delta.com does not redirect to https://www.delta.com',
    'Cargo.xml': 'breaks cargocollective.com',
    'TMZ.com.xml': 'breaks www.tmz.com',
    'BusinessInsider.xml': 'breaks http://www.businessinsider.com/silicon-valley-100-2016-6?op=0',
    'Tesco.xml': 'breaks tesco.com due to CSP mismatch',
    'Vodafone.ie.xml': 'breaks pagination on http://shop.vodafone.ie/shop/phonesAndPlans/phonesAndPlansHome.jsp?subPage=phones&planFilter=onAccount',
    'IDownloadBlog.xml': 'breaks http://www.idownloadblog.com/',
    'EBay_static.com.xml': 'breaks suggested product image previews',
    'Cisco.xml': 'breaks http://www.cisco.com/c/m/en_us/training-events/events-webinars/techwise-tv/listings.html',
    'GQ.xml': 'mixed content on gq.com',
    'Where_2_Get_It.xml': 'maps missing on http://us.coopertire.com/Customer-Care/Dealer-Locator.aspx?form=locator_search&addressline=92346',
    'Thompson_Hotels.com.xml': 'missing stylesheets on http://www.thompsonhotels.com/'
  }

  const rulesets = JSON.parse(fs.readFileSync('./https-everywhere/chrome/content/rulesets.json', 'utf8'))

  // Convert XML rules to JSON
  for (let id in rulesets.rulesetStrings) {
    let contents = rulesets.rulesetStrings[id]
    parseString(contents, function (err, result) {
      if (err) {
        throw new Error('FATAL: error parsing XML: ' + contents)
      }
      // Exclude broken rules
      const ruleset = result.ruleset
      if (ruleset.$.f in exclusions) {
        console.log('NOTE: Excluding rule', JSON.stringify(result))
        ruleset.$.default_off = exclusions[ruleset.$.f]
      }
      rulesets.rulesetStrings[id] = result
    })
  }

  console.log('Writing httpse.json')
  fs.writeFileSync('./out/httpse.json', JSON.stringify(rulesets), 'utf8')

  console.log('creating httpse.leveldb')
  rmDir('./out/httpse.leveldb')

  const httpseLevelDB = levelup('./out/httpse.leveldb', {compression: false, errorIfExists: true})

  const ruleSets = {}
  for (let id in rulesets.rulesetStrings) {
    ruleSets[id] = rulesets.rulesetStrings[id]
  }

  let batch = httpseLevelDB.batch()
  for (let target in rulesets.targets) {
    let targetRuleSets = []
    rulesets.targets[target].forEach((id) => {
      let ruleset = ruleSets[id]
      if (!ruleset.ruleset.$.default_off && !ruleset.ruleset.$.platform) {
        let rule = {
          r: ruleset.ruleset.rule.map((rule) => {
            if (rule.$.from === '^http:' && rule.$.to === 'https:') {
              return { d: 1 }
            } else {
              return { f: rule.$.from, t: rule.$.to }
            }
          })
        }
        if (ruleset.ruleset.exclusion) {
          rule.e = ruleset.ruleset.exclusion.map((exclusion) => {
            return { p: exclusion.$.pattern }
          })
        }
        targetRuleSets = targetRuleSets.concat(rule)
      }
    })
    let reverseTarget = target.split('.').reverse().join('.')
    if (targetRuleSets.length > 0) {
      batch.put(reverseTarget, JSON.stringify(targetRuleSets), {sync: true})
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
rmDir('./out')
fs.mkdirSync('./out')

console.log('downloading rulesets')
downloadRulesets('./https-everywhere', buildDataFiles)
