/**
 * ════════════════════════════════════════════════════════════════════════════
 * AeroSense Node — Master Controller Script (TIME-BASED Replication v2)
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * Instructions:
 *   1. Create a Google Spreadsheet with three tabs named:
 *      "Raw_Logs", "Hourly_Archive", and "Daily_Summary".
 *   2. Go to Extensions ➔ Apps Script, delete the template code, and paste this code.
 *   3. Click Deploy ➔ New Deployment. Choose "Web App".
 *      - Execute as: "Me"
 *      - Who has access: "Anyone"
 *   4. Deploy and copy the Web App URL. Use this URL in your ESP32 code.
 *   5. Go to the project settings (gear icon) and set the Timezone to match your region.
 *   6. Run setupTriggers() once manually in the editor to activate automated archives.
 */

// ==========================================
// 🌐 1. THE DATA API (doGet)
// ==========================================
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var type = (e && e.parameter && e.parameter.type) ? e.parameter.type : 'raw';
    var sheet;

    if (type === 'hourly') {
      sheet = ss.getSheetByName("Hourly_Archive");
    } else if (type === 'daily') {
      sheet = ss.getSheetByName("Daily_Summary");
    } else {
      sheet = ss.getSheetByName("Raw_Logs");
    }

    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not found: " + type }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = data[0];
    var jsonResponse = [];

    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[headers[j]] = data[i][j];
      }
      jsonResponse.push(obj);
    }

    return ContentService.createTextOutput(JSON.stringify(jsonResponse))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ==========================================
// 📡 2. THE DATA INGESTION (doPost)
// Receives 5-minute flat JSON from ESP32
// ==========================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Wait up to 15 seconds to prevent race conditions during concurrent node posts
    lock.waitLock(15000); 

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rawSheet  = ss.getSheetByName("Raw_Logs");
    var hourSheet = ss.getSheetByName("Hourly_Archive");

    if (!rawSheet || !hourSheet) {
      return ContentService.createTextOutput("Error: Database sheets not found.")
        .setMimeType(ContentService.MimeType.TEXT);
    }

    var jsonData = JSON.parse(e.postData.contents);
    var now = new Date();

    // ── Step A: Append raw reading to Raw_Logs (10 columns) ──
    var rawRow = [
      now,
      jsonData.id,
      jsonData.name,
      jsonData.location,
      jsonData.pm25,
      jsonData.pm10,
      jsonData.mq2,
      jsonData.mq7,
      jsonData.temp,
      jsonData.humidity
    ];
    rawSheet.appendRow(rawRow);

    // ── Step B: Hourly Analytics (TIME-BASED) ──
    // Fires on the first POST of every hour (minutes 0–5).
    // Calculates stats for the PREVIOUS hour using timestamp filtering.
    // e.g. at 9:02, it calculates stats for all readings from 8:00–8:59.
    var mins = now.getMinutes();
    if (mins < 6) {

      // Define the previous hour window
      var prevHourEnd = new Date(now);
      prevHourEnd.setMinutes(0, 0, 0); // Top of current hour (e.g. 9:00:00)
      var prevHourStart = new Date(prevHourEnd.getTime() - 3600000); // e.g. 8:00:00

      // ── Duplicate guard (node-aware) ──
      var isDuplicate = false;
      var hourLastRow = hourSheet.getLastRow();

      if (hourLastRow >= 2) {
        var checkStart = Math.max(2, hourLastRow - 19);
        var checkCount = hourLastRow - checkStart + 1;
        var recentRows = hourSheet.getRange(checkStart, 1, checkCount, 2).getValues();

        for (var c = 0; c < recentRows.length; c++) {
          var entryTs = recentRows[c][0];
          var entryNode = recentRows[c][1];
          if (entryTs instanceof Date && entryNode === jsonData.name) {
            // Check if this entry's hour matches the previous hour we're about to write
            if (entryTs.getHours() === prevHourStart.getHours() &&
                entryTs.toDateString() === prevHourStart.toDateString()) {
              isDuplicate = true;
              break;
            }
          }
        }
      }

      if (!isDuplicate) {
        var hourlyStats = calculateStatsByTime(rawSheet, prevHourStart, prevHourEnd, jsonData.name);
        if (hourlyStats) {
          hourSheet.appendRow(hourlyStats);
        }
      }
    }

    return ContentService.createTextOutput("Success");

  } catch (err) {
    Logger.log("doPost Error: " + err.message);
    return ContentService.createTextOutput("Error: " + err.message);
  } finally {
    lock.releaseLock();
  }
}


