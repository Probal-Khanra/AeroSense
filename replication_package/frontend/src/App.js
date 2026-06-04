import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import LiveDashboard from './components/LiveDashboard';
import InsightsModule from './components/InsightsModule';

/** 
 * ==========================================
 * 🛠️ PROJECT CONFIGURATION (AEROSENSE)
 * ==========================================
 */
const CONFIG = {
  firebase: {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "",
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "YOUR_FIREBASE_AUTH_DOMAIN",
    databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || "YOUR_FIREBASE_DATABASE_URL",
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "YOUR_FIREBASE_PROJECT_ID",
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "YOUR_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: process.env.REACT_APP_FIREBASE_APP_ID || "YOUR_FIREBASE_APP_ID"
  },
  project: {
    title: "AeroSense",
    tagline: "Air quality monitoring device",
    // #11 — version removed (not shown in UI)
    description: "We built AeroSense because we wanted to actually know what we're breathing on campus. An ESP32-powered device placed in college quietly measures dust, smoke, CO levels, temperature, and humidity — and beams everything here in real time. Nothing fancy on the surface, but under the hood it's logging every reading to Firebase, crunching hourly and daily summaries in the cloud, and surfacing it all through this dashboard. It started as a college project, but it turned into something we genuinely find useful.",
    guide: { name: "Dr. Ritu Rani De Maity", email: "riturani.de@bcrec.ac.in" }
  },
  team: [
    { name: "Probal Khanra", email: "probalkhanra2006@gmail.com", socials: { github: "https://github.com/Probal-Khanra", linkedin: "https://www.linkedin.com/in/probal-khanra/" } },
    { name: "Rikta Mandal", socials: {} },
    { name: "Trideb Ghosh", socials: {} }
  ],
  thresholds: {
    pm25: { label: "PM 2.5 Index", low: 12, high: 35 },
    pm10: { label: "PM 10 Index", low: 50, high: 150 },
    mq2: { label: "MQ2 Channel", mid: 100, high: 300 },
    mq7: { label: "MQ7 Channel", mid: 50, high: 150 }
  },
  tips: [
    "Activate laboratory exhaust systems if PM levels exceed 35 µg/m³.",
    "Industrial-grade respiratory protection required during high PM 2.5 sessions.",
    "Evacuate immediate zone if Carbon Monoxide exceeds 50 ppm.",
    "Ensure sensor calibration every 30 days for sustained accuracy."
  ]
};

