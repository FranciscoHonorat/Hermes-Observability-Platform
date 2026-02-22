# Hermes Observability - UI Package

Dashboard React para visualização de métricas em tempo real.

## Tecnologias

- **React 18** - Framework UI
- **Vite 5** - Build tool e dev server
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Chart.js + react-chartjs-2** - Visualização de gráficos
- **React Router** - Navigation
- **Axios** - HTTP client
- **date-fns** - Date formatting

## Estrutura

```
src/
├── api/
│   └── client.ts          # API client com endpoints
├── components/
│   ├── Card.tsx           # Componente de card reutilizável
│   ├── ErrorMessage.tsx   # Mensagem de erro
│   ├── LoadingSpinner.tsx # Indicador de carregamento
│   ├── MetricChart.tsx    # Gráfico de métricas
│   └── TimeRangeSelector.tsx # Seletor de intervalo de tempo
├── pages/
│   ├── Dashboard.tsx      # Dashboard principal
│   ├── Applications.tsx   # Lista de aplicações
│   └── Alerts.tsx         # Gerenciamento de alertas
├── App.tsx                # Root component com routing
├── main.tsx               # Entry point
└── index.css              # Global styles
```

## Instalação

```bash
# No diretório raiz do monorepo
npm install

# Ou apenas no UI
cd packages/ui
npm install
```

## Desenvolvimento

```bash
# Iniciar dev server (porta 3001)
npm run dev

# Build para produção
npm run build

# Preview do build
npm run preview
```

## Features

### Dashboard
- Visualização de métricas em tempo real com gráficos de linha
- Seletor de intervalo de tempo (1h, 6h, 24h, 7d, 30d)
- Filtro por aplicação
- Métricas monitoradas:
  - CPU Usage
  - Memory Usage
  - Event Loop Lag
  - HTTP Requests
  - HTTP Request Duration

### Applications
- Lista de todas as aplicações monitoradas
- Informações de primeira e última coleta
- Contador de métricas por aplicação

### Alerts
- Criação de regras de alerta
- Configuração de condições e thresholds
- Gerenciamento de notificações por email
- Histórico de alertas disparados
- Reconhecimento de alertas (acknowledge)

## API Proxy

O Vite está configurado para fazer proxy das requisições `/api` para `http://localhost:3000` (API server).

## Variáveis de Ambiente

Não são necessárias variáveis de ambiente para desenvolvimento local. Para produção, ajuste o proxy no `vite.config.ts` ou configure a `VITE_API_URL`.

## Cores do Tema

Definidas no `tailwind.config.js`:
- primary: #3b82f6 (blue)
- secondary: #8b5cf6 (purple)
- success: #10b981 (green)
- warning: #f59e0b (amber)
- danger: #ef4444 (red)
