import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { format } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MetricChartProps {
  data: {
    bucket: string;
    avg_value: number;
    min_value: number;
    max_value: number;
    count?: number;
  }[];
  title: string;
  unit?: string;
  color?: string;
  // 'avg' (default) plots avg/max/min of each bucket's raw values —
  // meaningful for a gauge (a snapshot state) or histogram (individual
  // observations). A counter's raw value is just "1" per increment, so
  // avg/max/min all flatten to ~1 regardless of traffic — 'count' plots
  // how many events landed in each bucket instead, which is what "how much
  // traffic" actually means for a counter.
  mode?: 'avg' | 'count';
}

const MetricChart: React.FC<MetricChartProps> = ({ data, title, unit = '', color = 'rgb(59, 130, 246)', mode = 'avg' }) => {
  const chartData = {
    labels: data.map(d => format(new Date(d.bucket), 'HH:mm')),
    datasets: mode === 'count' ? [
      {
        // Postgres COUNT(*) comes back as a string (bigint precision
        // safety), not a number — Number() it explicitly rather than
        // relying on Chart.js's implicit coercion.
        label: 'Count',
        data: data.map(d => Number(d.count ?? 0)),
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        fill: true,
        tension: 0.4,
      },
    ] : [
      {
        label: 'Average',
        data: data.map(d => d.avg_value),
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Max',
        data: data.map(d => d.max_value),
        borderColor: 'rgba(239, 68, 68, 0.5)',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: 'Min',
        data: data.map(d => d.min_value),
        borderColor: 'rgba(34, 197, 94, 0.5)',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: title,
        font: {
          size: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y.toFixed(2) + ' ' + unit;
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: unit
        }
      },
      x: {
        title: {
          display: true,
          text: 'Time'
        }
      }
    },
  };

  return (
    <div className="h-80 w-full">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default MetricChart;
