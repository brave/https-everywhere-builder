'use strict'
const fs = require('fs')
const path = require('path')

module.exports.rmDir = function (dirPath) {
  try {
    var files = fs.readdirSync(dirPath)
  } catch (e) {
    return
  }
  if (files.length > 0) {
    for (var i = 0; i < files.length; i++) {
      var filePath = path.join(dirPath, files[i])
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath)
      } else {
        module.exports.rmDir(filePath)
      }
    }
  }
  fs.rmdirSync(dirPath)
}
