const WeatherService = {
  latest: {
    temperatureC: 29.0,
    precipitationMm: 0.4,
    rainMm: 0.4,
    humidity: 74,
    windKmh: 12.5,
    weatherCode: 2,
    conditionLabel: "Partly Cloudy",
    fetchedAt: Date.now()
  },

  describeWeatherCode(code) {
    if (code === 0) return "Clear Sky";
    if (code === 1) return "Mainly Clear";
    if (code === 2) return "Partly Cloudy";
    if (code === 3) return "Overcast";
    if ([45, 48].includes(code)) return "Fog / Mist";
    if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
    if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
    if ([80, 81, 82].includes(code)) return "Rain Showers";
    if ([95, 96, 99].includes(code)) return "Thunderstorm";
    return "Variable Weather";
  },

  async fetchWeather(lat, lng) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(
      lng
    )}&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,weather_code`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const c = data.current || {};

      this.latest = {
        temperatureC: Number(c.temperature_2m ?? 29),
        precipitationMm: Number(c.precipitation ?? c.rain ?? 0),
        rainMm: Number(c.rain ?? c.precipitation ?? 0),
        humidity: Number(c.relative_humidity_2m ?? 70),
        windKmh: Number(c.wind_speed_10m ?? 10),
        weatherCode: Number(c.weather_code ?? 1),
        conditionLabel: this.describeWeatherCode(Number(c.weather_code ?? 1)),
        fetchedAt: Date.now()
      };
      return this.latest;
    } catch (err) {
      console.warn("Open-Meteo fallback active:", err);
      this.latest = { ...this.latest, fetchedAt: Date.now() };
      return this.latest;
    }
  },

  formatSummary(w = this.latest) {
    return `${w.conditionLabel} • ${w.temperatureC.toFixed(1)}°C • ${w.precipitationMm.toFixed(1)} mm rain • ${w.humidity}% RH • ${w.windKmh.toFixed(1)} km/h`;
  }
};
