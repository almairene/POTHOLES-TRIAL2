// Phone GPS Geolocation & Accelerometer / Jolt Detection

const SensorService = {
  coords: {
    lat: 11.0168,
    lng: 76.9558,
    accuracy: null,
    isLive: false,
    source: "Default"
  },
  watchId: null,
  motionEnabled: false,
  joltThreshold: 6.5, // m/s^2 sudden spike above baseline/gravity
  lastMag: null,
  lastJoltAt: 0,
  onGpsUpdate: null,
  onJoltDetected: null,

  setCoords(lat, lng, accuracy = null, source = "Manual") {
    this.coords = {
      lat: Number(lat),
      lng: Number(lng),
      accuracy: accuracy !== null ? Number(accuracy) : null,
      isLive: this.watchId !== null,
      source
    };
    if (typeof this.onGpsUpdate === "function") {
      this.onGpsUpdate(this.coords);
    }
  },

  fetchCurrentGps() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Geolocation is not supported in this browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.setCoords(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy,
            "GPS"
          );
          resolve(this.coords);
        },
        (err) => {
          reject(new Error(err.message || "Unable to retrieve GPS position."));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    });
  },

  toggleWatchGps() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.coords.isLive = false;
      if (typeof this.onGpsUpdate === "function") {
        this.onGpsUpdate(this.coords);
      }
      return false;
    }

    if (!("geolocation" in navigator)) {
      throw new Error("Geolocation is not supported in this browser.");
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.setCoords(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          "Live GPS"
        );
      },
      (err) => {
        console.warn("Live GPS watch warning:", err.message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 2000 }
    );

    this.coords.isLive = true;
    return true;
  },

  async enableMotionSensor() {
    if (typeof DeviceMotionEvent === "undefined") {
      throw new Error("Accelerometer / DeviceMotion is not supported on this device.");
    }

    if (typeof DeviceMotionEvent.requestPermission === "function") {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== "granted") {
        throw new Error("Motion sensor permission was denied.");
      }
    }

    if (!this.motionEnabled) {
      window.addEventListener("devicemotion", this.handleMotionEvent.bind(this), {
        passive: true
      });
      this.motionEnabled = true;
    }

    return true;
  },

  handleMotionEvent(event) {
    const acc = event.acceleration || event.accelerationIncludingGravity;
    if (!acc) return;

    const x = Number(acc.x || 0);
    const y = Number(acc.y || 0);
    const z = Number(acc.z || 0);
    const totalMag = Math.sqrt(x * x + y * y + z * z);

    // If using accelerationIncludingGravity, subtract ~9.81 m/s^2 gravity baseline
    const netAccel = event.acceleration
      ? totalMag
      : Math.abs(totalMag - 9.81);

    const delta = this.lastMag === null ? netAccel : Math.abs(netAccel - this.lastMag);
    this.lastMag = netAccel;

    const now = Date.now();
    if ((netAccel > this.joltThreshold || delta > this.joltThreshold) && now - this.lastJoltAt > 2500) {
      this.lastJoltAt = now;
      this.triggerJolt(netAccel, "Device Accelerometer");
    }
  },

  simulateJolt() {
    const simulatedForce = Number((11.5 + Math.random() * 6.5).toFixed(2));
    this.triggerJolt(simulatedForce, "Simulated Jolt");
    return simulatedForce;
  },

  triggerJolt(forceMs2, source = "Accelerometer") {
    const gForce = Number((forceMs2 / 9.81).toFixed(2));
    if (typeof this.onJoltDetected === "function") {
      this.onJoltDetected({
        forceMs2: Number(forceMs2.toFixed(2)),
        gForce,
        source,
        coords: { ...this.coords },
        detectedAt: Date.now()
      });
    }
  },

  formatGpsSummary(c = this.coords) {
    const accStr = c.accuracy ? ` (±${Math.round(c.accuracy)}m)` : "";
    return `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}${accStr} [${c.source}]`;
  }
};
