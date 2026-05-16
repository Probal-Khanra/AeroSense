// ============================================================
//  AeroSense AQM — Node 1 (BCREC Durgapur)
//  Sensors : AHT20B (I2C 21/22), MQ2 (GPIO34), MQ7 (GPIO35)
//            PMS5003 (UART1 — RX=GPIO3, TX=GPIO1)
//  Display : LCD 16x2 I2C (same bus, 21/22)
//  Backend : Firebase RTDB (30s) + Google Sheets (5-min slot)
//
//  ⚠️  GPIO3/GPIO1 = RX0/TX0 = USB debug pins.
//      Disconnect USB before deploying; Serial.print may
//      interfere with PMS5003 packets while USB is attached.
// ============================================================

#define FIREBASE_DISABLE_CLOUDMESSAGING
#define FIREBASE_DISABLE_CLOUDSTORAGE
#define FIREBASE_DISABLE_FCM
#define FIREBASE_DISABLE_FIRESTORE
#define FIREBASE_DISABLE_FUNCTIONS

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <LiquidCrystal_I2C.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ============================================================
//  WIFI & FIREBASE CONFIG
// ============================================================
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define API_KEY       "YOUR_FIREBASE_API_KEY"
#define DATABASE_URL  "YOUR_FIREBASE_DATABASE_URL"

const char* googleScriptURL = "YOUR_GOOGLE_APPS_SCRIPT_URL";

// ============================================================
//  DEVICE IDENTITY
// ============================================================
String deviceID       = "device_1";
String deviceName     = "BCREC Durgapur";
String deviceLocation = "BCREC Durgapur";

// ============================================================
//  PIN DEFINITIONS
// ============================================================
#define I2C_SDA   21    // AHT20B + LCD
#define I2C_SCL   22
#define MQ2_PIN   34    // Analog ADC1
#define MQ7_PIN   35    // Analog ADC1
#define PMS_RX     3    // GPIO3 = RX0 on board  ← PMS5003 TX
#define PMS_TX     1    // GPIO1 = TX0 on board  → PMS5003 RX
#define LCD_ADDR  0x27  // Change to 0x3F if LCD stays blank
#define LCD_COLS  16
#define LCD_ROWS   2

// ============================================================
//  SHARED SENSOR DATA
// ============================================================
struct SensorData {
  float temp     = 0.0;
  float humidity = 0.0;
  int   pm25     = 0;
  int   pm10     = 0;
  int   mq2      = 0;
  int   mq7      = 0;
} liveData;

SemaphoreHandle_t dataMutex;

// ============================================================
//  HARDWARE OBJECTS
// ============================================================
Adafruit_AHTX0    aht;
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
FirebaseData      fbdo;
FirebaseAuth      auth;
FirebaseConfig    config;

// Use Serial1 mapped to RX0/TX0 pins so Serial (USB) stays intact
// during development. In production just the PMS5003 is on these pins.
HardwareSerial pmsSerial(1);   // UART1

bool ahtOK = false;
bool pmsOK = false;

TaskHandle_t FirebaseTaskHandle;
TaskHandle_t GoogleTaskHandle;

// ============================================================
//  PMS5003 PACKET PARSER
// ============================================================
bool readPMS5003(int &pm25_out, int &pm10_out) {
  while (pmsSerial.available() >= 32) {
    if (pmsSerial.peek() != 0x42) { pmsSerial.read(); continue; }

    uint8_t buf[32];
    pmsSerial.readBytes(buf, 32);

    if (buf[0] != 0x42 || buf[1] != 0x4D) continue;

    uint16_t sum = 0;
    for (int i = 0; i < 30; i++) sum += buf[i];
    if (sum != ((buf[30] << 8) | buf[31])) continue;

    // Atmospheric PM (bytes 12-15)
    pm25_out = (buf[12] << 8) | buf[13];
    pm10_out = (buf[14] << 8) | buf[15];
    return true;
  }
  return false;
}

