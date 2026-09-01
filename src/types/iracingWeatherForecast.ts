/** One hourly forecast point, exactly as returned by iRacing's weather-forecast JSON (linked
 * from a schedule entry's weather.weather_url). Field scaling confirmed against a live sample:
 * air_temp/rel_humidity/precip_chance/wind_speed are x100, pressure/cloud_cover are x10,
 * wind_dir is plain degrees. The live sample happened to have precip_chance always 0, which
 * masked the x100 scaling at first (0 looks the same scaled or not) — see
 * components/WeatherForecastChart.tsx. */
export interface WeatherForecastPoint {
  index: number;
  timestamp: string;
  time_offset: number;
  is_sun_up: boolean;
  cloud_cover: number;
  air_temp: number;
  rel_humidity: number;
  pressure: number;
  wind_dir: number;
  wind_speed: number;
  precip_chance: number;
  precip_amount: number;
  affects_session?: boolean;
}
