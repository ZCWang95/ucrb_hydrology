// src/components/LakePowellInflowTool.jsx
import React, { useState, useEffect } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ZAxis
} from 'recharts';
import { Droplets, Cloud, Snowflake, TrendingUp, AlertCircle, RotateCcw } from 'lucide-react';
import Papa from 'papaparse';

const LakePowellInflowTool = () => {
  const [historicalData, setHistoricalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for user inputs (initialized as % of average)
  const [sweApr1Pct, setSweApr1Pct] = useState(100);
  const [fallSMPct, setFallSMPct] = useState(100);
  const [springPrecipPct, setSpringPrecipPct] = useState(100);
  const [forecastedFlowPct, setForecastedFlowPct] = useState(100);
  const [forecastedFlowMM, setForecastedFlowMM] = useState(0);
  const [analogYears, setAnalogYears] = useState([]);
  const [regressionBeta, setRegressionBeta] = useState([0, 0, 0]);

  // Load and process CSV data from public folder
  useEffect(() => {
    const loadData = async () => {
      try {
        const resp = await fetch('/water_year_metrics.csv');
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} fetching /water_year_metrics.csv`);
        }
        const fileContent = await resp.text();

        Papa.parse(fileContent, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            let data = results.data.filter(d => d.water_year !== undefined && d.water_year !== null && d.water_year !== '');
            data = data.map((d) => ({
              water_year: Number(d.water_year) || NaN,
              water_year_label: Number(d.water_year) || NaN,
              apr1_swe_mm: Number(d.apr1_swe_mm) || 0,
              fall_sm_oct_nov_avg_mm: Number(d.fall_sm_oct_nov_avg_mm) || 0,
              spring_precip_apr_jul_mm: Number(d.spring_precip_apr_jul_mm) || 0,
              key_streamflow_apr_jul_mm: Number(d.key_streamflow_apr_jul_mm) || 0,
              total_streamflow_mm: Number(d.total_streamflow_mm) || 0
            })).filter(d => !Number.isNaN(d.water_year));

            // Baseline period 1991-2020
            const baselineData = data.filter(d => d.water_year >= 1991 && d.water_year <= 2020);
            if (baselineData.length === 0) {
              setError('No baseline (1991-2020) records found in CSV.');
              setLoading(false);
              return;
            }

            const safeMean = (arr, accessor) => {
              const vals = arr.map(accessor).filter(v => typeof v === 'number');
              return vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
            };

            const means = {
              swe: safeMean(baselineData, d => d.apr1_swe_mm),
              fallSM: safeMean(baselineData, d => d.fall_sm_oct_nov_avg_mm),
              springPrecip: safeMean(baselineData, d => d.spring_precip_apr_jul_mm),
              streamflow: safeMean(baselineData, d => d.key_streamflow_apr_jul_mm)
            };

            // Avoid zero means by forcing tiny epsilon if necessary
            const eps = 1e-9;
            means.swe = means.swe || eps;
            means.fallSM = means.fallSM || eps;
            means.springPrecip = means.springPrecip || eps;
            means.streamflow = means.streamflow || eps;

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

            const safeRange = (vals) => {
              if (vals.length === 0) return { min: 100, max: 100, mean: 100 };
              const min = Math.min(...vals);
              const max = Math.max(...vals);
              const mean = 100;
              return { min, max, mean };
            };

            const ranges = {
              swe_pct: safeRange(processedData.map(d => d.swe_pct)),
              fallSM_pct: safeRange(processedData.map(d => d.fallSM_pct)),
              springPrecip_pct: safeRange(processedData.map(d => d.springPrecip_pct)),
              streamflow_pct: safeRange(processedData.map(d => d.streamflow_pct))
            };

            // Helper to create histogram; handle constant values
            const createHistogram = (values, numBins = 15) => {
              if (!values || values.length === 0) return [];
              const min = Math.min(...values);
              const max = Math.max(...values);
              if (Math.abs(max - min) < 1e-6) {
                // Single-value fallback: create a single bin centered at that value
                return [{ value: min, count: values.length, binStart: min - 0.5, binEnd: min + 0.5 }];
              }
              const binWidth = (max - min) / numBins;
              const bins = Array(numBins).fill(0);
              values.forEach(v => {
                const idx = Math.min(Math.floor((v - min) / binWidth), numBins - 1);
                bins[idx]++;
              });
              return bins.map((count, i) => ({
                value: min + (i + 0.5) * binWidth,
                count,
                binStart: min + i * binWidth,
                binEnd: min + (i + 1) * binWidth
              }));
            };

            const histograms = {
              swe: createHistogram(processedData.map(d => d.swe_pct)),
              fallSM: createHistogram(processedData.map(d => d.fallSM_pct)),
              springPrecip: createHistogram(processedData.map(d => d.springPrecip_pct)),
              streamflow: createHistogram(processedData.map(d => d.streamflow_pct))
            };

            setHistoricalData({
              years: processedData,
              means,
              ranges,
              histograms
            });

            // initialize forecastedFlowMM as baseline streamflow mm
            setForecastedFlowMM(means.streamflow);
            setLoading(false);
          },
          error: (err) => {
            setError(`Error parsing CSV: ${err.message}`);
            setLoading(false);
          }
        });
      } catch (err) {
        setError(`Error loading file: ${err.message}`);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Calculate forecasted streamflow using simple multiple linear regression (as in original)
  useEffect(() => {
    if (!historicalData) return;

    const { years, means, ranges } = historicalData;

    // build X and Y as deviations from 100% baseline percent
    const X = years.map(y => [
      y.swe_pct - 100,
      y.fallSM_pct - 100,
      y.springPrecip_pct - 100
    ]);
    const Y = years.map(y => y.streamflow_pct - 100);

    // if no data, bail
    if (X.length === 0) return;

    // Simple per-variable slope estimate (same approach as original code)
    const n = X.length;
    const beta = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let sumXY = 0, sumX2 = 0;
      for (let j = 0; j < n; j++) {
        sumXY += X[j][i] * Y[j];
        sumX2 += X[j][i] * X[j][i];
      }
      beta[i] = sumX2 > 0 ? sumXY / sumX2 : 0;
    }
    setRegressionBeta(beta);

    const sweContrib = (sweApr1Pct - 100) * beta[0];
    const fallContrib = (fallSMPct - 100) * beta[1];
    const springContrib = (springPrecipPct - 100) * beta[2];

    // Clamp forecast percent to historical min/max
    const forecastPct = Math.max(
      ranges.streamflow_pct.min,
      Math.min(ranges.streamflow_pct.max, 100 + sweContrib + fallContrib + springContrib)
    );

    setForecastedFlowPct(forecastPct);
    setForecastedFlowMM((forecastPct / 100) * means.streamflow);

    // Find analog years (within 15% tolerance)
    const analogs = years.filter(y =>
      Math.abs(y.swe_pct - sweApr1Pct) <= 15 &&
      Math.abs(y.fallSM_pct - fallSMPct) <= 15 &&
      Math.abs(y.springPrecip_pct - springPrecipPct) <= 15
    ).sort((a, b) => b.streamflow_mm - a.streamflow_mm).slice(0, 5);

    setAnalogYears(analogs);
  }, [sweApr1Pct, fallSMPct, springPrecipPct, historicalData]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload;
      const isForecast = data.year === 'Forecast';

      if (isForecast) {
        return (
          <div className="bg-white p-4 border-2 border-red-500 rounded-lg shadow-lg">
            <p className="font-bold text-red-600">Current Forecast</p>
            <p className="text-sm">SWE: {sweApr1Pct.toFixed(0)}% of avg</p>
            <p className="text-sm">Fall SM: {fallSMPct.toFixed(0)}% of avg</p>
            <p className="text-sm">Spring Precip: {springPrecipPct.toFixed(0)}% of avg</p>
            <p className="font-semibold mt-2">Streamflow: {forecastedFlowPct.toFixed(0)}% of avg</p>
          </div>
        );
      }

      const sweContrib = data.swe_pct - 100;
      const fallContrib = data.fallSM_pct - 100;
      const springContrib = data.springPrecip_pct - 100;

      return (
        <div className="bg-white p-4 border-2 border-blue-500 rounded-lg shadow-lg">
          <p className="font-bold text-lg mb-2">WY {data.year}</p>
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-semibold">SWE:</span> {sweContrib >= 0 ? '+' : ''}{sweContrib.toFixed(1)}%
            </p>
            <p>
              <span className="font-semibold">Fall SM:</span> {fallContrib >= 0 ? '+' : ''}{fallContrib.toFixed(1)}%
            </p>
            <p>
              <span className="font-semibold">Spring Precip:</span> {springContrib >= 0 ? '+' : ''}{springContrib.toFixed(1)}%
            </p>
          </div>
          <p className="font-semibold mt-2 pt-2 border-t">
            Streamflow: {data.streamflow_pct.toFixed(0)}% of avg
          </p>
          <p className="text-xs text-gray-600 mt-1">
            ({data.streamflow_mm.toFixed(1)} mm)
          </p>
        </div>
      );
    }
    return null;
  };

  // Slider + histogram component (fixed to accept minProp/maxProp)
  const SliderWithHistogram = ({ label, value, onChange, minProp, maxProp, histogram, icon: Icon, color }) => {
    const maxCount = histogram && histogram.length ? Math.max(...histogram.map(d => d.count)) : 1;
    const min = minProp;
    const max = maxProp;

    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${color}`} />
            <label className="font-semibold text-gray-700">{label}</label>
          </div>
          <span className="text-lg font-bold text-gray-900">{Math.round(value)}%</span>
        </div>

        {/* Histogram background */}
        <div className="relative h-12 mb-1">
          <div className="absolute inset-0 flex items-end">
            {histogram && histogram.map((bin, idx) => {
              const height = (bin.count / maxCount) * 100;
              // Protect against division by zero if min==max
              const left = (max - min) !== 0 ? ((bin.binStart - min) / (max - min)) * 100 : 0;
              const width = (max - min) !== 0 ? ((bin.binEnd - bin.binStart) / (max - min)) * 100 : 100;
              return (
                <div
                  key={idx}
                  className="absolute bg-blue-200 opacity-40"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    bottom: 0
                  }}
                />
              );
            })}
          </div>

          {/* Current value indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
            style={{ left: `${(max - min) !== 0 ? ((value - min) / (max - min)) * 100 : 50}%` }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full"></div>
          </div>
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step="0.5"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{Math.round(min)}%</span>
          <span>100% (1991-2020 Avg)</span>
          <span>{Math.round(max)}%</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading VIC model data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error Loading Data</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const { years, means, ranges, histograms } = historicalData;

  // Prepare scatter plot data with forecast point
  const scatterData = years.map(y => ({
    ...y,
    size: y.fallSM_pct,
    color: y.springPrecip_pct
  }));

  const getColor = (springPrecipPct) => {
    const min = ranges.springPrecip_pct.min;
    const max = ranges.springPrecip_pct.max;
    const normalized = (springPrecipPct - min) / Math.max(1e-9, (max - min));
    if (normalized < 0.25) {
      const t = normalized / 0.25;
      return `rgb(${Math.round(215 + 40 * t)}, ${Math.round(48 + 62 * t)}, ${Math.round(39 - 9 * t)})`;
    } else if (normalized < 0.5) {
      const t = (normalized - 0.25) / 0.25;
      return `rgb(${Math.round(255 - 5 * t)}, ${Math.round(110 + 110 * t)}, ${Math.round(30 + 20 * t)})`;
    } else if (normalized < 0.75) {
      const t = (normalized - 0.5) / 0.25;
      return `rgb(${Math.round(250 - 180 * t)}, ${Math.round(220 - 20 * t)}, ${Math.round(50 + 150 * t)})`;
    } else {
      const t = (normalized - 0.75) / 0.25;
      return `rgb(${Math.round(70 - 40 * t)}, ${Math.round(200 - 80 * t)}, ${Math.round(200 + 40 * t)})`;
    }
  };

  const getSizeScale = (fallSMPct) => {
    const min = ranges.fallSM_pct.min;
    const max = ranges.fallSM_pct.max;
    const normalized = (fallSMPct - min) / Math.max(1e-9, (max - min));
    return 100 + normalized * 300; // 100..400
  };

  const sweContribution = sweApr1Pct - 100;
  const fallContribution = fallSMPct - 100;
  const springContribution = springPrecipPct - 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Lake Powell Inflow Forecasting Tool
          </h1>
          <p className="text-gray-600">
            Upper Colorado River Basin VIC Model (1985-2024, Baseline: 1991-2020)
          </p>
          <p className="text-sm text-red-600 font-semibold mt-1">
            INTERNAL BETA VERSION - FOR DEVELOPMENT AND TESTING ONLY
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Input Parameters</h2>
              <button
                onClick={() => {
                  setSweApr1Pct(100);
                  setFallSMPct(100);
                  setSpringPrecipPct(100);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                title="Reset all to 100%"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Quick Select Historical Year
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onChange={(e) => {
                  if (e.target.value === '') return;
                  const selectedYear = years.find(y => y.year === parseInt(e.target.value));
                  if (selectedYear) {
                    setSweApr1Pct(selectedYear.swe_pct);
                    setFallSMPct(selectedYear.fallSM_pct);
                    setSpringPrecipPct(selectedYear.springPrecip_pct);
                  }
                }}
                defaultValue=""
              >
                <option value="">-- Select a water year --</option>
                {years.map(year => (
                  <option key={year.year} value={year.year}>
                    WY {year.year} ({Math.round(year.streamflow_pct)}%)
                  </option>
                ))}
              </select>
            </div>

            <SliderWithHistogram
              label="April 1st SWE"
              value={sweApr1Pct}
              onChange={setSweApr1Pct}
              minProp={ranges.swe_pct.min}
              maxProp={ranges.swe_pct.max}
              histogram={histograms.swe}
              icon={Snowflake}
              color="text-blue-500"
            />

            <SliderWithHistogram
              label="Fall Soil Moisture (Oct-Nov)"
              value={fallSMPct}
              onChange={setFallSMPct}
              minProp={ranges.fallSM_pct.min}
              maxProp={ranges.fallSM_pct.max}
              histogram={histograms.fallSM}
              icon={Droplets}
              color="text-amber-600"
            />

            <SliderWithHistogram
              label="Spring Precipitation (Apr-Jul)"
              value={springPrecipPct}
              onChange={setSpringPrecipPct}
              minProp={ranges.springPrecip_pct.min}
              maxProp={ranges.springPrecip_pct.max}
              histogram={histograms.springPrecip}
              icon={Cloud}
              color="text-cyan-500"
            />

            <div className="mt-8 p-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-6 h-6" />
                <h3 className="text-lg font-semibold">Forecasted Inflow</h3>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2 text-center pb-4 border-b border-white/30">
                  <div className="text-4xl font-bold mb-1">
                    {Math.round(forecastedFlowPct)}
                  </div>
                  <div className="text-sm opacity-90">
                    of 1991-2020 average
                  </div>
                  <div className="text-2xl font-semibold mt-2">
                    {forecastedFlowMM.toFixed(1)} mm
                  </div>
                  <div className="text-xs opacity-75">
                    Baseline: {means.streamflow.toFixed(1)} mm
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="text-xs font-semibold mb-2 opacity-90">Factor Contributions:</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className={`text-lg font-bold ${sweContribution >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                        {sweContribution >= 0 ? '+' : ''}{sweContribution.toFixed(0)}%
                      </div>
                      <div className="text-xs opacity-75">SWE</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${fallContribution >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                        {fallContribution >= 0 ? '+' : ''}{fallContribution.toFixed(0)}%
                      </div>
                      <div className="text-xs opacity-75">Fall SM</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${springContribution >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                        {springContribution >= 0 ? '+' : ''}{springContribution.toFixed(0)}%
                      </div>
                      <div className="text-xs opacity-75">Spring P</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                SWE vs Streamflow Relationship
              </h2>
              <div className="mb-4 flex items-center gap-6 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'rgb(215, 48, 39)' }}></div>
                  <span>Dry Spring</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'rgb(250, 220, 50)' }}></div>
                  <span>Normal Spring</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'rgb(30, 120, 240)' }}></div>
                  <span>Wet Spring</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                  <span className="mr-2">Small</span>
                  <div className="w-4 h-4 rounded-full bg-gray-600"></div>
                  <span>Large = High Fall SM</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={500}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="swe_pct"
                    type="number"
                    domain={[
                      Math.floor(ranges.swe_pct.min / 25) * 25,
                      Math.ceil(ranges.swe_pct.max / 25) * 25
                    ]}
                    ticks={(() => {
                      const min = Math.floor(ranges.swe_pct.min / 25) * 25;
                      const max = Math.ceil(ranges.swe_pct.max / 25) * 25;
                      const ticks = [];
                      for (let i = min; i <= max; i += 25) ticks.push(i);
                      if (!ticks.includes(100)) {
                        ticks.push(100);
                        ticks.sort((a, b) => a - b);
                      }
                      return ticks;
                    })()}
                    label={{ value: 'April 1st SWE (% of 1991-2020 average)', position: 'insideBottom', offset: -10, style: { fontSize: 14, fontWeight: 600 } }}
                  />
                  <YAxis
                    dataKey="streamflow_pct"
                    domain={[
                      Math.floor(ranges.streamflow_pct.min / 25) * 25,
                      Math.ceil(ranges.streamflow_pct.max / 25) * 25
                    ]}
                    ticks={(() => {
                      const min = Math.floor(ranges.streamflow_pct.min / 25) * 25;
                      const max = Math.ceil(ranges.streamflow_pct.max / 25) * 25;
                      const ticks = [];
                      for (let i = min; i <= max; i += 25) ticks.push(i);
                      if (!ticks.includes(100)) {
                        ticks.push(100);
                        ticks.sort((a, b) => a - b);
                      }
                      return ticks;
                    })()}
                    label={{ value: 'Apr-Jul Streamflow (% of 1991-2020 average)', angle: -90, position: 'insideLeft', style: { fontSize: 14, fontWeight: 600 } }}
                  />
                  <ZAxis dataKey="size" range={[100, 400]} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={100} stroke="#666" strokeWidth={2} />
                  <ReferenceLine y={100} stroke="#666" strokeWidth={2} />

                  {years.map((year) => (
                    <Scatter
                      key={year.year}
                      data={[{ ...year, size: getSizeScale(year.fallSM_pct) }]}
                      fill={getColor(year.springPrecip_pct)}
                      fillOpacity={0.6}
                      shape="circle"
                    />
                  ))}

                  <Scatter
                    data={[{
                      year: 'Forecast',
                      swe_pct: sweApr1Pct,
                      streamflow_pct: forecastedFlowPct,
                      size: getSizeScale(fallSMPct)
                    }]}
                    fill="#ef4444"
                    shape="star"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Methodology & Information</h2>

          <div className="space-y-6 text-gray-700">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Forecasting Model</h3>
              <p className="mb-3">
                This tool uses a multiple linear regression model to forecast April-July streamflow in the Upper Colorado River Basin
                based on three key hydrological indicators. The model is trained on historical VIC model simulations, with percentages relative to 1991-2020.
              </p>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="font-semibold mb-2">Regression Equation:</p>
                <p className="font-mono text-sm">
                  Streamflow% = 100 + β₁×(SWE% - 100) + β₂×(FallSM% - 100) + β₃×(SpringPrecip% - 100)
                </p>
                <p className="text-sm mt-3">
                  Where β₁, β₂, and β₃ are regression coefficients derived from historical data using ordinary least squares-like estimates.
                </p>
                <div className="mt-3 text-sm">
                  <p className="font-semibold">Current Model Coefficients:</p>
                  <p>β₁ (SWE) = {regressionBeta[0].toFixed(4)}</p>
                  <p>β₂ (Fall SM) = {regressionBeta[1].toFixed(4)}</p>
                  <p>β₃ (Spring Precip) = {regressionBeta[2].toFixed(4)}</p>
                </div>
              </div>
            </div>

            {/* ... keep the rest of your explanatory sections unchanged ... */}

            <div className="border-t pt-4 mt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Disclaimer & Copyright</h3>
              <div className="text-sm space-y-2 text-gray-600">
                <p>
                  <strong>Copyright © 2026 Arizona State University.</strong> This tool is provided for research and educational purposes only.
                </p>
                <p>
                  <strong>INTERNAL BETA VERSION:</strong> This is a development version intended for testing and validation.
                </p>
                <p>
                  <strong>Data Source:</strong> VIC model simulations (1985-2024) of the Upper Colorado River Basin. 
                  All percentages are calculated relative to 1991-2020 baseline period averages.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LakePowellInflowTool;