// ============================================================
//  LCD ROTATING DISPLAY  (screen 0-2)
// ============================================================
void updateLCD() {
  static uint8_t screen = 0;
  lcd.clear();

  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(200))) {
    float t   = liveData.temp;
    float h   = liveData.humidity;
    int p25   = liveData.pm25;
    int p10   = liveData.pm10;
    int g2    = liveData.mq2;
    int g7    = liveData.mq7;
    xSemaphoreGive(dataMutex);

    switch (screen % 3) {
      case 0:
        lcd.setCursor(0, 0);
        lcd.print("T:"); lcd.print(t, 1);
        lcd.print("C H:"); lcd.print((int)h); lcd.print("%");
        lcd.setCursor(0, 1);
        lcd.print("PM2.5:"); lcd.print(p25);
        lcd.print(" 10:"); lcd.print(p10);
        break;
      case 1:
        lcd.setCursor(0, 0);
        lcd.print("MQ2(LPG):"); lcd.print(g2);
        lcd.setCursor(0, 1);
        lcd.print("MQ7(CO): "); lcd.print(g7);
        break;
      case 2:
        lcd.setCursor(0, 0); lcd.print("AeroSense v2.0");
        lcd.setCursor(0, 1); lcd.print("BCREC Durgapur");
        break;
    }
  }
  screen++;
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  // Keep Serial for debug (USB). It shares GPIO3/GPIO1 with pmsSerial
  // at the hardware level — disconnect PMS5003 during flashing.
  Serial.begin(115200);

  // I2C
  Wire.begin(I2C_SDA, I2C_SCL);

  // LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print("AeroSense v2.0");
  lcd.setCursor(0, 1); lcd.print("Booting...");

  // AHT20B
  if (aht.begin()) {
    ahtOK = true;
    Serial.println("[OK] AHT20B");
  } else {
    Serial.println("[FAIL] AHT20B — check wiring");
    lcd.setCursor(0, 1); lcd.print("AHT20 FAIL!     ");
    delay(1500);
  }

  // PMS5003 on UART1 → GPIO3 (RX), GPIO1 (TX)
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);
  Serial.println("[OK] PMS5003 UART1 (RX0/TX0)");

  // WiFi
  lcd.setCursor(0, 1); lcd.print("WiFi...         ");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[..] WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\n[OK] WiFi");
  lcd.setCursor(0, 1); lcd.print("WiFi OK!        ");
  delay(400);

  // NTP — IST (UTC +5:30 = 19800 s)
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
  lcd.setCursor(0, 1); lcd.print("Time Sync...    ");
  Serial.print("[..] NTP");
  while (time(NULL) < 1000000) { delay(500); Serial.print("."); }
  Serial.println("\n[OK] Time Synced");

  // Firebase
  config.api_key      = API_KEY;
  config.database_url = DATABASE_URL;
  Firebase.signUp(&config, &auth, "", "");
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // Mutex
  dataMutex = xSemaphoreCreateMutex();

  // FreeRTOS Tasks
  xTaskCreatePinnedToCore(firebaseTask, "FirebaseTask", 10000, NULL, 1, &FirebaseTaskHandle, 1);
  xTaskCreatePinnedToCore(googleTask,   "GoogleTask",   20000, NULL, 1, &GoogleTaskHandle,   0);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("AeroSense LIVE");
  lcd.setCursor(0, 1); lcd.print("BCREC Durgapur");
  Serial.println("[OK] Node 1 — BCREC Durgapur — Operational");
}

void loop() { vTaskDelete(NULL); }