// ==========================================
// 📊 3. STANDALONE DAILY SUMMARY
// ── Trigger: Day timer → 11 PM to Midnight ──
// ==========================================
function calculateDailySummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet   = ss.getSheetByName("Raw_Logs");
  var dailySheet = ss.getSheetByName("Daily_Summary");

  var lastRow = rawSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("Daily Summary: No raw data to summarize. Skipping.");
    return;
  }

  // ── Duplicate guard: skip if today's date already exists ──
  var tz = Session.getScriptTimeZone();
  var today = new Date();
  var todayStr = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  var dailyData = dailySheet.getDataRange().getValues();
  for (var i = 1; i < dailyData.length; i++) {
    if (dailyData[i][0] instanceof Date) {
      var existingStr = Utilities.formatDate(dailyData[i][0], tz, "yyyy-MM-dd");
      if (existingStr === todayStr) {
        Logger.log("Daily Summary: Already exists for " + todayStr + ". Skipping.");
        return;
      }
    }
  }

  // ── Time window: today 00:00:00 to 23:59:59 ──
  var startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  var endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // ── Find all unique node names in Raw_Logs ──
  var numRows = lastRow - 1;
  var nameCol = rawSheet.getRange(2, 3, numRows, 1).getValues();
  var nodeNames = [];
  var seen = {};
  for (var j = 0; j < nameCol.length; j++) {
    var name = nameCol[j][0];
    if (name !== "" && !seen[name]) {
      seen[name] = true;
      nodeNames.push(name);
    }
  }

  if (nodeNames.length === 0) {
    Logger.log("Daily Summary: No node names found in Raw_Logs.");
    return;
  }

  // ── Write one summary row per node (TIME-BASED) ──
  for (var n = 0; n < nodeNames.length; n++) {
    var stats = calculateStatsByTime(rawSheet, startOfDay, endOfDay, nodeNames[n]);
    if (stats) {
      dailySheet.appendRow(stats);
      Logger.log("Daily Summary saved for node: " + nodeNames[n]);
    } else {
      Logger.log("Daily Summary: No data found for node " + nodeNames[n] + " on " + todayStr);
    }
  }
}


