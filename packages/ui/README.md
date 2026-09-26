# Hermes Observability - UI Package

React dashboard for real-time metrics visualization.

## Technologies

- **React 18** - UI Framework
- **Vite 5** - Build tool and dev server
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Chart.js + react-chartjs-2** - Chart visualization
- **React Router** - Navigation
- **Axios** - HTTP client
- **date-fns** - Date formatting

## Structure

```
src/
├── api/
│   └── client.ts          # API client with endpoints
├── components/
│   ├── Card.tsx           # Reusable card component
│   ├── ErrorMessage.tsx   # Error message
│   ├── LoadingSpinner.tsx # Loading indicator
│   ├── MetricChart.tsx    # Metrics chart
│   └── TimeRangeSelector.tsx # Time range selector
├── pages/
│   ├── Dashboard.tsx      # Main dashboard
│   ├── Applications.tsx   # Application list
│   └── Alerts.tsx         # Alert management
├── App.tsx                # Root component with routing
├── main.tsx               # Entry point
└── index.css              # Global styles
```

## Installation

```bash
# In the monorepo root directory
npm install

# Or just the UI
cd packages/ui
npm install
```

## Development

```bash
# Start dev server (port 3001)
npm run dev

# Build for production
npm run build

# Preview the build
npm run preview
```

## Features

### Dashboard
- Real-time metrics visualization with line charts
- Time range selector (1h, 6h, 24h, 7d, 30d)
- Filter by application
- Monitored metrics:
  - CPU Usage
  - Memory Usage
  - Event Loop Lag
  - HTTP Requests
  - HTTP Request Duration

### Applications
- List of all monitored applications
- First and last collection information
- Metric count per application

### Alerts
- Alert rule creation
- Condition and threshold configuration
- Email notification management
- History of triggered alerts
- Alert acknowledgement

## API Proxy

Vite is configured to proxy `/api` requests to `http://localhost:3000` (API server).

## Environment Variables

No environment variables are required for local development. For production, adjust the proxy in `vite.config.ts` or set `VITE_API_URL`.

## Theme Colors

Defined in `tailwind.config.js`:
- primary: #3b82f6 (blue)
- secondary: #8b5cf6 (purple)
- success: #10b981 (green)
- warning: #f59e0b (amber)
- danger: #ef4444 (red)
