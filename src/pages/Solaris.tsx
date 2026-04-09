import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudSun,
  ArrowLeft,
  MapPin,
  Search,
  Loader2,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import { useSolarisStore } from "../store/useSolarisStore";
import { WEATHER_CODES } from "../lib/weather-types";
import type { WeatherForecastResponse, GeocodingResult } from "../lib/weather-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWindDirection(degrees: number) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % 8];
}

function getPrecipIcon(code: number) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "🌩️";
  return "💧";
}

function formatDate(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatLocation(loc: GeocodingResult): string {
  return `${loc.name}${loc.country ? `, ${loc.country}` : ""}`;
}

// ── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col items-center justify-center text-center gap-0.5"
      style={{
        background: "rgba(16, 15, 46, 0.6)",
        border: "1px solid rgba(37, 34, 96, 0.6)",
      }}
    >
      <span
        className="text-[9px] uppercase tracking-[0.2em]"
        style={{ color: "var(--color-text-dim)" }}
      >
        {label}
      </span>
      <span
        className="text-lg font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        {value}
        {unit && (
          <span
            className="text-[10px] font-normal ml-0.5"
            style={{ color: "var(--color-purple-400)" }}
          >
            {unit}
          </span>
        )}
      </span>
      {sub && (
        <span
          className="text-[10px] font-medium"
          style={{ color: "var(--color-text-dim)" }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

// ── Detail Tile ──────────────────────────────────────────────────────────────

function DetailTile({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: string;
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-0.5 items-center text-center"
      style={{
        background: "rgba(16, 15, 46, 0.6)",
        border: "1px solid rgba(37, 34, 96, 0.6)",
      }}
    >
      <span
        className="text-[9px] uppercase tracking-[0.2em]"
        style={{ color: "var(--color-text-dim)" }}
      >
        {label}
      </span>
      <span
        className="font-bold text-sm flex items-center gap-1"
        style={{ color: "var(--color-text-primary)" }}
      >
        {icon && <span>{icon}</span>}
        {value}
        {unit && (
          <span
            className="text-[9px] font-normal"
            style={{ color: "var(--color-purple-400)" }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Hourly Chart ─────────────────────────────────────────────────────────────

function HourlyChart({
  data,
  dayIndex,
}: {
  data: WeatherForecastResponse;
  dayIndex?: number;
}) {
  const { hourly } = data;
  if (!hourly?.time?.length) return null;

  const now = new Date();
  let startIdx = 0;
  let endIdx = 24;

  if (dayIndex !== undefined) {
    startIdx = dayIndex * 24;
    endIdx = startIdx + 24;
  } else {
    startIdx = hourly.time.findIndex((t) => new Date(t) >= now);
    if (startIdx < 0) startIdx = 0;
    endIdx = Math.min(startIdx + 24, hourly.time.length);
  }

  const chartData = hourly.time.slice(startIdx, endIdx).map((t, i) => {
    const idx = startIdx + i;
    return {
      time: new Date(t).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      temp: hourly.temperature_2m?.[idx],
      feelsLike: hourly.apparent_temperature?.[idx],
      precip: hourly.precipitation_probability?.[idx] ?? 0,
    };
  });

  if (chartData.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-4">
      <div>
        <h4
          className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-2 pl-1"
          style={{ color: "var(--color-text-dim)" }}
        >
          Temperature (°C)
        </h4>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="feelsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(139,92,246,0.1)"
              />
              <XAxis
                dataKey="time"
                tick={{ fill: "rgba(196,181,253,0.5)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "rgba(196,181,253,0.5)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(16,15,46,0.95)",
                  border: "1px solid rgba(139,92,246,0.3)",
                  borderRadius: "0.75rem",
                  color: "#ede9fe",
                  fontSize: "0.75rem",
                }}
                labelStyle={{ color: "#bba9fb" }}
              />
              <Area
                type="monotone"
                dataKey="feelsLike"
                stroke="#818cf8"
                strokeWidth={1.5}
                fill="url(#feelsGrad)"
                name="Feels Like"
                dot={false}
                strokeDasharray="4 2"
              />
              <Area
                type="monotone"
                dataKey="temp"
                stroke="#a78bfa"
                strokeWidth={2}
                fill="url(#tempGrad)"
                name="Temperature"
                dot={false}
                activeDot={{ r: 3, fill: "#c4b5fd" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h4
          className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-2 pl-1"
          style={{ color: "var(--color-text-dim)" }}
        >
          Precipitation Probability (%)
        </h4>
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="precipGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7dd3fc" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#7dd3fc" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(139,92,246,0.1)"
              />
              <XAxis
                dataKey="time"
                tick={{ fill: "rgba(196,181,253,0.5)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "rgba(196,181,253,0.5)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(16,15,46,0.95)",
                  border: "1px solid rgba(139,92,246,0.3)",
                  borderRadius: "0.75rem",
                  color: "#ede9fe",
                  fontSize: "0.75rem",
                }}
                labelStyle={{ color: "#bba9fb" }}
              />
              <Area
                type="monotone"
                dataKey="precip"
                stroke="#7dd3fc"
                strokeWidth={2}
                fill="url(#precipGrad)"
                name="Precipitation %"
                dot={false}
                activeDot={{ r: 3, fill: "#bae6fd" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Location Search ──────────────────────────────────────────────────────────

function LocationSearchInput() {
  const {
    selectedLocation,
    setSelectedLocation,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchLocations,
    detectLocation,
    isLoading,
  } = useSolarisStore();

  const [showResults, setShowResults] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const displayValue = isEditing
    ? searchQuery
    : formatLocation(selectedLocation);

  useEffect(() => {
    function handleClickOutside(evt: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(evt.target as Node)
      ) {
        setShowResults(false);
        setIsEditing(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setIsEditing(true);
    setShowResults(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchLocations(val), 400);
  };

  const handleSelect = (loc: GeocodingResult) => {
    setIsEditing(false);
    setShowResults(false);
    setSelectedLocation(loc);
  };

  const showDropdown =
    showResults && isEditing && searchResults.length > 0;

  return (
    <div className="flex gap-2 items-center">
      <div ref={wrapperRef} className="relative flex-1">
        <div className="relative">
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--color-purple-400)", opacity: 0.5 }}
          >
            <Search size={14} />
          </div>
          <input
            type="text"
            value={displayValue}
            onChange={handleChange}
            onFocus={() => {
              if (isEditing && searchResults.length > 0) {
                setShowResults(true);
              }
            }}
            placeholder="Search for a city..."
            className="settings-input pl-9 pr-9"
          />
          {isSearching && isEditing && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2
                size={14}
                className="animate-spin"
                style={{ color: "var(--color-purple-400)" }}
              />
            </div>
          )}
        </div>

        {showDropdown && (
          <div
            className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 py-1"
            style={{
              background: "rgba(16, 15, 46, 0.95)",
              border: "1px solid var(--color-border-dim)",
              backdropFilter: "blur(12px)",
            }}
          >
            {searchResults.map((location) => (
              <button
                key={`${location.id}-${location.latitude}`}
                onClick={() => handleSelect(location)}
                className="w-full px-4 py-2.5 text-left flex flex-col transition-colors duration-100"
                style={{ color: "var(--color-text-primary)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(124,79,240,0.1)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "transparent")
                }
              >
                <span className="font-semibold text-sm">{location.name}</span>
                <span
                  className="text-xs mt-0.5"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  {location.admin1 && `${location.admin1}, `}
                  {location.country}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className="win-btn"
        style={{
          width: 38,
          height: 38,
          borderRadius: "var(--radius-md)",
        }}
        onClick={() => void detectLocation()}
        title="Use current location"
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <MapPin size={14} />
        )}
      </button>
    </div>
  );
}

// ── Main Solaris Page ────────────────────────────────────────────────────────

export default function Solaris() {
  const { setView } = useAppStore();
  const { weatherData, isLoading, error, fetchWeather, selectedLocation } =
    useSolarisStore();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  // Fetch weather on mount if we don't have data
  useEffect(() => {
    if (!weatherData) {
      fetchWeather();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = weatherData?.current;
  const daily = weatherData?.daily;
  const currentWeather = current
    ? WEATHER_CODES[current.weather_code]
    : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <StarField />

      <div className="above-stars flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border-dim)" }}
        >
          <button
            className="win-btn"
            onClick={() => setView("luna")}
            title="Back to Luna"
          >
            <ArrowLeft size={14} />
          </button>
          <CloudSun size={16} style={{ color: "var(--color-purple-400)" }} />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Solaris
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: "rgba(124, 79, 240, 0.12)",
              color: "var(--color-text-muted)",
            }}
          >
            constellation
          </span>
          <div className="flex-1" />
          <button
            className="win-btn flex items-center gap-1.5"
            onClick={() => void fetchWeather()}
            disabled={isLoading}
            title="Refresh weather"
          >
            <RefreshCw
              size={13}
              className={isLoading ? "animate-spin" : ""}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            {/* Location Search */}
            <LocationSearchInput />

            {/* Loading */}
            {isLoading && !weatherData && (
              <div className="flex justify-center mt-12">
                <Loader2
                  size={32}
                  className="animate-spin"
                  style={{ color: "var(--color-purple-400)" }}
                />
              </div>
            )}

            {/* Error */}
            {error && !weatherData && (
              <div
                className="glass rounded-xl px-5 py-4 flex items-center gap-3"
                style={{ borderColor: "rgba(239,68,68,0.3)" }}
              >
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Unable to load weather data. Please try again.
                </span>
              </div>
            )}

            {/* Current Conditions */}
            {current && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="glass rounded-xl p-6"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  {/* Left: location + temp */}
                  <div className="flex-1 flex flex-col items-center md:items-start gap-1">
                    <h2
                      className="text-2xl font-bold tracking-tight truncate max-w-full"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {selectedLocation.name}
                    </h2>
                    <p
                      className="text-xs font-medium uppercase tracking-[0.2em]"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      {selectedLocation.admin1 &&
                        `${selectedLocation.admin1}, `}
                      {selectedLocation.country}
                    </p>

                    <div className="flex items-center gap-4 mt-4">
                      <span className="text-7xl select-none">
                        {currentWeather?.icon || "🌡️"}
                      </span>
                      <div>
                        <div
                          className="text-5xl font-light tracking-tighter flex items-start"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {Math.round(current.temperature_2m)}
                          <span
                            className="text-xl mt-1 font-normal"
                            style={{ color: "var(--color-purple-400)" }}
                          >
                            °C
                          </span>
                        </div>
                        <div
                          className="text-xs font-semibold tracking-[0.12em] uppercase mt-0.5"
                          style={{ color: "var(--color-purple-400)" }}
                        >
                          {currentWeather?.description || "Unknown"}
                        </div>
                        <div
                          className="text-[11px] mt-1"
                          style={{ color: "var(--color-text-dim)" }}
                        >
                          Feels like{" "}
                          {Math.round(current.apparent_temperature)}°
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: stat grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:w-[340px]">
                    <StatTile
                      label="Humidity"
                      value={`${current.relative_humidity_2m}`}
                      unit="%"
                    />
                    <StatTile
                      label="Wind"
                      value={`${Math.round(current.wind_speed_10m)}`}
                      unit="km/h"
                      sub={getWindDirection(current.wind_direction_10m)}
                    />
                    <StatTile
                      label="Gusts"
                      value={`${Math.round(current.wind_gusts_10m)}`}
                      unit="km/h"
                    />
                    <StatTile
                      label="Pressure"
                      value={`${Math.round(current.pressure_msl)}`}
                      unit="hPa"
                    />
                    <StatTile
                      label="Cloud Cover"
                      value={`${current.cloud_cover}`}
                      unit="%"
                    />
                    <StatTile
                      label="Precipitation"
                      value={`${current.precipitation}`}
                      unit="mm"
                    />
                  </div>
                </div>

                {/* Hourly charts for today */}
                <div
                  className="mt-6 pt-6"
                  style={{
                    borderTop: "1px solid rgba(124,79,240,0.1)",
                  }}
                >
                  <HourlyChart data={weatherData!} />
                </div>
              </motion.div>
            )}

            {/* 7-Day Forecast */}
            {daily && daily.time.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3
                  className="text-[10px] font-bold uppercase tracking-[0.25em] px-1"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  7-Day Forecast
                </h3>

                <div className="flex flex-col gap-2">
                  {daily.time.map((date, index) => {
                    const weatherCode = daily.weather_code?.[index] ?? 0;
                    const weather = WEATHER_CODES[weatherCode];
                    const maxTemp = daily.temperature_2m_max?.[index];
                    const minTemp = daily.temperature_2m_min?.[index];
                    const precipProb =
                      daily.precipitation_probability_max?.[index];
                    const isExpanded = expandedDay === index;

                    return (
                      <div key={date}>
                        <motion.button
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: index * 0.03,
                            duration: 0.25,
                          }}
                          onClick={() =>
                            setExpandedDay(isExpanded ? null : index)
                          }
                          className={`w-full glass px-4 py-3 flex items-center gap-4 text-left cursor-pointer select-none transition-all duration-200 rounded-xl ${
                            isExpanded
                              ? "!border-purple-500/40 !bg-purple-500/[0.08]"
                              : ""
                          }`}
                        >
                          <span
                            className="w-20 text-xs font-semibold tracking-wide truncate"
                            style={{
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {index === 0 ? "Today" : formatDate(date)}
                          </span>

                          <span className="text-2xl select-none">
                            {weather?.icon || "🌡️"}
                          </span>

                          <span className="flex-1 flex items-center gap-2 justify-end text-sm">
                            <span
                              className="font-medium"
                              style={{
                                color: "var(--color-text-dim)",
                              }}
                            >
                              {minTemp !== undefined
                                ? `${Math.round(minTemp)}°`
                                : "--"}
                            </span>
                            <span
                              className="w-16 h-1 rounded-full"
                              style={{
                                background:
                                  "linear-gradient(to right, rgba(124,79,240,0.2), rgba(124,79,240,0.4), rgba(124,79,240,0.2))",
                              }}
                            />
                            <span
                              className="font-bold"
                              style={{
                                color: "var(--color-text-primary)",
                              }}
                            >
                              {maxTemp !== undefined
                                ? `${Math.round(maxTemp)}°`
                                : "--"}
                            </span>
                          </span>

                          <span className="w-14 text-right">
                            {precipProb !== undefined && precipProb > 0 ? (
                              <span
                                className="text-[10px] font-bold"
                                style={{ color: "#7dd3fc" }}
                              >
                                {getPrecipIcon(weatherCode)} {precipProb}%
                              </span>
                            ) : null}
                          </span>

                          <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                            style={{ color: "var(--color-text-dim)" }}
                          />
                        </motion.button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{
                                duration: 0.3,
                                ease: "easeInOut",
                              }}
                              className="overflow-hidden"
                            >
                              <div
                                className="rounded-b-xl px-4 py-5 flex flex-col gap-5"
                                style={{
                                  background: "rgba(16, 15, 46, 0.55)",
                                  border:
                                    "1px solid rgba(37, 34, 96, 0.6)",
                                  borderTop: "none",
                                }}
                              >
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <DetailTile
                                    label="UV Index"
                                    value={
                                      daily.uv_index_max?.[index] !==
                                      undefined
                                        ? daily.uv_index_max[
                                            index
                                          ].toFixed(1)
                                        : "--"
                                    }
                                  />
                                  <DetailTile
                                    label="Sunrise"
                                    value={
                                      daily.sunrise?.[index]
                                        ? new Date(
                                            daily.sunrise[index],
                                          ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : "--"
                                    }
                                  />
                                  <DetailTile
                                    label="Sunset"
                                    value={
                                      daily.sunset?.[index]
                                        ? new Date(
                                            daily.sunset[index],
                                          ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : "--"
                                    }
                                  />
                                  <DetailTile
                                    label="Precipitation"
                                    value={`${daily.precipitation_sum?.[index] ?? 0} mm`}
                                    icon={getPrecipIcon(weatherCode)}
                                  />
                                  <DetailTile
                                    label="Max Wind"
                                    value={`${Math.round(daily.wind_speed_10m_max?.[index] ?? 0)}`}
                                    unit="km/h"
                                  />
                                  <DetailTile
                                    label="Max Gusts"
                                    value={`${Math.round(daily.wind_gusts_10m_max?.[index] ?? 0)}`}
                                    unit="km/h"
                                  />
                                  <DetailTile
                                    label="Wind Dir"
                                    value={getWindDirection(
                                      daily.wind_direction_10m_dominant?.[
                                        index
                                      ] ?? 0,
                                    )}
                                  />
                                  <DetailTile
                                    label="Daylight"
                                    value={
                                      daily.daylight_duration?.[index]
                                        ? `${(daily.daylight_duration[index] / 3600).toFixed(1)}h`
                                        : "--"
                                    }
                                  />
                                </div>

                                <HourlyChart
                                  data={weatherData!}
                                  dayIndex={index}
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