// ── Icons (Kept for UI Consistency) ──────────────────────────────────────────
const GridIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2" /><rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2" /><rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2" /><rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2" /></svg>);
const ListIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6" strokeWidth="2" strokeLinecap="round" /><line x1="4" y1="12" x2="20" y2="12" strokeWidth="2" strokeLinecap="round" /><line x1="4" y1="18" x2="20" y2="18" strokeWidth="2" strokeLinecap="round" /></svg>);
const AuditIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" strokeWidth="2" strokeLinecap="round" /><rect x="9" y="3" width="6" height="4" rx="1" strokeWidth="2" /><line x1="9" y1="12" x2="15" y2="12" strokeWidth="2" strokeLinecap="round" /><line x1="9" y1="16" x2="13" y2="16" strokeWidth="2" strokeLinecap="round" /></svg>);
const KioskIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2M16 4h2a2 2 0 012 2v2M16 20h2a2 2 0 002-2v-2" strokeWidth="2" strokeLinecap="round" /></svg>);
const ThresholdIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>);

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [isKiosk, setIsKiosk] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [devices, setDevices] = useState({});
  const [viewMode, setViewMode] = useState('grid');
  const [mainView, setMainView] = useState('realtime');

  const toggleView = () => {
    const modes = ['grid', 'list', 'audit'];
    const nextIndex = (modes.indexOf(viewMode) + 1) % modes.length;
    setViewMode(modes[nextIndex]);
  };

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') { setIsKiosk(false); setModal(null); } };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Firebase Real-time Sync
  useEffect(() => {
    try {
      const app = !getApps().length ? initializeApp(CONFIG.firebase) : getApps()[0];
      const db = getDatabase(app);
      const unsubscribe = onValue(ref(db, 'devices'), s => {
        const incoming = s.val();
        if (incoming) setDevices(incoming);
      });
      return () => unsubscribe();
    } catch (e) { console.error("Firebase Sync Error", e); }
  }, []);

  return (
    <div className={`min-h-screen transition-colors duration-1000 font-sans relative overflow-x-hidden ${isDark ? 'bg-[#050505] text-white selection:bg-indigo-500/30' : 'bg-[#F8FAFC] text-slate-900 selection:bg-indigo-500/20'
      }`}>
      {/* Ambient background orbs — pure CSS transform/opacity, GPU only */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {!isKiosk && (
        <header className={`sticky top-0 z-50 px-4 md:px-8 py-3 border-b backdrop-blur-xl ${isDark ? 'bg-[#050505]/80 border-white/5' : 'bg-[#CBD5E1]/80 border-black/5'}`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">

            {/* LEFT: View Toggles */}
            <div className="flex items-center justify-center md:justify-start gap-3 w-full md:w-1/3">
              <div className={`relative flex items-center p-1 rounded-xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                <div
                  className="absolute top-1 bottom-1 w-[80px] bg-indigo-600 rounded-lg transition-transform duration-300 ease-out shadow-md"
                  style={{ transform: mainView === 'history' ? 'translateX(100%)' : 'translateX(0)' }}
                />
                {[{ key: 'realtime', label: 'Realtime' }, { key: 'history', label: 'History' }].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setMainView(tab.key)}
                    className={`relative z-10 w-[80px] py-1 text-[9px] font-black uppercase tracking-widest transition-colors duration-300 ${mainView === tab.key ? 'text-white' : (isDark ? 'text-white/50 hover:text-white' : 'text-black/50 hover:text-black')
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {mainView === 'realtime' && (
                <button onClick={toggleView} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${isDark ? 'bg-white/5 border-white/10 hover:bg-indigo-600/20' : 'bg-black/5 border-black/10 hover:bg-indigo-600/10'}`}>
                  <span className="hidden lg:inline text-[9px] font-black uppercase tracking-widest opacity-60">Mode</span>
                  <span className="text-indigo-400">
                    {viewMode === 'grid' && <GridIcon />}
                    {viewMode === 'list' && <ListIcon />}
                    {viewMode === 'audit' && <AuditIcon />}
                  </span>
                </button>
              )}
            </div>

            {/* CENTER: Title */}
            <div className="w-full md:w-1/3 text-center order-first md:order-none">
              <h1 className="text-xl md:text-2xl font-black tracking-tight">{CONFIG.project.title}</h1>
            </div>

            {/* RIGHT: Controls */}
            <div className="flex items-center justify-center md:justify-end gap-3 w-full md:w-1/3">
              <button onClick={() => setIsDark(!isDark)} className="opacity-30 hover:opacity-100 uppercase text-[9px] font-black tracking-widest px-2">
                {isDark ? 'GRAY' : 'OBSID'}
              </button>
              <button onClick={() => setIsKiosk(true)} className="p-2 text-indigo-400 hover:text-indigo-300 transition-colors"><KioskIcon /></button>
              <button onClick={() => setModal('threshold')} className="p-2 hover:opacity-70 transition-opacity"><ThresholdIcon /></button>
              <button onClick={() => setModal('info')} className="px-4 py-1.5 rounded-xl uppercase text-[9px] font-black bg-indigo-600/10 text-indigo-500 border border-indigo-500/20 hover:bg-indigo-600/20 transition-colors">Team</button>
            </div>

          </div>
        </header>
      )}

      {isKiosk && (
        <button onClick={() => setIsKiosk(false)} className="fixed bottom-6 right-6 md:bottom-12 md:right-12 z-[100] px-6 py-4 md:px-8 md:py-5 bg-indigo-600 text-white rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-[0.4em] border border-white/20">Exit_Kiosk [ESC]</button>
      )}

      <main className={`transition-all duration-500 ${isKiosk ? 'fixed inset-0 z-40 flex items-center justify-center overflow-y-auto p-4 md:p-8 ' + (isDark ? 'bg-[#050505]' : 'bg-[#CBD5E1]') : 'pt-2'}`}>
        {mainView === 'realtime' ? (
          <LiveDashboard devices={devices} viewMode={viewMode} isDark={isDark} activeFilter={activeFilter} isKiosk={isKiosk} setActiveFilter={setActiveFilter} />
        ) : (
          <div className="min-h-screen scroll-smooth">
            {/* ── Section Header ───────────────────────────────────── */}
            <div className="max-w-7xl mx-auto px-4 md:px-8 pt-10 pb-4 text-left">
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-1">Historical Analytics</p>
              <h2 className={`text-3xl md:text-4xl font-black tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Environment Log</h2>
              <p className={`text-sm font-mono mt-1 ${isDark ? 'text-white/30' : 'text-gray-400'}`}>Node: Main Gate &middot; Auto-refreshed from cloud archive</p>
            </div>

            {/* ── Yesterday ───────────────────────────────────────── */}
            <div className="max-w-7xl mx-auto px-4 md:px-8">
              <div className={`border-b pb-2 ${isDark ? 'border-white/5' : 'border-gray-200/80'}`}>
                <InsightsModule
                  type="hourly"
                  title="Hourly Breakdown"
                  dateLabel={`Yesterday — ${new Date(Date.now() - 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                  isDark={isDark}
                />
              </div>
            </div>

            {/* ── Weekly ──────────────────────────────────────────── */}
            <div className="max-w-7xl mx-auto px-4 md:px-8">
              <div className={`border-b pb-2 ${isDark ? 'border-white/5' : 'border-gray-200/80'}`}>
                <InsightsModule
                  type="daily"
                  title="Weekly Overview"
                  dateLabel="Last 7 Days"
                  isDark={isDark}
                />
              </div>
            </div>

            {/* ── Monthly ─────────────────────────────────────────── */}
            <div className="max-w-7xl mx-auto px-4 md:px-8 pb-20">
              <InsightsModule
                type="daily"
                title="Monthly Trends"
                dateLabel="Monthly Summary"
                isDark={isDark}
              />
            </div>
          </div>
        )}
      </main>

      {/* --- Modals (Threshold & Info) remain the same --- */}
      {modal === 'threshold' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-md text-left transition-all">
          <div className={`relative w-full max-w-4xl p-8 md:p-14 rounded-[30px] md:rounded-[50px] border shadow-2xl overflow-y-auto max-h-[90vh] ${isDark ? 'bg-gradient-to-br from-[#0A0A0A] to-[#151515] border-white/10 text-white' : 'bg-gradient-to-br from-white to-gray-50 border-gray-200 text-black'}`}>

            <button onClick={() => setModal(null)} className={`absolute top-6 right-6 md:top-8 md:right-8 w-10 h-10 flex items-center justify-center rounded-full border transition-all ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`}>
              ✕
            </button>

            <div className="mb-12">
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-emerald-500 mb-4">AeroSense_Safety_Standards</p>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 leading-none">Environmental<br />Thresholds</h2>
              <p className={`text-[12px] max-w-xl ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Configured baseline safety thresholds for Dr. B. C. Roy Engineering College campus air quality.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
              {Object.entries(CONFIG.thresholds).map(([key, val]) => (
                <div key={key} className={`p-6 rounded-[24px] border transition-all duration-300 hover:-translate-y-1 ${isDark ? 'bg-white/5 border-white/5 hover:border-white/20' : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md'}`}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-3">{val.label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono">{val.low ?? val.mid}</span>
                    <span className={`text-[12px] font-black ${isDark ? 'text-white/30' : 'text-black/30'}`}>to</span>
                    <span className="text-2xl font-black font-mono">{val.high}</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-500 mb-6 pl-2">Action_Protocols</h3>
              <div className="space-y-4">
                {CONFIG.tips.map((t, i) => (
                  <div key={i} className={`flex items-start gap-4 p-5 rounded-[20px] border ${isDark ? 'bg-rose-500/5 border-rose-500/10' : 'bg-rose-50 border-rose-100'}`}>
                    <div className="w-6 h-6 shrink-0 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center text-[10px] font-black">
                      {i + 1}
                    </div>
                    <p className={`text-sm leading-relaxed ${isDark ? 'text-rose-100/80' : 'text-rose-900/80'}`}>{t}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {modal === 'info' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-md text-left transition-all">
          <div className={`relative w-full max-w-5xl p-8 md:p-14 rounded-[30px] md:rounded-[50px] border shadow-2xl overflow-y-auto max-h-[90vh] ${isDark ? 'bg-gradient-to-br from-[#0A0A0A] to-[#151515] border-white/10 text-white' : 'bg-gradient-to-br from-white to-gray-50 border-gray-200 text-black'}`}>

            <button onClick={() => setModal(null)} className={`absolute top-6 right-6 md:top-8 md:right-8 w-10 h-10 flex items-center justify-center rounded-full border transition-all ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`}>
              ✕
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-12 lg:gap-20 mt-4">

              {/* Left Column - Brand & Info */}
              <div className="flex flex-col">
                <div className="mb-8">
                  <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 leading-none">
                    {CONFIG.project.title}
                  </h2>
                  <p className={`text-sm font-medium tracking-wide ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>
                    {CONFIG.project.tagline}
                  </p>
                </div>

                <p className={`text-[12px] leading-loose mb-10 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  {CONFIG.project.description}
                </p>

                <div className={`mt-auto p-6 rounded-[24px] border ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100/50 border-gray-200'}`}>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-1">Institution</p>
                  <p className="text-sm font-black">Dr. B. C. Roy Engineering College</p>
                  <p className={`text-[10px] mt-1 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Department of Electrical Engineering</p>
                </div>
              </div>

              {/* Right Column - Team */}
              <div className="flex flex-col gap-6">

                {/* Supervisor Card */}
                <div className="mb-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4 pl-2">Project Supervisor</p>
                  <div className={`p-6 rounded-[24px] border flex items-center justify-between ${isDark ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-200'}`}>
                    <div>
                      <p className="text-lg font-black">{CONFIG.project.guide.name}</p>
                      <p className={`text-[10px] font-mono mt-1 ${isDark ? 'text-indigo-300/70' : 'text-indigo-500/70'}`}>{CONFIG.project.guide.email}</p>
                    </div>
                  </div>
                </div>

                {/* Team Members */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4 pl-2">Core Development Team</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {CONFIG.team.map((m, i) => (
                      <div key={i} className={`p-5 rounded-[20px] border transition-all duration-300 hover:-translate-y-1 ${isDark ? 'bg-white/5 border-white/5 hover:border-white/20' : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md'}`}>
                        <p className="text-sm font-black mb-2">{m.name}</p>
                        {m.email && (
                          <a
                            href={`mailto:${m.email}`}
                            className={`inline-block text-[9px] font-mono mb-3 hover:underline underline-offset-2 ${isDark ? 'text-white/40 hover:text-indigo-300' : 'text-gray-400 hover:text-indigo-600'}`}
                          >
                            {m.email}
                          </a>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {Object.keys(m.socials).length > 0 ? (
                            Object.entries(m.socials).map(([key, link]) => (
                              <a key={key} href={link} target="_blank" rel="noopener noreferrer" className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors ${isDark ? 'bg-white/10 hover:bg-indigo-600 hover:text-white text-white/70' : 'bg-gray-100 hover:bg-indigo-600 hover:text-white text-gray-600'}`}>
                                {key}
                              </a>
                            ))
                          ) : (
                            <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${isDark ? 'border-white/10 text-white/20' : 'border-black/5 text-black/20'}`}>Unlinked</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Data Request Footer */}
                <div className={`mt-4 p-5 rounded-[20px] border text-center ${isDark ? 'bg-white/[0.03] border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-[10px] leading-relaxed ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                    Need raw sensor data, logs, or research datasets?
                  </p>
                  <a
                    href={`mailto:${CONFIG.team[0].email}?subject=AeroSense Data Request`}
                    className={`inline-block mt-2 text-[10px] font-black tracking-wide hover:underline underline-offset-2 ${isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-800'}`}
                  >
                    Email Probal →
                  </a>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}