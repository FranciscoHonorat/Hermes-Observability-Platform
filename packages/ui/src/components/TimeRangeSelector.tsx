interface TimeRange {
  label: string;
  value: string;
  hours: number;
}

const timeRanges: TimeRange[] = [
  { label: '1h', value: '1h', hours: 1 },
  { label: '6h', value: '6h', hours: 6 },
  { label: '24h', value: '24h', hours: 24 },
  { label: '7d', value: '7d', hours: 168 },
  { label: '30d', value: '30d', hours: 720 },
];

interface TimeRangeSelectorProps {
  selected: string;
  onChange: (value: string) => void;
}

const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({ selected, onChange }) => {
  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      {timeRanges.map((range) => (
        <button
          key={range.value}
          type="button"
          onClick={() => onChange(range.value)}
          className={`px-4 py-2 text-sm font-medium border ${
            selected === range.value
              ? 'bg-primary text-white border-primary z-10'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          } ${
            range.value === '1h' ? 'rounded-l-lg' : ''
          } ${
            range.value === '30d' ? 'rounded-r-lg' : ''
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
};

export default TimeRangeSelector;
export { timeRanges };
export type { TimeRange };
