# AeroSense: Cloud, Backend & Frontend Deployment Guide

This guide provides step-by-step instructions for setting up the Firebase database, Google Sheets backend, local React environment, production hosting via Netlify Drag & Drop, and verifying the end-to-end integration.

---

## Cloud & Database Setup (Firebase Part)

### Step 1: Firebase Realtime Database Setup
1. **Create a Firebase Project**: Sign in to the [Firebase Console](https://console.firebase.google.com), click **Add Project**, and create a new project.
2. **Initialize the Database**: Select **Realtime Database** from the left-hand menu. Click **Create Database**, choose a server location near your nodes, and choose to start in **Locked Mode**.
3. **Configure Security Rules**: Under the **Rules** tab, replace the default configuration with the following rules to allow the ESP32 and React dashboard to read and write data:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
4. **Generate Web App Credentials**: Click the **Gear Icon** (Project Settings) ➔ **General**. Under the **Your Apps** section, click the web icon (`</>`) to register your web application. Save the configuration keys shown in the `firebaseConfig` block (specifically the API Key, Database URL, and App ID) for your dashboard environment setup.

---

## Backend & Spreadsheet Setup (Google Sheets Part)

### Step 2: Google Sheets & Apps Script Setup
1. **Initialize the Spreadsheet**: Create a new Google Spreadsheet and add three sheets (tabs) named exactly:
   - `Raw_Logs`
   - `Hourly_Archive`
   - `Daily_Summary`
2. **Access Apps Script Editor**: In the spreadsheet toolbar, navigate to **Extensions** ➔ **Apps Script**.
3. **Deploy the Script**: Copy the contents of `AeroSense_GoogleAppsScript.js` and paste it, overwriting any default placeholder code.
4. **Synchronize Timezones**: Click on the **Gear Icon** (Project Settings) on the left panel. Enable the checkbox for **"Show appsscript.json manifest file in editor"**. Return to the editor, open `appsscript.json`, and make sure the timezone field matches your region (e.g. `Asia/Kolkata`). Verify that your Google Sheet timezone matches this exactly by going to **File** ➔ **Settings** in the spreadsheet.
5. **Deploy the Web App**: Click **Deploy** (top-right) ➔ **New Deployment**. Select **Web App**, set *Execute as* to **Me**, and *Who has access* to **Anyone**. Click **Deploy**, authorize permissions using your Google Account, and copy the generated **Web App URL**.
6. **Configure Automated Triggers**: Select `setupTriggers` from the function list at the top of the editor and click **Run**. This schedules the aggregate statistics scripts and database cleanups to run automatically in the background.

---

## Frontend Web Dashboard Setup

### Step 3: Environment Configuration & Local Run
1. **Create Local Environment File**: Open a terminal, navigate to the frontend directory, copy the `.env.example` file, and name it `.env`:
   ```bash
   cp .env.example .env
   ```
2. **Insert Credentials**: Open the new `.env` file and replace the placeholders with your Firebase credentials, the Google Apps Script Web App URL, and a secret logging key matching the validation key compiled in your ESP32 code.
3. **Install Dependencies**: Execute the package installation command to download the React packages:
   ```bash
   npm install
   ```
4. **Launch Local Server**: Start the local development server:
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser to view the real-time gauges.

### Step 4: Production Hosting (Netlify Drag & Drop)
1. **Create a Production Build**: Run the build script in your terminal to compile your React app into static files (which automatically bakes the environment variables from your local `.env` file into the build):
   ```bash
   npm run build
   ```
2. **Sign Up / Log In**: Create a free account or log in at [Netlify](https://www.netlify.com).
3. **Drag and Drop**: Go to your Netlify dashboard, select the **Sites** tab, and drag and drop the generated `build/` directory directly onto Netlify's upload area.
4. **Deploy**: Netlify will immediately host your client-side React dashboard on a fast, secure HTTPS URL.

---

## System Verification & Live Testing

### Step 5: End-to-End Integration Check
1. **Hardware Telemetry Check**: Power up the ESP32 circuit and open the Serial Monitor (115200 baud). Ensure it connects to your WiFi, runs the NTP time sync successfully, and logs `[FB] Live Sync OK`.
2. **Local Readout Check**: Confirm that the physical LCD display screen rotates between the three telemetry pages (Temp/Humidity, MQ Gas sensors, PM details and System status) every 10 seconds.
3. **Realtime Database verification**: Open your Firebase Realtime Database dashboard. Verify that a new node under `/devices/device_1` is created and updates live sensor values every 30 seconds.
4. **Spreadsheet logs verification**: Check your Google Sheet. Verify that a raw data row is successfully posted to `Raw_Logs` every 5 minutes.
5. **Analytics verification**: Check the History tab of the React Web Dashboard after a few hours of operation to verify that hourly and daily trends are plotting analytics correctly.
