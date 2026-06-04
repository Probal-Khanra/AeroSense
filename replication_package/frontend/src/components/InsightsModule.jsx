// InsightsModule.jsx — AeroSense History Panel
// Self-contained: fetches data, computes summaries, renders chart + stats
// Theme-aware: matches main dashboard dark/light mode
import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip
} from 'recharts';

// ── Config ───────────────────────────────────────────────────────────────────
const GAS_URL = process.env.REACT_APP_GOOGLE_SCRIPT_URL || 'YOUR_GOOGLE_APPS_SCRIPT_URL';

const SENSOR_GROUPS = [
  { key: 'PM25',  label: 'PM 2.5',     unit: 'µg/m³', color: '#f97316' }, // Orange
  { key: 'PM10',  label: 'PM 10',      unit: 'µg/m³', color: '#3b82f6' }, // Blue
  { key: 'Temp',  label: 'TEMPERATURE', unit: '°C',    color: '#ef4444' }, // Red
  { key: 'Hum',   label: 'HUMIDITY',    unit: '%RH',   color: '#06b6d4' }, // Cyan
  { key: 'MQ2',   label: 'MQ-2 GAS',   unit: 'ppm',   color: '#eab308' }, // Yellow
  { key: 'MQ7',   label: 'MQ-7 CO',    unit: 'ppm',   color: '#a855f7' }, // Purple
];

// 24-hour skeleton for hourly charts (00:00 → 23:00)
const HOURS_24 = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0');
  return `${h}:00`;
});

