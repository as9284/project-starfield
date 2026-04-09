import type {
  WeatherForecastResponse,
  GeocodingResult,
} from "./weather-types";

const BASE_URL = "https://api.open-meteo.com/v1";

export const weatherApi = {
  async getForecast(
    latitude: number,
    longitude: number,
    timezone: string = "auto",
  ): Promise<WeatherForecastResponse> {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      timezone,
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "is_day",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "pressure_msl",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
      ].join(","),
      hourly: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "precipitation_probability",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "apparent_temperature_max",
        "apparent_temperature_min",
        "sunrise",
        "sunset",
        "daylight_duration",
        "sunshine_duration",
        "uv_index_max",
        "precipitation_sum",
        "precipitation_probability_max",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "wind_direction_10m_dominant",
      ].join(","),
      forecast_days: "7",
    });

    const response = await fetch(`${BASE_URL}/forecast?${params}`);
    if (!response.ok)
      throw new Error(`Weather API error: ${response.status}`);
    return response.json() as Promise<WeatherForecastResponse>;
  },

  async searchLocations(query: string): Promise<GeocodingResult[]> {
    if (!query || query.length < 2) return [];

    const params = new URLSearchParams({
      name: query,
      count: "10",
      language: "en",
      format: "json",
    });

    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${params}`,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: GeocodingResult[] };
    return data.results || [];
  },

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<GeocodingResult | null> {
    const params = new URLSearchParams({
      lat: latitude.toString(),
      lon: longitude.toString(),
      format: "json",
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      { headers: { "User-Agent": "Starfield/1.0" } },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      lat: string;
      lon: string;
      address: {
        city?: string;
        town?: string;
        village?: string;
        hamlet?: string;
        state?: string;
        country?: string;
        country_code?: string;
      };
    };

    const { address, lat, lon } = data;
    const name =
      address.city ?? address.town ?? address.village ?? address.hamlet;
    if (!name) return null;

    return {
      id: 0,
      name,
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      country: address.country ?? "",
      country_code: (address.country_code ?? "").toUpperCase(),
      admin1: address.state,
    };
  },
};
