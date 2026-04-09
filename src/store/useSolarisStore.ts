import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GeocodingResult,
  WeatherForecastResponse,
} from "../lib/weather-types";
import { weatherApi } from "../lib/weather";

const DEFAULT_LOCATION: GeocodingResult = {
  id: 1,
  name: "New York",
  latitude: 40.7128,
  longitude: -74.006,
  country: "United States",
  country_code: "US",
};

interface SolarisState {
  // Location
  selectedLocation: GeocodingResult;
  setSelectedLocation: (loc: GeocodingResult) => void;

  // Weather data (not persisted)
  weatherData: WeatherForecastResponse | null;
  isLoading: boolean;
  error: string | null;

  // Location search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: GeocodingResult[];
  isSearching: boolean;

  // Actions
  fetchWeather: () => Promise<void>;
  searchLocations: (query: string) => Promise<void>;
  detectLocation: () => Promise<void>;
}

export const useSolarisStore = create<SolarisState>()(
  persist(
    (set, get) => ({
      selectedLocation: DEFAULT_LOCATION,
      setSelectedLocation: (loc) => {
        set({ selectedLocation: loc, searchResults: [], searchQuery: "" });
        // Auto-fetch weather when location changes
        setTimeout(() => get().fetchWeather(), 0);
      },

      weatherData: null,
      isLoading: false,
      error: null,

      searchQuery: "",
      setSearchQuery: (q) => set({ searchQuery: q }),
      searchResults: [],
      isSearching: false,

      fetchWeather: async () => {
        const { selectedLocation } = get();
        set({ isLoading: true, error: null });
        try {
          const data = await weatherApi.getForecast(
            selectedLocation.latitude,
            selectedLocation.longitude,
          );
          set({ weatherData: data, isLoading: false });
        } catch (e) {
          set({ error: String(e), isLoading: false });
        }
      },

      searchLocations: async (query: string) => {
        if (query.length < 2) {
          set({ searchResults: [], isSearching: false });
          return;
        }
        set({ isSearching: true });
        try {
          const results = await weatherApi.searchLocations(query);
          set({ searchResults: results, isSearching: false });
        } catch {
          set({ searchResults: [], isSearching: false });
        }
      },

      detectLocation: async () => {
        if (!navigator.geolocation) return;
        set({ isLoading: true });
        return new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            async ({ coords: { latitude, longitude } }) => {
              try {
                const geo = await weatherApi.reverseGeocode(
                  latitude,
                  longitude,
                );
                const loc: GeocodingResult = geo ?? {
                  id: 0,
                  name: "Current Location",
                  latitude,
                  longitude,
                  country: "",
                  country_code: "",
                };
                set({ selectedLocation: loc });
                await get().fetchWeather();
              } catch {
                await get().fetchWeather();
              }
              resolve();
            },
            () => {
              set({ isLoading: false });
              resolve();
            },
            { enableHighAccuracy: true, timeout: 10000 },
          );
        });
      },
    }),
    {
      name: "starfield-solaris-state",
      version: 1,
      partialize: (s) => ({
        selectedLocation: s.selectedLocation,
      }),
    },
  ),
);