// ============================================================
//  TASK 1 — SENSOR READ + FIREBASE LIVE SYNC  [Core 1 / 30 s]
// ============================================================
void firebaseTask(void *pvParameters) {
  int lcdCycle = 0;

  for (;;) {
    // AHT20B
    if (ahtOK) {
      sensors_event_t hEv, tEv;
      aht.getEvent(&hEv, &tEv);
      if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(500))) {
        liveData.temp     = tEv.temperature;
        liveData.humidity = hEv.relative_humidity;
        xSemaphoreGive(dataMutex);
      }
    }

    // MQ2 / MQ7
    if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(500))) {
      liveData.mq2 = analogRead(MQ2_PIN);
      liveData.mq7 = analogRead(MQ7_PIN);
      xSemaphoreGive(dataMutex);
    }

    // PMS5003
    int p25 = 0, p10 = 0;
    if (readPMS5003(p25, p10)) {
      if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(500))) {
        liveData.pm25 = p25;
        liveData.pm10 = p10;
        xSemaphoreGive(dataMutex);
      }
      pmsOK = true;
    }

    // LCD rotate every 6 cycles
    if (++lcdCycle >= 6) { updateLCD(); lcdCycle = 0; }

    // Firebase push
    if (Firebase.ready() && WiFi.status() == WL_CONNECTED) {
      FirebaseJson json, data, hardware;

      hardware.set("temphu",  ahtOK ? 1 : 0);
      hardware.set("mq2",     1);
      hardware.set("mq7",     1);
      hardware.set("pms5003", pmsOK ? 1 : 0);

      if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(500))) {
        data.set("temp",     liveData.temp);
        data.set("humidity", liveData.humidity);
        data.set("pm25",     liveData.pm25);
        data.set("pm10",     liveData.pm10);
        data.set("mq2",      liveData.mq2);
        data.set("mq7",      liveData.mq7);
        xSemaphoreGive(dataMutex);
      }

      json.set("data",        data);
      json.set("hardware",    hardware);
      json.set("location",    deviceLocation);
      json.set("name",        deviceName);
      json.set("lastUpdated", (uint32_t)time(NULL));
      json.set("key",         "friedrice");

      String path = "/devices/" + deviceID;
      if (Firebase.RTDB.updateNode(&fbdo, path.c_str(), &json)) {
        Serial.println("[FB] Live Sync OK");
      } else {
        Serial.printf("[FB] ERR: %s\n", fbdo.errorReason().c_str());
      }
    }

    vTaskDelay(pdMS_TO_TICKS(30000));
  }
}

// ============================================================
//  TASK 2 — 5-MIN GOOGLE SHEETS ARCHIVE  [Core 0]
// ============================================================
void googleTask(void *pvParameters) {
  const int nodeOffset = 0; // device_1 posts right on the slot (0 s offset)

  for (;;) {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo)) { vTaskDelay(pdMS_TO_TICKS(10000)); continue; }

    int wait = (5 * 60) - ((timeinfo.tm_min % 5) * 60 + timeinfo.tm_sec) + nodeOffset;
    if (wait <= 0) wait += (5 * 60);

    Serial.printf("[GS] Archive in %d s\n", wait);
    vTaskDelay(pdMS_TO_TICKS((uint32_t)wait * 1000));

    if (WiFi.status() == WL_CONNECTED) {
      WiFiClientSecure client; client.setInsecure();
      HTTPClient http; http.setTimeout(20000);

      if (http.begin(client, googleScriptURL)) {
        http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
        http.addHeader("Content-Type", "application/json");

        FirebaseJson json;
        if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(1000))) {
          json.set("id",       deviceID);
          json.set("name",     deviceName);
          json.set("location", deviceLocation);
          json.set("pm25",     liveData.pm25);
          json.set("pm10",     liveData.pm10);
          json.set("mq2",      liveData.mq2);
          json.set("mq7",      liveData.mq7);
          json.set("temp",     liveData.temp);
          json.set("humidity", liveData.humidity);
          xSemaphoreGive(dataMutex);
        }

        String body;
        json.toString(body, true);
        Serial.println("[GS] POST → Google Sheets");
        int code = http.POST(body);
        Serial.printf("[GS] Response: %d\n", code);
        http.end();
      }
    }

    vTaskDelay(pdMS_TO_TICKS(5000));
  }
}
