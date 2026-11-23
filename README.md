# POTHOLES-TRIAL2
# Live Road Intelligence Dashboard
**A Crowdsourced, Predictive and Cooperative Road Intelligence System**

An interactive, real-time pothole detection, risk scoring, and road maintenance management system built with **Leaflet + OpenStreetMap**, **Firebase Realtime Database**, **Open-Meteo Weather API**, and **Smartphone GPS / Accelerometer** telemetry.

---

## Core Intelligence Pillars
1. **Collective Intelligence:** Multiple vehicles and citizens verify the same road hazard; duplicate reports within `20m` automatically merge into a single verified cluster.
2. **Predictive Intelligence:** A dynamic **Road Risk Score (`0–100`)** prioritizes high-risk segments using report frequency, vehicle consensus, impact severity, report recency, and waterlogging/rainfall data.
3. **Cooperative Intelligence:** Approaching vehicles receive timely proximity and speed warnings ahead of verified hazards.

---

## Five Integrated Modules
| Module | Function |
| :--- | :--- |
| **1. Live Pothole Map** | Displays reported potholes with GPS coordinates, severity/status filters, click-to-report map pin selection, and live GPS centering. |
| **2. Vehicle Alert Network** | Calculates Haversine proximity distance and triggers warnings for approaching vehicles. |
| **3. Crowd Verification** | Detects duplicate reports within `20m`, merges them, and tracks unique vehicle confirmations. |
| **4. Road Risk Prediction** | Computes and explains the dynamic `0–100` Road Risk Score per road segment. |
| **5. Authority Portal** | Allows citizens to file complaints and authorities to assign repair crews, update status (`Pending` → `Assigned` → `In Progress` → `Resolved`), and track resolution. |

---

## Connecting Your Own Firebase Realtime Database (Optional)
The dashboard runs immediately out-of-the-box in **Demo / Local Mode**. To sync live across multiple phones and laptops:
1. Create a free project in the [Firebase Console](https://console.firebase.google.com/) and enable **Realtime Database**.
2. Open `js/firebase-config.js` and paste your `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.
3. Commit the change—the status badge in the top bar will switch to **Firebase Live Sync**.
