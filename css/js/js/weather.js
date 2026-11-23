// Open-Meteo Live Weather & Rainfall Integration

const WeatherService = {
  latest: {
    temperatureC: 28.5,
    precipitationMm: 1.8,
    rainMm: 1.8,
    weatherCode: 61,
    conditionLabel: "Light Rain (Fallback)",
    fetchedAt: Date.now()
  },

  describeWeatherCode(code) {
    if (code === 0) return "Clear Sky";
    if ([1, 2, 3].includes(code)) return "Partly Cloudy / Overcast";
    if ([45, 48].includes(code)) return "Fog / Mist";
    if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
    if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
    if ([71, 73, 75, 77].includes(code)) return "Snow / Ice";
    if ([80, 81, 82].includes(code)) return "Rain Showers";
    if ([95, 96, 99].includes(code)) return "Thunderstorm";
    return "Variable Weather";
  },

  async fetchWeather(lat, lng) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(
      lng
    )}&current=temperature_2m,precipitation,rain,weather_code`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const current = data.current || {};

      const precipitationMm = Number(current.precipitation ?? current.rain ?? 0);
      const rainMm = Number(current.rain ?? current.precipitation ?? 0);
      const temperatureC = Number(current.temperature_2m ?? 28);
      const code = Number(current.weather_code ?? 0);

      this.latest = {
        temperatureC,
        precipitationMm,
        rainMm,
        weatherCode: code,
        conditionLabel: this.describeWeatherCode(code),
        fetchedAt: Date.now()
      };
      return this.latest;
    } catch (err) {
      console.warn("Open-Meteo fetch failed, using fallback weather:", err);
      this.latest = {
        ...this.latest,
        fetchedAt: Date.now()
      };
      return this.latest;
    }
  },

  formatSummary(w = this.latest) {
    const rainText = `${w.precipitationMm.toFixed(1)} mm rain`;
    return `${w.conditionLabel} • ${w.temperatureC.toFixed(1)}°C • ${rainText}`;
  }
};
