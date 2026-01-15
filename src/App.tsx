import React, { useState, useEffect } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis } from 'recharts';
import { Droplets, Cloud, Snowflake, TrendingUp, AlertCircle, RotateCcw } from 'lucide-react';
import Papa from 'papaparse';

const LakePowellInflowTool = () => {
  const [historicalData, setHistoricalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [sweApr1Pct, setSweApr1Pct] = useState(100);
  const [fallSMPct, setFallSMPct] = useState(100);
  const [springPrecipPct, setSpringPrecipPct] = useState(100);
  const [forecastedFlowPct, setForecastedFlowPct] = useState(100);
  const [forecastedFlowMM, setForecastedFlowMM] = useState(0);

  // Load data using standard web fetch
  useEffect(() => {
    const loadData = async () => {
      try {
        // This assumes water_year_metrics.csv is in your 'public' folder or repo root
        const response = await fetch('water_year_metrics.csv');
        if (!response.ok) {
          throw new Error('Data file (water_year_metrics.csv) not found. Ensure it is uploaded to the root of your project.');
        }
        const fileContent = await response.text();
        
        Papa.parse(fileContent, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = results.data.filter(d => d.water_year);
            const baselineData = data.filter(d => d.water_year >= 1991 && d.water_year <= 2020);
            
            const means = {
              swe: baselineData.reduce((sum, d) => sum + d.apr1_swe_mm, 0) / baselineData.length,
              fallSM: baselineData.reduce((sum, d) => sum + d.fall_sm_oct_nov_avg_mm, 0) / baselineData.length,
              springPrecip: baselineData.reduce((sum, d) => sum + d.spring_precip_apr_jul_mm, 0) / baselineData.length,
              streamflow: baselineData.reduce((sum, d) => sum + d.key_streamflow_apr_jul_mm, 0) / baselineData.length
            };
            
            const processedData = data.map(d => ({
              year: d.water_year,
              swe_mm: d.apr1_swe_mm,
              fallSM_mm: d.fall_sm_oct_nov_avg_mm,
              springPrecip_mm: d.spring_precip_apr_jul_mm,
              streamflow_mm: d.key_streamflow_apr_jul_mm,
              totalStreamflow_mm: d.total_streamflow_mm,
              swe_pct: (d.apr1_swe_mm / means.swe) * 100,
              fallSM_pct: (d.fall_sm_oct_nov_avg_mm / means.fallSM) * 100,
              springPrecip_pct: (d.spring_precip_apr_jul_mm / means.springPrecip) * 100,
              streamflow_pct: (d.key_streamflow_apr_jul_mm / means.streamflow) * 100
            }));

            const createHistogram = (values, numBins = 15) => {
              const min = Math.min(...values);
              const max = Math.max(...values);
              const binWidth = (max - min) / numBins;
              const bins = Array(numBins).fill(0);
              values.forEach(v => {
                const binIndex = Math.min(Math.floor((v - min) / binWidth), numBins - 1);
                bins[binIndex]++;
              });
              return bins.map((count, i) => ({
                value: min + (i + 0.5) * binWidth,
                count: count,
                binStart: min + i * binWidth,
                binEnd: min + (i + 1) * binWidth
              }));
            };

            setHistoricalData({
              years: processedData,
              means: means,
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
            setForecastedFlowMM(means.streamflow);
            setLoading(false);
          },
          error: (err) => { setError(`Parse Error: ${err.message}`); setLoading(false); }
        });
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Regression Calculation logic
  useEffect(() => {
    if (!historicalData) return;
    const { years, means, ranges } = historicalData;
    const X = years.map(y => [y.swe_pct - 100, y.fallSM_pct - 100, y.springPrecip_pct - 100]);
    const Y = years.map(y => y.streamflow_pct - 100);
    let beta = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let sumXY = 0, sumX2 = 0;
      for (let j = 0; j < X.length; j++) {
        sumXY += X[j][i] * Y[j];
        sumX2 += X[j][i] * X[j][i];
      }
      beta[i] = sumX2 > 0 ? sumXY / sumX2 : 0;
    }
    const forecastPct = 100 + ((sweApr1Pct - 100) * beta[0]) + ((fallSMPct - 100) * beta[1]) + ((springPrecipPct - 100) * beta[2]);
    setForecastedFlowPct(Math.max(ranges.streamflow_pct.min, Math.min(ranges.streamflow_pct.max, forecastPct)));
    setForecastedFlowMM((forecastPct / 100) * means.streamflow);
  }, [sweApr1Pct, fallSMPct, springPrecipPct, historicalData]);

  // Helper Components and Render Logic (same as your original from here down)
  if (loading) return <div className="p-10 text-center">Loading VIC model data...</div>;
  if (error) return <div className="p-10 text-red-500 text-center"><AlertCircle /> {error}</div>;

  const getColor = (pct) => {
    if (pct < 80) return "#d32f2f";
    if (pct < 110) return "#fbc02d";
    return "#1976d2";
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
        <h1 className="text-3xl font-bold mb-2">Lake Powell Inflow Analyzer</h1>
        <p className="text-slate-500 mb-8">Adjust parameters to see forecasted impact on streamflow.</p>
        
        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div>
              <label className="flex items-center gap-2 font-semibold mb-4"><Snowflake className="text-blue-400"/> April 1st SWE: {sweApr1Pct.toFixed(0)}%</label>
              <input type="range" className="w-full" min="50" max="200" value={sweApr1Pct} onChange={(e) => setSweApr1Pct(Number(e.target.value))} />
            </div>
            <div>
              <label className="flex items-center gap-2 font-semibold mb-4"><Droplets className="text-orange-400"/> Fall Soil Moisture: {fallSMPct.toFixed(0)}%</label>
              <input type="range" className="w-full" min="50" max="150" value={fallSMPct} onChange={(e) => setFallSMPct(Number(e.target.value))} />
            </div>
            <div>
              <label className="flex items-center gap-2 font-semibold mb-4"><Cloud className="text-slate-400"/> Spring Precip: {springPrecipPct.toFixed(0)}%</label>
              <input type="range" className="w-full" min="50" max="150" value={springPrecipPct} onChange={(e) => setSpringPrecipPct(Number(e.target.value))} />
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl p-8 text-white flex flex-col justify-center items-center">
            <TrendingUp className="w-12 h-12 mb-4 text-emerald-400" />
            <div className="text-sm uppercase tracking-widest opacity-60">Forecasted Inflow</div>
            <div className="text-6xl font-black text-emerald-400 my-2">{Math.round(forecastedFlowPct)}%</div>
            <div className="text-xl opacity-80">{forecastedFlowMM.toFixed(1)} mm</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LakePowellInflowTool;
