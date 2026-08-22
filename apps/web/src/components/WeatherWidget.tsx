import { useEffect, useState } from 'react';

/**
 * Open-Meteo: free, no API key, permissive CORS for direct browser calls — chosen specifically so
 * this stays a client-only decoration with no backend surface, matching what it actually is (a
 * cosmetic topbar widget, not a business feature that needs an adapter behind the API).
 */
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REFRESH_MS = 15 * 60 * 1000;

// WMO weather codes (the standard Open-Meteo reports) mapped to one emoji each.
const WEATHER_EMOJI: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌦️',
  56: '🌧️',
  57: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '🌨️',
  77: '🌨️',
  80: '🌦️',
  81: '🌦️',
  82: '🌦️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

function emojiFor(code: number): string {
  return WEATHER_EMOJI[code] ?? '🌡️';
}

interface WeatherState {
  cityName: string;
  emoji: string;
  temperature: number;
}

const geocodeCache = new Map<string, { latitude: number; longitude: number } | null>();

async function resolveCoordinates(
  cityName: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const cached = geocodeCache.get(cityName);
  if (cached !== undefined) return cached;
  const response = await fetch(
    `${GEOCODE_URL}?name=${encodeURIComponent(cityName)}&count=10&language=es&format=json`,
  );
  if (!response.ok) return null;
  const body = (await response.json()) as {
    results?: { country_code: string; latitude: number; longitude: number }[];
  };
  const results = body.results ?? [];
  // Prefer an Argentine match — several city names in this catalog exist elsewhere too.
  const match = results.find((result) => result.country_code === 'AR') ?? results[0] ?? null;
  const coordinates = match ? { latitude: match.latitude, longitude: match.longitude } : null;
  geocodeCache.set(cityName, coordinates);
  return coordinates;
}

/** Shows the current weather for the selected operating city — an emoji plus the temperature, no
 * icon library involved. Silently renders nothing if geocoding/forecast fails; a broken decoration
 * is not worth an error message in the topbar. */
export function WeatherWidget({ cityName }: { cityName: string | null }) {
  const [weather, setWeather] = useState<WeatherState | null>(null);

  useEffect(() => {
    if (!cityName) {
      setWeather(null);
      return;
    }
    let active = true;

    const load = async () => {
      const coordinates = await resolveCoordinates(cityName);
      if (!coordinates || !active) return;
      const response = await fetch(
        `${FORECAST_URL}?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}` +
          '&current=temperature_2m,weather_code&timezone=auto',
      );
      if (!response.ok || !active) return;
      const body = (await response.json()) as {
        current?: { temperature_2m: number; weather_code: number };
      };
      if (!body.current || !active) return;
      setWeather({
        cityName,
        emoji: emojiFor(body.current.weather_code),
        temperature: Math.round(body.current.temperature_2m),
      });
    };

    void load().catch(() => {
      if (active) setWeather(null);
    });
    const timer = window.setInterval(() => void load().catch(() => undefined), REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [cityName]);

  if (!weather) {
    return (
      <div className="dashboard-weather" title="Clima">
        <span aria-hidden="true" className="dashboard-weather-icon">
          🌡️
        </span>
        <span>Clima</span>
        <small>{cityName ?? '—'}</small>
      </div>
    );
  }

  return (
    <div className="dashboard-weather" title={`Clima en ${weather.cityName}`}>
      <span aria-hidden="true" className="dashboard-weather-icon">
        {weather.emoji}
      </span>
      <span>{weather.temperature}°C</span>
      <small>{weather.cityName}</small>
    </div>
  );
}
