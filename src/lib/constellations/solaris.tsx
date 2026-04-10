import {
  CloudSun,
  Thermometer,
  Droplets,
  Wind,
  Gauge,
} from "lucide-react";
import { useSolarisStore } from "../../store/useSolarisStore";
import { weatherApi } from "../weather";
import { WEATHER_CODES } from "../weather-types";
import type {
  WeatherForecastResponse,
  GeocodingResult,
} from "../weather-types";
import type {
  ConstellationHandler,
  ParsedCommand,
  ActionResult,
} from "../constellation-registry";

// ── Helpers ──────────────────────────────────────────────────────────────────

function weatherDescription(code: number): string {
  return WEATHER_CODES[code]?.description ?? "Unknown";
}

function weatherEmoji(code: number): string {
  return WEATHER_CODES[code]?.icon ?? "🌡️";
}

// ── Result types ─────────────────────────────────────────────────────────────

interface WeatherSuccess extends ActionResult {
  type: "weather";
  location: string;
  locationObj: GeocodingResult;
  data: WeatherForecastResponse;
}

interface WeatherError extends ActionResult {
  type: "weather_error";
  location: string;
  error: string;
}

type WeatherResult = WeatherSuccess | WeatherError;

// ── Result card ──────────────────────────────────────────────────────────────

function WeatherCard({ result: raw }: { result: ActionResult }) {
  const result = raw as WeatherResult;

  if (result.type === "weather_error") {
    return (
      <div className="luna-action-card luna-action-card-error">
        <CloudSun size={14} style={{ flexShrink: 0 }} />
        <span>
          Weather unavailable for &quot;{result.location}&quot;: {result.error}
        </span>
      </div>
    );
  }

  const { data, locationObj } = result;
  const current = data.current;
  const daily = data.daily;
  if (!current) return null;

  const code = current.weather_code ?? 0;
  const temp = current.temperature_2m ?? 0;
  const feelsLike = current.apparent_temperature ?? 0;
  const humidity = current.relative_humidity_2m ?? 0;
  const wind = current.wind_speed_10m ?? 0;
  const pressure = current.pressure_msl as number | undefined;
  const tempUnit = data.current_units?.temperature_2m ?? "°C";
  const windUnit = data.hourly_units?.wind_speed_10m ?? "km/h";

  const dayForecast = daily
    ? (daily.time ?? []).slice(1, 4).map((t, i) => ({
        date: t,
        code: daily.weather_code?.[i + 1] ?? 0,
        max: daily.temperature_2m_max?.[i + 1] ?? 0,
        min: daily.temperature_2m_min?.[i + 1] ?? 0,
      }))
    : [];

  const displayName =
    locationObj.name + (locationObj.country ? `, ${locationObj.country}` : "");

  return (
    <div className="luna-action-card luna-action-card-weather">
      <div className="luna-weather-header">
        <CloudSun
          size={13}
          style={{ color: "var(--color-nebula-teal)", flexShrink: 0 }}
        />
        <span className="luna-weather-city">{displayName}</span>
      </div>
      <div className="luna-weather-main">
        <span className="luna-weather-emoji">{weatherEmoji(code)}</span>
        <div>
          <div className="luna-weather-temp">
            {Math.round(temp)}
            {tempUnit}
          </div>
          <div className="luna-weather-desc">{weatherDescription(code)}</div>
        </div>
      </div>
      <div className="luna-weather-stats">
        <span title="Feels like">
          <Thermometer size={11} />
          {Math.round(feelsLike)}
          {tempUnit}
        </span>
        <span title="Humidity">
          <Droplets size={11} />
          {Math.round(humidity)}%
        </span>
        <span title="Wind">
          <Wind size={11} />
          {Math.round(wind)} {windUnit}
        </span>
        {pressure != null && (
          <span title="Pressure">
            <Gauge size={11} />
            {Math.round(pressure)} hPa
          </span>
        )}
      </div>
      {dayForecast.length > 0 && (
        <div className="luna-weather-forecast">
          {dayForecast.map((d) => (
            <div key={d.date} className="luna-weather-day">
              <span className="luna-weather-day-label">
                {new Date(d.date).toLocaleDateString("en-US", {
                  weekday: "short",
                })}
              </span>
              <span>{weatherEmoji(d.code)}</span>
              <span>
                {Math.round(d.max)}° / {Math.round(d.min)}°
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const solarisHandler: ConstellationHandler = {
  tag: "solaris-commands",
  name: "Solaris",
  multiCommand: false,

  promptInstructions: `### Solaris Control — Weather

\`\`\`solaris-commands
GET_WEATHER {"location":"city name or city, country"}
\`\`\`

Use this when the user asks for weather, forecasts, temperature, or anything atmospheric. Location must be a real place name. Only one command per block.`,

  buildContext(): string {
    const { selectedLocation } = useSolarisStore.getState();
    const loc =
      selectedLocation.name +
      (selectedLocation.country ? `, ${selectedLocation.country}` : "");
    return `## Solaris — Current Location: ${loc}`;
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const cmd = commands[0];
    if (!cmd || !cmd.args.location) return [];

    const locationQuery = String(cmd.args.location);
    try {
      const locations = await weatherApi.searchLocations(locationQuery);
      if (!locations.length) throw new Error("Location not found");
      const loc = locations[0];
      const weatherData = await weatherApi.getForecast(
        loc.latitude,
        loc.longitude,
      );
      useSolarisStore.getState().setSelectedLocation(loc);
      return [
        {
          type: "weather",
          handler: "solaris-commands",
          location: locationQuery,
          locationObj: loc,
          data: weatherData,
        },
      ];
    } catch (e) {
      return [
        {
          type: "weather_error",
          handler: "solaris-commands",
          location: locationQuery,
          error: String(e),
        },
      ];
    }
  },

  ResultCard: WeatherCard,
};
