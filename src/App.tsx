import React, { useState, useEffect, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ZAxis
} from 'recharts';
import { Droplets, Cloud, Snowflake, TrendingUp, AlertCircle, RotateCcw, Calendar } from 'lucide-react';
import Papa from 'papaparse';

// --- Matrix Math Helpers for Multiple Linear Regression ---
const invert3x3 = (m) => {
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
              m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
              m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  return [
    [(m[1][1] * m[2][2] - m[1][2] * m[2][1]) * invDet, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * invDet, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * invDet],
    [(m[1][2] * m[2][0] - m[1][0] * m[2][2]) * invDet, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * invDet, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * invDet],
    [(m[1][0] * m[2][1] - m[1][1] * m[2][0]) * invDet, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * invDet, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * invDet]
  ];
};

const LakePowellInflowTool = () => {
  const [historicalData, setHistoricalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for user inputs
  const [sweApr1Pct, setSweApr1Pct] = useState(100);
  const [fallSMPct, setFallSMPct] = useState(100);
  const [springPrecipPct, setSpringPrecipPct] = useState(100);
  const [regressionBeta, setRegressionBeta] = useState([0, 0, 0]);

  // Load CSV from Public Folder
  useEffect(() => {
    const loadData = async () => {
      try {
        // FIXED: Added leading slash for Vercel/Production environments
        const resp = await fetch('water_year_metrics.csv');
        if (!resp.ok) throw new Error(`Could not find water_year_metrics.csv at /public. Status: ${resp.status}`);
        
        const fileContent = await resp.text();
        Papa.parse(fileContent, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            let data = results.data.filter(d => d.water_year);
            const baselineData = data.filter(d => d.water_year >= 1991 && d.water_year <= 2020);
            
            const safeMean = (arr, acc) => {
              const vals = arr.map(acc).filter(v => typeof v === 'number');
              return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
            };

            const means = {
              swe: safeMean(baselineData, d => d.apr1_swe_mm) || 1e-9,
              fallSM: safeMean(baselineData, d => d.fall_sm_oct_nov_avg_mm) || 1e-9,
              springPrecip: safeMean(baselineData, d => d.spring_precip_apr_jul_mm) || 1e-9,
              streamflow: safeMean(baselineData, d => d.key_streamflow_apr_jul_mm) || 1e-9
            };

            const processedData = data.map(d => ({
              year: d.water_year,
              swe_mm: d.apr1_swe_mm,
              fallSM_mm: d.fall_sm_oct_nov_avg_mm,
              springPrecip_mm: d.spring_precip_apr_jul_mm,
              streamflow_mm: d.key_streamflow_apr_jul_mm,
              swe_pct: (d.apr1_swe_mm / means.swe) * 100,
              fallSM_pct: (d.fall_sm_oct_nov_avg_mm / means.fallSM) * 100,
              springPrecip_pct: (d.spring_precip_apr_jul_mm / means.springPrecip) * 100,
              streamflow_pct: (d.key_streamflow_apr_jul_mm / means.streamflow) * 100
            }));

            setHistoricalData({
              years: processedData,
              means,
              ranges: {
                swe_pct: { min: Math.min(...processedData.map(d => d.swe_pct)), max: Math.max(...processedData.map(d => d.swe_pct)) },
                fallSM_pct: { min: Math.min(...processedData.map(d => d.fallSM_pct)), max: Math.max(...processedData.map(d => d.fallSM_pct)) },
                springPrecip_pct: { min: Math.min(...processedData.map(d => d.springPrecip_pct)), max: Math.max(...processedData.map(d => d.springPrecip_pct)) },
                streamflow_pct: { min: Math.min(...processedData.map(d => d.streamflow_pct)), max: Math.max(...processedData.map(d => d.streamflow_pct)) }
              },
              histograms: {
                swe: createHistogram(processedData.map(d => d.swe_pct)),
                fallSM: createHistogram(processedData.map(d => d.fallSM_pct)),
                springPrecip: createHistogram(processedData.map(d => d.springPrecip_pct))
              }
            });
            setLoading(false);
          }
        });
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Helper: Create Histogram Bins
  const createHistogram = (values, bins = 15) => {
    const min = Math.min(...values), max = Math.max(...values);
    const binWidth = (max - min) / bins;
    const result = Array(bins).fill(0).map((_, i) => ({
      binStart: min + i * binWidth,
      binEnd: min + (i + 1) * binWidth,
      count: 0
    }));
    values.forEach(v => {
      const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      if (result[idx]) result[idx].count++;
    });
    return result;
  };

  // Multiple Linear Regression Calculation
  useEffect(() => {
    if (!historicalData) return;
    const { years } = historicalData;

    // Build X (matrix of deviations) and Y (vector of streamflow deviations)
    const X = years.map(y => [y.swe_pct - 100, y.fallSM_pct - 100, y.springPrecip_pct - 100]);
    const Y = years.map(y => y.streamflow_pct - 100);

    // Compute (XT * X) and (XT * Y)
    let XT_X = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let XT_Y = [0, 0, 0];

    for (let i = 0; i < X.length; i++) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) XT_X[r][c] += X[i][r] * X[i][c];
        XT_Y[r] += X[i][r] * Y[i];
      }
    }

    const invXT_X = invert3x3(XT_X);
    if (invXT_X) {
      const betas = [0, 1, 2].map(i => 
        invXT_X[i][0] * XT_Y[0] + invXT_X[i][1] * XT_Y[1] + invXT_X[i][2] * XT_Y[2]
      );
      setRegressionBeta(betas);
    }
  }, [historicalData]);

  // Derived Forecast Values
  const forecastResults = useMemo(() => {
    if (!historicalData) return { pct: 100, mm: 0, analogs: [] };
    const { years, ranges, means } = historicalData;
    
    const rawPct = 100 + 
      (sweApr1Pct - 100) * regressionBeta[0] + 
      (fallSMPct - 100) * regressionBeta[1] + 
      (springPrecipPct - 100) * regressionBeta[2];

    const pct = Math.max(ranges.streamflow_pct.min, Math.min(ranges.streamflow_pct.max, rawPct));
    
    const analogs = years
      .map(y => ({ ...y, dist: Math.sqrt(Math.pow(y.swe_pct - sweApr1Pct, 2) + Math.pow(y.fallSM_pct - fallSMPct, 2)) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);

    return { pct, mm: (pct / 100) * means.streamflow, analogs };
  }, [sweApr1Pct, fallSMPct, springPrecipPct, regressionBeta, historicalData]);

  if (loading) return <div className="flex h-screen items-center justify-center font-sans">Loading Hydrological Data...</div>;
  if (error) return <div className="p-10 text-red-600 bg-red-50 h-screen"><AlertCircle className="mb-2" /> Error: {error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-bold text-slate-800">Lake Powell Inflow Tool</h1>
          <p className="text-slate-500 mt-1 italic">Vercel Deployment Beta | ASU Global Institute of Sustainability</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controls Column */}
          <div className="lg:col-span-4 space-y-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold flex items-center gap-2"><TrendingUp className="text-blue-600" /> Adjust Variables</h2>
            
            <SliderBox label="April 1st SWE" icon={<Snowflake />} value={sweApr1Pct} onChange={setSweApr1Pct} color="blue" range={historicalData.ranges.swe_pct} hist={historicalData.histograms.swe} />
            <SliderBox label="Fall Soil Moisture" icon={<Droplets />} value={fallSMPct} onChange={setFallSMPct} color="amber" range={historicalData.ranges.fallSM_pct} hist={historicalData.histograms.fallSM} />
            <SliderBox label="Spring Precip" icon={<Cloud />} value={springPrecipPct} onChange={setSpringPrecipPct} color="cyan" range={historicalData.ranges.springPrecip_pct} hist={historicalData.histograms.springPrecip} />

            <div className="pt-6 border-t">
              <button onClick={() => { setSweApr1Pct(100); setFallSMPct(100); setSpringPrecipPct(100); }} className="w-full py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all">
                <RotateCcw size={18} /> Reset to 1991-2020 Avg
              </button>
            </div>
          </div>

          {/* Visualization Column */}
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-600 text-white p-6 rounded-2xl shadow-lg">
                <p className="text-blue-100 text-sm font-semibold uppercase tracking-wider">Forecasted Inflow</p>
                <div className="text-5xl font-black mt-2">{Math.round(forecastResults.pct)}%</div>
                <p className="text-blue-100 mt-1">of baseline average ({forecastResults.mm.toFixed(1)} mm)</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider flex items-center gap-2"><Calendar size={16}/> Closest Analog Years</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {forecastResults.analogs.map(y => (
                    <div key={y.year} className="px-3 py-1 bg-slate-100 rounded-lg text-sm font-bold border border-slate-200">
                      WY {y.year} <span className="text-slate-500 font-normal">({Math.round(y.streamflow_pct)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-[500px]">
              <h3 className="font-bold text-slate-700 mb-4">Historical Sensitivity: SWE vs Runoff</h3>
              <ResponsiveContainer width="100%" height="90%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" dataKey="swe_pct" name="SWE" unit="%" domain={[25, 200]} label={{ value: 'April 1st SWE (%)', position: 'bottom', offset: 20 }} />
                  <YAxis type="number" dataKey="streamflow_pct" name="Runoff" unit="%" domain={[25, 250]} label={{ value: 'Streamflow (%)', angle: -90, position: 'insideLeft' }} />
                  <ZAxis dataKey="fallSM_pct" range={[50, 400]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                  <ReferenceLine x={100} stroke="#cbd5e1" />
                  <ReferenceLine y={100} stroke="#cbd5e1" />
                  <Scatter data={historicalData.years} fill="#94a3b8" fillOpacity={0.4} />
                  <Scatter data={[{ swe_pct: sweApr1Pct, streamflow_pct: forecastResults.pct, fallSM_pct: fallSMPct }]} fill="#2563eb" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-component: Tooltip
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs">
        <p className="font-bold border-b border-slate-700 pb-1 mb-1">{data.year ? `WY ${data.year}` : 'Current Forecast'}</p>
        <p>SWE: {Math.round(data.swe_pct)}%</p>
        <p>Inflow: {Math.round(data.streamflow_pct)}%</p>
      </div>
    );
  }
  return null;
};

// Sub-component: Slider with Histogram
const SliderBox = ({ label, icon, value, onChange, color, range, hist }) => {
  const maxCount = Math.max(...hist.map(h => h.count));
  const colors = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    cyan: 'bg-cyan-500'
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="flex items-center gap-2 font-semibold text-slate-700">{icon} {label}</span>
        <span className="text-xl font-black">{Math.round(value)}%</span>
      </div>
      <div className="relative h-10 flex items-end gap-0.5">
        {hist.map((b, i) => (
          <div key={i} className={`flex-1 ${colors[color]} opacity-10 rounded-t-sm`} style={{ height: `${(b.count / maxCount) * 100}%` }} />
        ))}
        <div className="absolute w-0.5 h-full bg-slate-900 left-0 transition-all z-10" style={{ left: `${((value - range.min) / (range.max - range.min)) * 100}%` }} />
      </div>
      <input type="range" min={range.min} max={range.max} step="1" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
      <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
        <span>Min: {Math.round(range.min)}%</span>
        <span>Avg: 100%</span>
        <span>Max: {Math.round(range.max)}%</span>
      </div>
    </div>
  );
};

export default LakePowellInflowTool;
