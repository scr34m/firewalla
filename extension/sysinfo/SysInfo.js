/**
 * Created by Melvin Tu on 04/01/2017.
 */

'use strict';

let instance = null;
let log = require("../../net2/logger.js")("SysInfo", "info");

let fs = require('fs');
let util = require('util');

let f = require('../../net2/Firewalla.js');
let fHome = f.getFirewallaHome();

let userID = f.getUserID();

//let SysManager = require('../../net2/SysManager');
//let sysManager = new SysManager();

let os  = require('os-utils');

let redis = require('redis');
let rclient = redis.createClient();
let async = require('async');

var cpuUsage = 0;
let memUsage = 0;
let realMemUsage = 0;
let usedMem = 0;
let allMem = 0;
let curTemp = 0;
let peakTemp = 0;

let conn = 0;
let peakConn = 0;

let redisMemory = 0;

let updateFlag = 0;

let updateInterval = 30 * 1000; // every 30 seconds

function update() {
  os.cpuUsage((v) => {
    log.debug( 'CPU Usage (%): ' + v );
    cpuUsage = v;
  });

  getRealMemoryUsage();
  getTemp();
  getConns();
  getRedisMemoryUsage();

  if(updateFlag) {
    setTimeout(() => { update(); }, updateInterval);
  }
}

function startUpdating() {
  updateFlag = 1;
  update();
}

function stopUpdating() {
  updateFlag = 0;
}

function getRealMemoryUsage() {
  let spawn = require('child_process').spawn;
  let prc = spawn('free',  []);
  
  prc.stdout.setEncoding('utf8');
  prc.stdout.on('data', function (data) {
    var str = data.toString()
    var lines = str.split(/\n/g);
    for(var i = 0; i < lines.length; i++) {
      lines[i] = lines[i].split(/\s+/);
    }

    usedMem = parseInt(lines[1][2]);
    allMem = parseInt(lines[1][1]);
    realMemUsage = 1.0 * usedMem / allMem;
    log.info("Memory Usage: ", usedMem, " ", allMem, " ", realMemUsage);
    
  });
}

function getTemp() {
  let tempFile = "/sys/class/thermal/thermal_zone0/temp";
  fs.readFile(tempFile, (err, data) => {
    if(err) {
      log.error("Temperature is not supported");
      curTemp = -1;
    } else {
      curTemp = parseInt(data);
      log.info("Current Temp: ", curTemp);
      peakTemp = peakTemp > curTemp ? peakTemp : curTemp;
    }
  });
}

function getUptime() {
  return process.uptime();
}

function getTimestamp() {
  return new Date();
}

function getConns() {
  // get conns in last 24 hours
  rclient.keys('flow:conn:*', (err, keys) => {
    if(err) {
      conn = -1;
      return;
    }

    let countConns = function(key, callback) {
      rclient.zcount(key, '-inf', '+inf', callback);
    }
    
    async.map(keys, countConns, (err, results) => {
      if(results.length > 0) {
        conn = results.reduce((a,b) => (a+b));
        peakConn = peakConn > conn ? peakConn : conn;
      }
    });

  });
}

function getRedisMemoryUsage() {
  let cmd = "redis-cli info | grep used_memory: | awk -F: '{print $2}'";
  require('child_process').exec(cmd, (err, stdout, stderr) => {
    if(!err) {
      redisMemory = stdout.replace(/\r?\n$/,'');
    }
  });
}

function getSysInfo() {
  let sysinfo = {
    cpu: cpuUsage,
    mem: 1 - os.freememPercentage(),
    realMem: realMemUsage,
    load1: os.loadavg(1),
    load5: os.loadavg(5),
    load15: os.loadavg(15),
    curTemp: curTemp,
    peakTemp: peakTemp,
    timestamp: getTimestamp(),
    uptime: getUptime(),
    conn: conn,
    peakConn: peakConn,
    redisMem: redisMemory
  }

  return sysinfo;
}

module.exports = {
  getSysInfo: getSysInfo,
  startUpdating: startUpdating,
  stopUpdating: stopUpdating,
  getRealMemoryUsage:getRealMemoryUsage
};