const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const STORAGE_KEY = "lri_hazards_v1";
const DB_PATH = "road_intelligence/hazards";

function hasValidFirebaseConfig(cfg) {
  return Boolean(cfg && cfg.apiKey && cfg.databaseURL && !cfg.apiKey.includes("YOUR_"));
}

function getSampleHazards() {
  const now = Date.now();
  return [
    {
      id: "HZ-101",
      roadName: "Avinashi Road - Segment A",
      lat: 11.0245,
      lng: 76.9825,
      severity: "High",
      roadCondition: "Waterlogged",
      reportCount: 12,
      vehicleCount: 4,
      vehicles: ["VEH-101", "VEH-104", "VEH-208", "CIT-09"],
      waterlogged: true,
      status: "Pending",
      assignedCrew: "Unassigned",
      source: "Smartphone GPS + Accelerometer",
      notes: "Deep pothole cluster near lane 2 with rainwater pooling.",
      photoUrl: "",
      createdAt: now - 1000 * 60 * 60 * 14,
      lastVerifiedAt: now - 1000 * 60 * 25
    },
    {
      id: "HZ-102",
      roadName: "Trichy Road - Singanallur Stretch",
      lat: 10.9985,
      lng: 77.0265,
      severity: "Critical",
      roadCondition: "Broken / Gravel",
      reportCount: 15,
      vehicleCount: 6,
      vehicles: ["VEH-102", "VEH-109", "VEH-211", "VEH-305", "CIT-14", "CIT-22"],
      waterlogged: true,
      status: "In Progress",
      assignedCrew: "Coimbatore Patch Crew #2",
      source: "Fleet Vehicle Sensor",
      notes: "Severe surface breakup; high two-wheeler risk during evening rush.",
      photoUrl: "",
      createdAt: now - 1000 * 60 * 60 * 28,
      lastVerifiedAt: now - 1000 * 60 * 40
    },
    {
      id: "HZ-103",
      roadName: "Saravanampatti Main Road",
      lat: 11.0785,
      lng: 76.9998,
      severity: "Medium",
      roadCondition: "Wet / Slippery",
      reportCount: 5,
      vehicleCount: 2,
      vehicles: ["VEH-105", "CIT-31"],
      waterlogged: false,
      status: "Assigned",
      assignedCrew: "North Zone Unit #1",
      source: "Citizen Complaint",
      notes: "Repeated uneven patches reported near bus stop.",
      photoUrl: "",
      createdAt: now - 1000 * 60 * 60 * 8,
      lastVerifiedAt: now - 1000 * 60 * 90
    },
    {
      id: "HZ-104",
      roadName: "RS Puram TV Samy Road",
      lat: 11.0088,
      lng: 76.9522,
      severity: "Low",
      roadCondition: "Dry Asphalt",
      reportCount: 2,
      vehicleCount: 1,
      vehicles: ["VEH-112"],
      waterlogged: false,
      status: "Resolved",
      assignedCrew: "Central Repair Team",
      source: "Smartphone GPS + Accelerometer",
      notes: "Minor depression filled and leveled.",
      photoUrl: "",
      createdAt: now - 1000 * 60 * 60 * 48,
      lastVerifiedAt: now - 1000 * 60 * 60 * 5
    }
  ];
}

const RoadStore = {
  db: null,
  isLiveFirebase: false,
  listeners: [],

  init() {
    if (hasValidFirebaseConfig(FIREBASE_CONFIG) && typeof firebase !== "undefined") {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }
        this.db = firebase.database();
        this.isLiveFirebase = true;
      } catch (err) {
        console.warn("Firebase init failed, falling back to local storage:", err);
        this.isLiveFirebase = false;
      }
    }

    if (!localStorage.getItem(STORAGE_KEY)) {
      this.saveLocal(getSampleHazards());
    }
  },

  loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveLocal(hazards) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hazards));
  },

  subscribe(callback) {
    this.listeners.push(callback);

    if (this.isLiveFirebase && this.db) {
      const ref = this.db.ref(DB_PATH);
      ref.on("value", (snapshot) => {
        const val = snapshot.val();
        if (!val) {
          const seed = this.loadLocal();
          callback(seed);
          return;
        }
        const list = Object.keys(val).map((key) => ({
          id: val[key].id || key,
          ...val[key]
        }));
        this.saveLocal(list);
        callback(list);
      });
      return;
    }

    callback(this.loadLocal());
  },

  notifyLocal(hazards) {
    this.saveLocal(hazards);
    this.listeners.forEach((cb) => cb(hazards));
  },

  async saveHazard(hazard) {
    const current = this.loadLocal();
    const idx = current.findIndex((h) => h.id === hazard.id);
    if (idx >= 0) {
      current[idx] = hazard;
    } else {
      current.unshift(hazard);
    }
    this.notifyLocal(current);

    if (this.isLiveFirebase && this.db) {
      await this.db.ref(`${DB_PATH}/${hazard.id}`).set(hazard);
    }
  },

  async deleteHazard(id) {
    const filtered = this.loadLocal().filter((h) => h.id !== id);
    this.notifyLocal(filtered);

    if (this.isLiveFirebase && this.db) {
      await this.db.ref(`${DB_PATH}/${id}`).remove();
    }
  },

  async replaceAllHazards(hazards) {
    this.notifyLocal(hazards);

    if (this.isLiveFirebase && this.db) {
      const obj = {};
      hazards.forEach((h) => {
        obj[h.id] = h;
      });
      await this.db.ref(DB_PATH).set(obj);
    }
  }
};
