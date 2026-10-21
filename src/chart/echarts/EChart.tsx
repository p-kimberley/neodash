import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { getDashboardTheme } from '../../dashboard/DashboardSelectors';
import { echartsThemeName } from './theme';

echarts.use([CanvasRenderer]);

export type EChartsOption = echarts.EChartsCoreOption;

/**
 * Renders an ECharts option, filling its container. The chart follows the light/dark appearance,
 * resizes with its card, and reports clicks on data items through `onClick`. Each chart module
 * registers the ECharts components it needs (`echarts.use`), so the bundle only carries those.
 */
export const EChart = ({
  option,
  onClick,
  style,
}: {
  option: EChartsOption;
  onClick?: (params: any) => void;
  style?: React.CSSProperties;
}) => {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | undefined>(undefined);
  const clickHandler = useRef(onClick);
  clickHandler.current = onClick;
  const mode = useSelector(getDashboardTheme) === 'dark' ? 'dark' : 'light';

  // (Re)create the chart when the appearance changes; ECharts themes apply at creation.
  useEffect(() => {
    if (!container.current) {
      return undefined;
    }
    const instance = echarts.init(container.current, echartsThemeName(mode), { renderer: 'canvas' });
    chart.current = instance;
    instance.on('click', (params) => clickHandler.current && clickHandler.current(params));
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => !instance.isDisposed() && instance.resize());
    });
    observer.observe(container.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      chart.current = undefined;
      instance.dispose();
    };
  }, [mode]);

  // Apply the option when its content changes (replacing the previous one, so removed series don't
  // linger). Comparing content rather than identity lets charts build a fresh option on every render
  // without resetting what the viewer did (e.g. series hidden via the legend).
  const applied = useRef<{ key: string; chart?: echarts.ECharts }>({ key: '' });
  const key = JSON.stringify(option);
  useEffect(() => {
    if (chart.current && (applied.current.key !== key || applied.current.chart !== chart.current)) {
      chart.current.setOption(option, { notMerge: true, lazyUpdate: true });
      applied.current = { key, chart: chart.current };
    }
  });

  return <div ref={container} style={{ width: '100%', height: '100%', ...style }} />;
};

export default EChart;