// ==========================================
// 🧮 4. THE ANALYTICS ENGINE (TIME-BASED)
// Filters Raw_Logs by [startTime, endTime) AND nodeName
// Returns: [Timestamp, Node, PM25_Avg/Min/Max, PM10_..., MQ2_..., MQ7_..., Temp_..., Hum_...]
// Returns null if no matching rows found
// ==========================================
function calculateStatsByTime(sourceSheet, startTime, endTime, nodeName) {
  var lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) return null;

  var numRows = lastRow - 1;

  // Read columns 1 (Timestamp), 3 (Name), 5-10 (Sensors) 
  var allData = sourceSheet.getRange(2, 1, numRows, 10).getValues();

  // Filter: timestamp in [startTime, endTime) AND name matches
  var filtered = [];
  for (var i = 0; i < allData.length; i++) {
    var rowTime = allData[i][0]; // Column 1: Timestamp
    var rowName = allData[i][2]; // Column 3: Name

    if (rowTime instanceof Date &&
        rowName === nodeName &&
        rowTime.getTime() >= startTime.getTime() &&
        rowTime.getTime() < endTime.getTime()) {
      filtered.push([
        allData[i][4],  // PM25
        allData[i][5],  // PM10
        allData[i][6],  // MQ2
        allData[i][7],  // MQ7
        allData[i][8],  // Temp
        allData[i][9]   // Humidity
      ]);
    }
  }

  // No matching data for this time window
  if (filtered.length === 0) return null;

  // Calculate Avg, Min, Max for each of the 6 sensor columns
  var result = [new Date(), nodeName];

  for (var col = 0; col < 6; col++) {
    var values = [];
    for (var r = 0; r < filtered.length; r++) {
      var v = filtered[r][col];
      if (v !== "" && v !== null && v !== undefined && !isNaN(v)) {
        values.push(Number(v));
      }
    }

    if (values.length > 0) {
      var sum = 0;
      for (var s = 0; s < values.length; s++) { sum += values[s]; }
      var avg = (sum / values.length).toFixed(2);
      var min = Math.min.apply(null, values);
      var max = Math.max.apply(null, values);
      result.push(Number(avg), min, max);
    } else {
      result.push(0, 0, 0);
    }
  }

  return result;
}


// ==========================================
// 🧹 5. AUTOMATED CLEANUP
// ==========================================

/**
 * Clears Raw_Logs daily.
 * ── Trigger: Day timer → 1 AM to 2 AM ──
 */
function cleanupRawLogs() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Raw_Logs");
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
    Logger.log("Raw Logs cleared. Deleted " + (lastRow - 1) + " rows.");
  } else {
    Logger.log("Raw Logs: Nothing to clear.");
  }
}

/**
 * Deletes Hourly_Archive rows older than 14 days.
 * ── Trigger: Day timer → 1:30 AM daily ──
 */
function cleanupHourlyLogs() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Hourly_Archive");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("Hourly Archive: Nothing to clear.");
    return;
  }

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  var timestamps = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var deleteCount = 0;

  for (var i = 0; i < timestamps.length; i++) {
    if (timestamps[i][0] instanceof Date && timestamps[i][0].getTime() < cutoff.getTime()) {
      deleteCount++;
    } else {
      break; // Hit a recent row, stop
    }
  }

  if (deleteCount > 0) {
    sheet.deleteRows(2, deleteCount);
    Logger.log("Hourly Archive: Deleted " + deleteCount + " rows older than 14 days.");
  } else {
    Logger.log("Hourly Archive: No rows older than 14 days.");
  }
}


// ==========================================
// 🔧 6. UTILITY: SETUP ALL TRIGGERS
// Run this ONCE manually to create all time-based triggers.
// ==========================================
function setupTriggers() {
  // Delete existing triggers to avoid duplicates
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    ScriptApp.deleteTrigger(existing[i]);
  }
  Logger.log("Cleared " + existing.length + " existing triggers.");

  // Trigger 1: Daily Summary at 11:55 PM every day
  ScriptApp.newTrigger("calculateDailySummary")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .nearMinute(55)
    .create();
  Logger.log("Created: calculateDailySummary → 11:55 PM daily");

  // Trigger 2: Cleanup Raw Logs at 1 AM every day
  ScriptApp.newTrigger("cleanupRawLogs")
    .timeBased()
    .everyDays(1)
    .atHour(1)
    .nearMinute(0)
    .create();
  Logger.log("Created: cleanupRawLogs → 1:00 AM daily");

  // Trigger 3: Cleanup Hourly Archive at 1:30 AM every day (rolling 14-day)
  ScriptApp.newTrigger("cleanupHourlyLogs")
    .timeBased()
    .everyDays(1)
    .atHour(1)
    .nearMinute(30)
    .create();
  Logger.log("Created: cleanupHourlyLogs → 1:30 AM daily (14-day rolling)");

  Logger.log("All triggers configured successfully.");
}
