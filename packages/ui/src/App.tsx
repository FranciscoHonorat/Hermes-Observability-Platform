import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Alerts from './pages/Alerts';
import Applications from './pages/Applications';
import Traces from './pages/Traces';
import TraceDetail from './pages/TraceDetail';
import Logs from './pages/Logs';
import ServiceMap from './pages/ServiceMap';
import Insights from './pages/Insights';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { authApi, CurrentUser } from './api/client';
import { AuthContext } from './context/AuthContext';
import LoadingSpinner from './components/LoadingSpinner';

function AppShell() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checked, setChecked] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = useCallback(() => {
    authApi.logout().finally(() => setUser(null));
  }, []);

  if (!checked) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup onLoggedIn={refreshUser} />} />
        <Route path="*" element={<Login onLoggedIn={refreshUser} />} />
      </Routes>
    );
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between h-16">
              <div className="flex space-x-8">
                <div className="flex items-center">
                  <h1 className="text-2xl font-bold text-primary">Hermes</h1>
                </div>
                <div className="flex space-x-4 items-center">
                  <Link to="/" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                    Dashboard
                  </Link>
                  <Link to="/applications" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                    Applications
                  </Link>
                  <Link to="/traces" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                    Traces
                  </Link>
                  <Link to="/service-map" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                    Service Map
                  </Link>
                  <Link to="/logs" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                    Logs
                  </Link>
                  <Link to="/alerts" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                    Alerts
                  </Link>
                  <Link to="/insights" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                    Insights
                  </Link>
                  {user.role === 'admin' && (
                    <Link to="/admin" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                      Admin
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500">
                  {user.email} &middot; {user.tenant_name} &middot; <span className="uppercase">{user.role}</span>
                </span>
                <button
                  onClick={logout}
                  className="text-sm text-gray-700 hover:text-primary px-3 py-2 rounded-md font-medium border border-gray-300"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/traces" element={<Traces />} />
            <Route path="/traces/:traceId" element={<TraceDetail />} />
            <Route path="/service-map" element={<ServiceMap />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/insights" element={<Insights />} />
            {user.role === 'admin' && <Route path="/admin" element={<Admin />} />}
          </Routes>
        </main>
      </div>
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;
