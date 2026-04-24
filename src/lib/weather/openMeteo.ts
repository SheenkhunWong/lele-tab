import type { Settings, WeatherSnapshot } from '../types';

const codeLabels: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Cloudy',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  95: 'Thunderstorm'
};

const codeLabelsZh: Record<number, string> = {
  0: '晴',
  1: '晴间多云',
  2: '局部多云',
  3: '多云',
  45: '雾',
  48: '冻雾',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '浓毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '阵雨',
  95: '雷暴'
};

const labelFor = (code: number) => codeLabels[code] ?? 'Weather';

export const weatherCodeLabel = (code: number, locale: string): string =>
  locale === 'zh-CN' ? (codeLabelsZh[code] ?? '天气') : (codeLabels[code] ?? 'Weather');

type Coordinates = { latitude: number; longitude: number; name: string };

const getBrowserCoordinates = async (): Promise<Coordinates> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is unavailable.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          name: '当前位置'
        }),
      (error) => reject(new Error(error.message)),
      { maximumAge: 30 * 60 * 1000, timeout: 8000 }
    );
  });

const geocodeCity = async (city: string): Promise<Coordinates> => {
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`
  );
  if (!response.ok) throw new Error('City lookup failed.');
  const payload = (await response.json()) as {
    results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
  };
  const result = payload.results?.[0];
  if (!result) throw new Error('City not found.');
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    name: [result.name, result.country].filter(Boolean).join(', ')
  };
};

export const loadOpenMeteoWeather = async (settings: Settings['weather']): Promise<WeatherSnapshot> => {
  const coordinates = settings.city ? await geocodeCity(settings.city) : await getBrowserCoordinates();
  const fahrenheit = settings.unit === 'F' ? '&temperature_unit=fahrenheit' : '';
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}` +
    '&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,uv_index,precipitation,wind_speed_10m,wind_direction_10m,surface_pressure' +
    '&hourly=temperature_2m&forecast_hours=48' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=15&timezone=auto' +
    fahrenheit;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Weather request failed.');
  const payload = (await response.json()) as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
      relative_humidity_2m: number;
      uv_index: number;
      precipitation: number;
      wind_speed_10m: number;
      wind_direction_10m: number;
      surface_pressure: number;
    };
    hourly: {
      time: string[];
      temperature_2m: number[];
    };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      sunrise: string[];
      sunset: string[];
    };
  };

  return {
    location: coordinates.name,
    updatedAt: Date.now(),
    current: {
      temperature: payload.current.temperature_2m,
      apparentTemperature: payload.current.apparent_temperature,
      code: payload.current.weather_code,
      label: labelFor(payload.current.weather_code),
      humidity: payload.current.relative_humidity_2m,
      uvIndex: payload.current.uv_index,
      precipitation: payload.current.precipitation,
      windspeed: payload.current.wind_speed_10m,
      windDirection: payload.current.wind_direction_10m,
      pressure: payload.current.surface_pressure,
      sunrise: payload.daily.sunrise[0],
      sunset: payload.daily.sunset[0]
    },
    hourly: payload.hourly.time.map((time, index) => ({
      time,
      temperature: payload.hourly.temperature_2m[index] ?? 0
    })),
    daily: payload.daily.time.map((date, index) => ({
      date,
      code: payload.daily.weather_code[index] ?? 0,
      label: labelFor(payload.daily.weather_code[index] ?? 0),
      min: payload.daily.temperature_2m_min[index] ?? 0,
      max: payload.daily.temperature_2m_max[index] ?? 0
    }))
  };
};