// ── Skeleton Loader ──────────────────────────────────────────────────────────
const SkeletonPanel = ({ isDark }) => (
  <section className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-stretch w-full py-10 animate-pulse">
    <div className={`rounded-[30px] md:rounded-[45px] w-full lg:w-[360px] shrink-0 p-8 space-y-8 border ${
      isDark ? 'bg-[#0A0A0A] border-white/5' : 'bg-[#E2E8F0] border-gray-300'
    }`}>
      <div className={`h-4 rounded w-2/3 mx-auto ${isDark ? 'bg-white/10' : 'bg-gray-300'}`} />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className={`h-3 rounded w-1/4 ${isDark ? 'bg-white/10' : 'bg-gray-300'}`} />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="space-y-1">
                <div className={`h-2 rounded w-1/2 ${isDark ? 'bg-white/10' : 'bg-gray-300'}`} />
                <div className={`h-7 rounded w-full ${isDark ? 'bg-white/10' : 'bg-gray-300'}`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className={`flex-1 min-h-[420px] rounded-[30px] md:rounded-[45px] p-8 border ${
      isDark ? 'bg-[#0A0A0A] border-white/5' : 'bg-[#E2E8F0] border-gray-300'
    }`}>
      <div className={`h-5 rounded w-1/3 mb-8 ${isDark ? 'bg-white/10' : 'bg-gray-300'}`} />
      <div className={`h-full rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-200/50'}`} />
    </div>
  </section>
);

// ── Stat Cell ────────────────────────────────────────────────────────────────
const StatCell = ({ label, value, unit, isDark }) => (
  <div className="text-center lg:text-left">
    <p className={`text-[9px] font-bold uppercase tracking-[0.15em] mb-0.5 ${
      isDark ? 'text-white/30' : 'text-black/30'
    }`}>{label}</p>
    <p className={`text-xl 2xl:text-2xl font-black italic tracking-tighter leading-none ${
      isDark ? 'text-white' : 'text-gray-900'
    }`}>
      {value ?? '—'}
      <span className={`text-[9px] 2xl:text-[10px] font-bold not-italic ml-1 ${
        isDark ? 'text-white/25' : 'text-black/30'
      }`}>{unit}</span>
    </p>
  </div>
);

// ── Custom Tooltip ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, isDark }) => {
  if (!active || !payload?.length) return null;
  const validEntries = payload.filter(e => e.value != null);
  if (validEntries.length === 0) return null;
  return (
    <div className={`rounded-2xl shadow-xl border px-5 py-4 text-left min-w-[180px] ${
      isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-100'
    }`}>
      <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
        isDark ? 'text-white/40' : 'text-gray-400'
      }`}>{label}</p>
      {validEntries.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
            <span className={`text-[11px] font-bold ${isDark ? 'text-white/60' : 'text-gray-600'}`}>{entry.name}</span>
          </span>
          <span className={`text-[12px] font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Summary Panel ────────────────────────────────────────────────────────────
const SummaryPanel = ({ dateLabel, summary, isDark }) => (
  <div className={`p-6 lg:p-8 rounded-[30px] md:rounded-[45px] w-full lg:w-[360px] shadow-sm shrink-0 border ${
    isDark ? 'bg-[#0A0A0A] border-white/5' : 'bg-[#E2E8F0] border-gray-300'
  }`}>
    <h2 className={`font-black text-center mb-8 text-xs tracking-tight uppercase ${
      isDark ? 'text-white' : 'text-gray-900'
    }`}>{dateLabel}</h2>

    <div className="space-y-6">
      {SENSOR_GROUPS.map(({ key, label, unit, color }) => (
        <div key={key}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${
              isDark ? 'text-indigo-400' : 'text-gray-500'
            }`}>{label}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCell label="AVG" value={summary[`${key}_Avg`]} unit={unit} isDark={isDark} />
            <StatCell label="MIN" value={summary[`${key}_Min`]} unit={unit} isDark={isDark} />
            <StatCell label="MAX" value={summary[`${key}_Max`]} unit={unit} isDark={isDark} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── Trend Chart (Recharts) ───────────────────────────────────────────────────
const TrendChart = ({ chartData, title, activeSensor, setActiveSensor, isDark }) => {
  const sensorMeta = SENSOR_GROUPS.find(s => s.key === activeSensor);
  const sensorColor = sensorMeta?.color ?? '#6366f1';

  return (
    <div className="flex-1 w-full min-h-[420px] flex flex-col">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
        <h2 className={`font-black text-2xl lg:text-3xl tracking-tight flex items-center gap-2 ${
          isDark ? 'text-white' : 'text-gray-900'
        }`}>
          {title}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {SENSOR_GROUPS.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setActiveSensor(key)}
              className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border ${
                activeSensor === key
                  ? 'text-white shadow-md scale-105'
                  : isDark
                    ? 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
              style={activeSensor === key ? { background: color, borderColor: color } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
            <CartesianGrid
              vertical={false}
              stroke={isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0'}
              strokeDasharray="4 4"
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: isDark ? 'rgba(255,255,255,0.35)' : '#999', fontSize: 10, fontWeight: 700 }}
              dy={12}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: isDark ? 'rgba(255,255,255,0.35)' : '#999', fontSize: 11, fontWeight: 700 }}
              dx={-8}
            />
            <Tooltip content={<ChartTooltip isDark={isDark} />} />
            <Line
              type="monotone"
              dataKey="avg"
              name={`${sensorMeta?.label ?? ''} Avg`}
              stroke={sensorColor}
              strokeWidth={3}
              dot={{ r: 4, fill: sensorColor, strokeWidth: 2, stroke: isDark ? '#0A0A0A' : '#fff' }}
              activeDot={{ r: 7, strokeWidth: 3, stroke: isDark ? '#0A0A0A' : '#fff' }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="min"
              name="Min"
              stroke={sensorColor}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeOpacity={0.3}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="max"
              name="Max"
              stroke={sensorColor}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeOpacity={0.3}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export default function InsightsModule({ type, title, dateLabel, isDark }) {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSensor, setActiveSensor] = useState('PM25');

  // Fetch data from Google Apps Script
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const targetUrl = `${GAS_URL}?type=${type}`;

    fetch(targetUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          if (!data || data.error) {
            setError(data?.error || 'No data returned');
          } else {
            setRawData(Array.isArray(data) ? data : []);
          }
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [type]);

  // Compute summary (aggregate across all rows)
  const summary = useMemo(() => {
    if (!rawData || rawData.length === 0) return null;

    const result = {};
    SENSOR_GROUPS.forEach(({ key }) => {
      const avgVals = rawData.map(r => r[`${key}_Avg`]).filter(v => v != null && v !== '');
      const minVals = rawData.map(r => r[`${key}_Min`]).filter(v => v != null && v !== '');
      const maxVals = rawData.map(r => r[`${key}_Max`]).filter(v => v != null && v !== '');

      result[`${key}_Avg`] = avgVals.length
        ? (avgVals.reduce((a, b) => a + Number(b), 0) / avgVals.length).toFixed(1)
        : '—';
      result[`${key}_Min`] = minVals.length
        ? Math.min(...minVals.map(Number))
        : '—';
      result[`${key}_Max`] = maxVals.length
        ? Math.max(...maxVals.map(Number))
        : '—';
    });

    return result;
  }, [rawData]);

  // ── Build chart data ────────────────────────────────────────────────────────
  // For 'hourly': creates a full 24-hour timeline (00:00 → 23:00).
  //   The API sends ~2 readings/hour (:30 and :35). We average those into one
  //   hourly bucket. Missing hours get null values → no dot rendered.
  // For 'daily': maps each row to its date label.
  const chartData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    if (type === 'hourly') {
      // ── Filter to yesterday only (local date, not UTC) ───────────────────────
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      // Group readings by LOCAL hour (getHours), not UTC
      const buckets = {};
      rawData.forEach(row => {
        const ts = new Date(row.Timestamp);
        // Only include rows that belong to yesterday (local date)
        const rowDate = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;
        if (rowDate !== yStr) return;
        const hourKey = ts.getHours(); // 0–23 in local (IST) time ← was getUTCHours()
        if (!buckets[hourKey]) buckets[hourKey] = [];
        buckets[hourKey].push(row);
      });

      return HOURS_24.map((label, hourIdx) => {
        const rows = buckets[hourIdx];
        if (!rows || rows.length === 0) {
          return { time: label, avg: null, min: null, max: null };
        }
        // Average the duplicate readings for this hour
        const avgVal = rows.reduce((s, r) => s + (Number(r[`${activeSensor}_Avg`]) || 0), 0) / rows.length;
        const minVal = Math.min(...rows.map(r => Number(r[`${activeSensor}_Min`]) || 0));
        const maxVal = Math.max(...rows.map(r => Number(r[`${activeSensor}_Max`]) || 0));

        return {
          time: label,
          avg: Number(avgVal.toFixed(1)),
          min: minVal,
          max: maxVal,
        };
      });
    }

    // Daily type — one point per date
    return rawData.map(row => {
      const ts = new Date(row.Timestamp);
      const timeLabel = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return {
        time: timeLabel,
        avg: Number(row[`${activeSensor}_Avg`]) || 0,
        min: Number(row[`${activeSensor}_Min`]) || 0,
        max: Number(row[`${activeSensor}_Max`]) || 0,
      };
    });
  }, [rawData, activeSensor, type]);

  // ── Loading State ──
  if (loading) return <SkeletonPanel isDark={isDark} />;

  // ── Error State ──
  if (error || !summary) {
    return (
      <section className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-stretch w-full py-10">
        <div className={`p-8 rounded-[30px] md:rounded-[45px] w-full lg:w-[360px] shrink-0 flex items-center justify-center border ${
          isDark ? 'bg-[#0A0A0A] border-white/5' : 'bg-[#E2E8F0] border-gray-300'
        }`}>
          <div className="text-center">
            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
              isDark ? 'text-white/30' : 'text-gray-400'
            }`}>Data Unavailable</p>
            <p className={`text-[11px] font-mono ${isDark ? 'text-white/20' : 'text-gray-400'}`}>
              {error || 'No records found'}
            </p>
          </div>
        </div>
        <div className={`flex-1 min-h-[300px] rounded-[30px] md:rounded-[45px] flex items-center justify-center border ${
          isDark ? 'bg-[#0A0A0A] border-white/5' : 'bg-[#E2E8F0] border-gray-300'
        }`}>
          <p className={`text-sm font-black uppercase tracking-widest ${
            isDark ? 'text-white/10' : 'text-gray-300'
          }`}>No Chart Data</p>
        </div>
      </section>
    );
  }

  // ── Render ──
  return (
    <section className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-stretch w-full py-10">
      <SummaryPanel dateLabel={dateLabel} summary={summary} isDark={isDark} />
      <TrendChart
        chartData={chartData}
        title={title}
        activeSensor={activeSensor}
        setActiveSensor={setActiveSensor}
        isDark={isDark}
      />
    </section>
  );
}