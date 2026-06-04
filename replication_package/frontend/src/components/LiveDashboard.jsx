import React, { useState, useEffect, useMemo, memo } from 'react';

const GAS_URL = process.env.REACT_APP_GOOGLE_SCRIPT_URL || "YOUR_GOOGLE_APPS_SCRIPT_URL";

const CONFIG_THRESHOLDS = {
  pm25: { label: "PM 2.5 Index", low: 12, high: 35 },
  pm10: { label: "PM 10 Index", low: 50, high: 150 },
  mq2: { label: "MQ2 Channel", mid: 100, high: 300 },
  mq7: { label: "MQ7 Channel", mid: 50, high: 150 },
};

const formatRelativeTime = (ts, now) => {
  if (!ts) return "Awaiting data...";
  const diff = now - ts;
  if (diff < 10) return "Updated just now";
  if (diff < 60) return `Updated ${diff}s ago`;
  const diffMins = Math.floor(diff / 60);
  if (diffMins < 60) return `Updated ${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  return `Updated ${diffHours}h ago`;
};

const formatValue = (val, decimals = 1) => {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Number(val).toFixed(decimals);
};

const formatStatVal = (val, key) => {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const num = Number(val);
  if (key === 'temp' || key === 'humidity') {
    return num.toFixed(1);
  }
  return Math.round(num).toString();
};

// #2/#5 — now is a prop; single clock lives in LiveDashboard
const DeviceCard = memo(({ id, data, isDark, isKiosk, isCompact, now }) => {
  const hasPM  = data.hardware?.pms5003 === 1;
  const hasMQ2 = data.hardware?.mq2     === 1;
  const hasMQ7 = data.hardware?.mq7     === 1;
  const hasTemp = data.hardware?.temphu === 1;
  const isOffline = !data.lastUpdated || (now - data.lastUpdated) > 90;

  const getPMStyle = (val, type) => {
    if (!hasPM) return 'bg-white/5 border-white/5 text-gray-500 opacity-50';
    const t = CONFIG_THRESHOLDS[type];
    if (val > t.high) return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    if (val > t.low)  return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  };
  // #1 — getDangerLevel removed (dead code)

  return (
    <div className={`group flex flex-col p-6 md:p-10 rounded-[30px] md:rounded-[45px] border transition-all duration-700 text-left relative z-10 ${
      isDark
        ? 'bg-[#0A0A0A] text-white border-white/[0.06] shadow-xl hover:border-white/10'
        : 'bg-white text-gray-900 border-gray-200 shadow-md hover:border-gray-300'
    } ${isOffline ? 'opacity-30 grayscale blur-[1px]' : ''}`}>


      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-1">Node_ID // {id}</p>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none">{data.name || id}</h2>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`w-3 h-3 rounded-full ${isOffline ? 'bg-rose-500' : 'bg-emerald-500/50 animate-pulse'}`} />
          <div className="text-right">
            <span className={`text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] ${isOffline ? 'text-rose-500' : 'text-emerald-500'}`}>
              {isOffline ? 'NODE_OFFLINE' : 'NODE ONLINE'}
            </span>
            {/* #13 — last-seen for offline, relative time for online */}
            <p className="text-[8px] font-mono opacity-30 mt-0.5">
              {isOffline && data.lastUpdated
                ? `Last seen ${formatRelativeTime(data.lastUpdated, now).replace('Updated ', '')}`
                : formatRelativeTime(data.lastUpdated, now)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-6 mb-8">
        <div className={`text-right ${hasTemp ? 'opacity-100' : 'opacity-20'}`}>
          <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Temp</p>
          <p className="text-3xl font-black font-mono leading-none">
            {hasTemp && data.data?.temp != null ? formatValue(data.data.temp, 1) : 'N/A'}°
          </p>

        </div>
        <div className={`text-right ${hasTemp ? 'opacity-100' : 'opacity-20'}`}>
          <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Humi</p>
          <p className="text-3xl font-black font-mono leading-none">
            {hasTemp && data.data?.humidity != null ? formatValue(data.data.humidity, 1) : 'N/A'}%
          </p>

        </div>
      </div>

      <div className={`grid ${isCompact ? 'grid-cols-2' : 'grid-cols-1'} gap-6 mb-10`}>
        {['pm25', 'pm10'].map(pm => (
          <div key={pm} className={`px-6 md:px-8 py-6 md:py-8 rounded-[25px] md:rounded-[35px] border flex justify-between items-center transition-all ${getPMStyle(data.data?.[pm], pm)}`}>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60 mb-2">
                {pm === 'pm25' ? 'PM 2.5 Index' : 'PM 10 Index'}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl md:text-5xl font-black font-mono leading-none">
                  {hasPM ? (data.data?.[pm] ?? 0) : 'N/A'}
                </span>
                {hasPM && <span className="text-[10px] font-black opacity-60">µg/m³</span>}
                {!hasPM && <span className="text-[9px] font-black opacity-40">Pending</span>}
              </div>

            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        <div className={`flex flex-col gap-2 ${hasMQ2 ? 'opacity-100' : 'opacity-20'}`}>
          <p className="text-[9px] font-black uppercase tracking-widest opacity-40">MQ2 Channel</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black font-mono">{hasMQ2 ? (data.data?.mq2 ?? 0) : 'N/A'}</span>
            <span className="text-[9px] font-black opacity-40">ppm</span>
          </div>

        </div>
        <div className={`flex flex-col gap-2 ${hasMQ7 ? 'opacity-100' : 'opacity-20'}`}>
          <p className="text-[9px] font-black uppercase tracking-widest opacity-40">MQ7 Channel</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black font-mono">{hasMQ7 ? (data.data?.mq7 ?? 0) : 'N/A'}</span>
            <span className="text-[9px] font-black opacity-40">ppm</span>
          </div>

        </div>
      </div>
    </div>
  );
});

const TodayStatsPanel = memo(({ data, stats, isDark, loading, error, onRetry }) => {
  if (loading) {
    return (
      <div className={`flex flex-col h-full p-6 md:p-8 rounded-[30px] md:rounded-[45px] border justify-center items-center text-center ${isDark ? 'bg-[#0A0A0A]/50 border-white/5' : 'bg-[#E2E8F0]/50 border-gray-300'}`}>
        <div className={`w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mb-3 ${isDark ? 'border-indigo-400' : 'border-indigo-600'}`} />
        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Today's Insights</h3>
        <p className={`text-[9px] font-black uppercase tracking-[0.1em] opacity-30 ${isDark ? 'text-white' : 'text-black'}`}>
          Syncing records...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col h-full p-6 md:p-8 rounded-[30px] md:rounded-[45px] border justify-center items-center text-center ${isDark ? 'bg-[#0A0A0A]/50 border-white/5' : 'bg-[#E2E8F0]/50 border-gray-300'}`}>
        <span className="text-xl mb-2">⚠️</span>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-rose-500">Sync Failed</h3>
        <button
          onClick={onRetry}
          className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 transition-all animate-pulse"
        >
          Retry Connect
        </button>
      </div>
    );
  }

  if (!stats || Object.keys(stats).length === 0) {
    return (
      <div className={`flex flex-col h-full p-6 md:p-8 rounded-[30px] md:rounded-[45px] border justify-center items-center text-center ${isDark ? 'bg-[#0A0A0A]/50 border-white/5' : 'bg-[#E2E8F0]/50 border-gray-300'}`}>
        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Today's Insights</h3>
        <p className={`text-[9px] font-black uppercase tracking-[0.1em] opacity-30 ${isDark ? 'text-white' : 'text-black'}`}>
          Awaiting Hourly Sync
        </p>
      </div>
    );
  }
  const sensors = [
    { key: 'pm25', label: 'PM 2.5', unit: 'µg', color: 'text-orange-500', hw: data.hardware?.pms5003 },
    { key: 'pm10', label: 'PM 10', unit: 'µg', color: 'text-blue-500', hw: data.hardware?.pms5003 },
    { key: 'temp', label: 'Temp', unit: '°', color: 'text-red-500', hw: data.hardware?.temphu },
    { key: 'humidity', label: 'Humidity', unit: '%', color: 'text-cyan-500', hw: data.hardware?.temphu },
    { key: 'mq2', label: 'MQ2', unit: 'ppm', color: 'text-yellow-500', hw: data.hardware?.mq2 },
    { key: 'mq7', label: 'MQ7', unit: 'ppm', color: 'text-purple-500', hw: data.hardware?.mq7 }
  ];

  return (
    <div className={`flex flex-col h-full p-6 md:p-8 rounded-[30px] md:rounded-[45px] border ${isDark ? 'bg-[#0A0A0A]/50 border-white/5' : 'bg-[#E2E8F0]/50 border-gray-300'}`}>
      <div className="mb-6">
        <h3 className={`text-[12px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Today's Insights</h3>
      </div>
      <div className="flex-1 flex flex-col justify-around gap-3">
        {sensors.filter(s => s.hw === 1).map(s => {
          const stat = stats[s.key];
          if (!stat) return null;
          return (
            <div key={s.key} className={`p-4 rounded-[20px] border ${isDark ? 'bg-white/5 border-white/5' : 'bg-white/50 border-black/5'}`}>
              <div className="flex justify-between items-baseline mb-3">
                <span className={`text-[12px] font-black uppercase tracking-widest ${s.color}`}>{s.label}</span>
              </div>
              <div className="flex justify-between items-baseline text-[12px] font-mono">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black opacity-40 uppercase tracking-widest">MIN</span>
                  <span className="text-[14px]">{formatStatVal(stat.min, s.key)}{s.unit}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black opacity-40 uppercase tracking-widest">AVG</span>
                  <span className="text-[16px] font-black">{formatStatVal(stat.avg, s.key)}{s.unit}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-black opacity-40 uppercase tracking-widest">MAX</span>
                  <span className="text-[14px]">{formatStatVal(stat.max, s.key)}{s.unit}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function LiveDashboard({ devices, viewMode, isDark, activeFilter, isKiosk }) {
  const [todayStats, setTodayStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // #2/#5 — single shared clock for all cards
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const CACHE_KEY = 'aerosense_today_stats';
    const CACHE_TTL = 5 * 60 * 1000; // 5-min cache — matches archive interval
    let retryTimer = null;

    const fetchStats = (attempt = 0) => {
      setStatsLoading(true);
      setStatsError(null);

      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { ts, data: cachedData } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL) {
            setTodayStats(cachedData);
            setStatsLoading(false);
            return;
          }
        }
      } catch (_) {}

      fetch(`${GAS_URL}?type=hourly`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!data || data.length === 0) {
            throw new Error("No data returned from sync server");
          }

          const _now = new Date();
          const todayStr = _now.toLocaleDateString('en-CA'); // "YYYY-MM-DD" local format
          
          const todayData = data.filter(d => {
            if (!d.Timestamp) return false;
            const date = new Date(d.Timestamp);
            return date.toLocaleDateString('en-CA') === todayStr;
          });

          if (todayData.length === 0) {
            setTodayStats({});
            setStatsLoading(false);
            return;
          }

          const statsPerNode = {};
          const nodes = [...new Set(todayData.map(d => d.Node))];

          nodes.forEach(node => {
            const nodeData = todayData.filter(d => d.Node === node);
            const calcStat = (key, type) => {
              const vals = nodeData.map(d => d[`${key}_${type}`]).filter(v => v != null && v !== '');
              if (vals.length === 0) return 0;
              if (type === 'Avg') return Number((vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(1));
              if (type === 'Min') return Math.min(...vals.map(Number));
              if (type === 'Max') return Math.max(...vals.map(Number));
            };
            statsPerNode[node] = {
              pm25:     { avg: calcStat('PM25', 'Avg'), min: calcStat('PM25', 'Min'), max: calcStat('PM25', 'Max') },
              pm10:     { avg: calcStat('PM10', 'Avg'), min: calcStat('PM10', 'Min'), max: calcStat('PM10', 'Max') },
              mq2:      { avg: calcStat('MQ2',  'Avg'), min: calcStat('MQ2',  'Min'), max: calcStat('MQ2',  'Max') },
              mq7:      { avg: calcStat('MQ7',  'Avg'), min: calcStat('MQ7',  'Min'), max: calcStat('MQ7',  'Max') },
              temp:     { avg: calcStat('Temp', 'Avg'), min: calcStat('Temp', 'Min'), max: calcStat('Temp', 'Max') },
              humidity: { avg: calcStat('Hum',  'Avg'), min: calcStat('Hum',  'Min'), max: calcStat('Hum',  'Max') },
            };
          });

          setTodayStats(statsPerNode);
          setStatsLoading(false);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: statsPerNode }));
          } catch (_) {}
        })
        .catch(err => {
          console.error("Today stats fetch error:", err);
          if (attempt < 3) {
            const delay = (attempt + 1) * 5000;
            console.log(`Retrying in ${delay / 1000}s (Attempt ${attempt + 1}/3)...`);
            retryTimer = setTimeout(() => fetchStats(attempt + 1), delay);
          } else {
            setStatsError("Server Sync Error");
            setStatsLoading(false);
          }
        });
    };

    fetchStats(); // immediate on mount
    const interval = setInterval(() => fetchStats(), 5 * 60 * 1000); // retry every 5 min
    return () => {
      clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [retryCount]);

  // #6 — memoize to avoid re-filtering on every render
  const filteredDevices = useMemo(
    () => Object.entries(devices || {})
      .filter(([, data]) => activeFilter === 'all' || (data.location || '').toLowerCase() === activeFilter),
    [devices, activeFilter]
  );

  // #9 — show skeleton while Firebase hasn't sent any devices yet
  if (Object.keys(devices || {}).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 opacity-40">
        <div className={`w-10 h-10 rounded-full border-2 border-t-transparent animate-spin ${
          isDark ? 'border-white/30' : 'border-black/30'
        }`} />
        <p className="text-[9px] font-black uppercase tracking-[0.4em]">Connecting to nodes...</p>
      </div>
    );
  }

  return (
    <div className={`grid gap-8 md:gap-12 px-4 md:px-8 pb-32 transition-all duration-500 ${
      viewMode === 'grid' ? (isKiosk ? 'grid-cols-1 max-w-[95%] mx-auto' : 'grid-cols-1 max-w-[1500px] mx-auto') :
      viewMode === 'list' ? 'grid-cols-1 max-w-4xl mx-auto' :
      'grid-cols-1 max-w-6xl mx-auto'
    } ${isKiosk ? 'transform scale-[1.1] xl:scale-[1.2] origin-top mt-16 xl:mt-24' : ''}`}>
      
      {/* #4 — audit view now uses the shared live clock */}
      {viewMode === 'audit' && filteredDevices.length > 0 && (
        <div className={`grid grid-cols-7 items-center px-8 py-4 rounded-2xl border text-[9px] font-black uppercase tracking-widest ${isDark ? 'bg-[#0A0A0A] border-white/5 text-white/20' : 'bg-white border-gray-300 text-black/20'}`}>
          <span>Node_Name</span>
          <span>Status</span>
          <span>PM 2.5</span>
          <span>PM 10</span>
          <span>MQ2</span>
          <span>MQ7</span>
          <span>Temp/Hum</span>
        </div>
      )}

      {filteredDevices.length > 0 ? (
        filteredDevices.map(([id, data]) => {
          if (viewMode === 'audit') {
            const isOffline = !data.lastUpdated || (now - data.lastUpdated) > 90;
            return (
              <div key={id} className={`grid grid-cols-1 md:grid-cols-7 items-center px-8 py-5 rounded-2xl border text-left ${isDark ? 'bg-[#0A0A0A] border-white/5' : 'bg-white border-gray-300'} ${isOffline ? 'opacity-40' : ''}`}>
                <span className="text-[10px] font-black">{data.name || id}</span>
                <span className={`text-[9px] font-black ${isOffline ? 'text-rose-500' : 'text-emerald-500'}`}>{isOffline ? 'OFFLINE' : 'LIVE'}</span>
                <span className="text-[10px] font-mono">{data.data?.pm25 || 0}µg</span>
                <span className="text-[10px] font-mono">{data.data?.pm10 || 0}µg</span>
                <span className="text-[10px] font-mono">{data.data?.mq2 || 0}ppm</span>
                <span className="text-[10px] font-mono">{data.data?.mq7 || 0}ppm</span>
                <span className="text-[10px] font-mono">
                  {data.data?.temp != null ? formatValue(data.data.temp, 1) : '0'}° / {data.data?.humidity != null ? formatValue(data.data.humidity, 1) : '0'}%
                </span>
              </div>
            );
          }
          if (viewMode === 'grid') {
            return (
              <div key={id} className="grid grid-cols-1 xl:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_420px] gap-6 md:gap-8">
                <DeviceCard
                  id={id}
                  data={data}
                  isDark={isDark}
                  isKiosk={isKiosk}
                  isCompact={false}
                  now={now}
                />
                <TodayStatsPanel
                  data={data}
                  stats={todayStats?.[data.name || id]}
                  isDark={isDark}
                  loading={statsLoading}
                  error={statsError}
                  onRetry={() => setRetryCount(prev => prev + 1)}
                />
              </div>
            );
          }
          
          return (
            <DeviceCard
              key={id}
              id={id}
              data={data}
              isDark={isDark}
              isKiosk={isKiosk}
              isCompact={true}
              now={now}
            />
          );
        })
      ) : (
        <div className="col-span-full py-20 text-center opacity-20 uppercase text-[10px] font-black tracking-[0.5em]">
          No_Active_Nodes_Found
        </div>
      )}
    </div>
  );
}