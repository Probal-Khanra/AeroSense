# AeroSense: Multi-Node Environmental & Air Quality Monitoring Platform

AeroSense is an open-source, serverless, IoT-driven air quality monitoring platform powered by the dual-core ESP32 architecture. It features a split-path data pipeline designed for high-performance telemetry and long-term analytical tracking:

* **The High-Frequency Path:** Streams instant, real-time climate and gas indices to a cloud database every 30 seconds to power a live web dashboard.
* **The Analytical Archive Path:** Offloads data to a serverless computing bridge every 5 minutes, running background statistical models and automated database lifecycles inside an organized spreadsheet.

---

## 📁 Repository Architecture

To keep implementation seamless, the codebase is cleanly partitioned into modular hardware, backend, and frontend environments inside the primary replication package:

```text
AeroSense/ (Root)
├── README.md                           # Main Project Directory & Overview (This file)
└── replication_package/                 # Master Deployment & Code Suite
    ├── README.md                       # Comprehensive End-to-End Installation Guide
    ├── 📁 backend/
    │   └── AeroSense_GoogleAppsScript.js # Time-based analytics & database lifecycle engine
    ├── 📁 frontend/
    │   ├── .env.example                # Web environment variables template
    │   ├── package.json                # React interface configuration dependencies
    │   └── 📁 src/                     # Real-time dashboard components & analytics charts
    └── 📁 hardware/
        └── 📁 AeroSense_ESP32_Firmware/
            └── AeroSense_ESP32_Firmware.ino # Node 02 multi-cast streaming C++ firmware
🛠️ System Workflow Visualized
AeroSense splits tasks across your hardware edge and cloud architectures to achieve fast UI loading speeds without risking long-term data bloating:

Plaintext
                  ┌─────────────── [ ESP32 / AeroSense Edge Node ] ───────────────┐
                  │                                                               │
                  │  Reads: AHT20 (Temp/Hum) | PMS5003 (PM) | MQ-2 & MQ-7 (Gas)   │
                  └───────────────────────────────┬───────────────────────────────┘
                                                  │
                         ┌────────────────────────┴────────────────────────┐
                         ▼ (Every 30 Seconds)                              ▼ (Every 5 Minutes)
        ┌──────────────────────────────────┐                     ┌──────────────────────────────────┐
        │  Firebase Realtime Database      │                     │  Google Apps Script API Engine   │
        └────────────────┬─────────────────┘                     └────────────────┬─────────────────┘
                         │                                                        │
                         ▼ (Instant Stream)                                       ▼ (Append Entry)
        ┌──────────────────────────────────┐                     ┌──────────────────────────────────┐
        │  React Frontend Dashboard        │                     │  Google Sheets Data Warehouse    │
        │  • Live Gauges & Status Indicators│                     │  • Raw_Logs (1-Day Buffer)       │
        │  • Historical Charts (API Feed)  │◀────────────────────┤  • Hourly_Archive (14-Day Roll)  │
        └──────────────────────────────────┘  (Fetches Insights) │  • Daily_Summary (Permanent)    │
                                                                 └──────────────────────────────────┘
🚀 Quick Start Deployment
Getting your own AeroSense network up and running is fast. You do not need to manually configure your file environment or directories.

1. Initialize the Environment Instantly
Open your terminal or Windows Command Prompt (cmd) in your working directory and execute the directory framework macro to clone the precise folder layout automatically:

DOS
mkdir replication_package && cd replication_package && mkdir backend frontend hardware\AeroSense_ESP32_Firmware
2. Run the Full Installation Guide
Once your folder tree is instantiated, navigate directly into the replication_package/ directory and open the internal Replication README.md.

The master installation guide will walk you step-by-step through:

🔌 Low-overhead circuit assembly using isolated hardware UART2 registers.

☁️ Generating serverless database instances in the Firebase Console.

📊 Deploying and time-synchronizing the automated Google Apps Script pipeline.

💻 Launching your local React development console and compiling production files for free hosting on Netlify.

💡 Acknowledgments & Engineering Process
AeroSense was built with a strong focus on physical hardware engineering, sensor calibration, and structural system logic. Large language models were leveraged throughout the development cycle as a professional force multiplier—specifically assisting with database stream layouts, automated scripts tuning, and troubleshooting edge-case firmware bugs.

🛡️ License
This project is open-source and registered under the MIT License. Feel free to use, modify, and scale the node topology for your own environmental or industrial monitoring systems.
