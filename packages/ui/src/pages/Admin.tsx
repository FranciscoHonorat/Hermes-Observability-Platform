import { useState, useEffect } from 'react';
import { adminApi, AdminUser, ApiKeyRecord } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { format } from 'date-fns';

const Admin = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({ email: '', password: '', role: 'viewer' as 'admin' | 'viewer' });
  const [keyLabel, setKeyLabel] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, keysData] = await Promise.all([adminApi.getUsers(), adminApi.getApiKeys()]);
      setUsers(usersData);
      setApiKeys(keysData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createUser(userForm.email, userForm.password, userForm.role);
      setUserForm({ email: '', password: '', role: 'viewer' });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Remove this user?')) return;
    try {
      await adminApi.deleteUser(id);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await adminApi.createApiKey(keyLabel || undefined);
      setNewlyCreatedKey(created.key || null);
      setKeyLabel('');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create API key');
    }
  };

  const handleRevokeKey = async (id: number) => {
    if (!confirm('Revoke this API key? Apps using it will stop being able to send data.')) return;
    try {
      await adminApi.revokeApiKey(id);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to revoke API key');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Admin</h1>

      {error && <ErrorMessage message={error} onRetry={loadData} />}

      {loading ? (
        <LoadingSpinner message="Loading admin data..." />
      ) : (
        <>
          <Card title="Users">
            <form onSubmit={handleCreateUser} className="flex flex-wrap gap-2 items-end mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value as 'admin' | 'viewer' })}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-blue-600">
                Add user
              </button>
            </form>

            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between border border-gray-200 rounded-md px-4 py-2">
                  <div>
                    <span className="font-medium text-gray-900">{u.email}</span>{' '}
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700 ml-2">{u.role}</span>
                    <span className="ml-2 text-xs text-gray-500">since {format(new Date(u.created_at), 'MMM dd, yyyy')}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteUser(u.id)}
                    className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Collector API Keys">
            {newlyCreatedKey && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4 text-sm">
                <strong>Save this key now — it won't be shown again:</strong>
                <code className="block mt-1 break-all bg-white border border-yellow-300 rounded px-2 py-1">{newlyCreatedKey}</code>
                <button onClick={() => setNewlyCreatedKey(null)} className="mt-2 text-xs text-gray-600 underline">
                  Dismiss
                </button>
              </div>
            )}

            <form onSubmit={handleCreateKey} className="flex gap-2 items-end mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Label (optional)</label>
                <input
                  type="text"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. movies-service"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-blue-600">
                Generate key
              </button>
            </form>

            <div className="space-y-2">
              {apiKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between border border-gray-200 rounded-md px-4 py-2">
                  <div>
                    <span className="font-medium text-gray-900">{k.label || `Key #${k.id}`}</span>
                    <span className="ml-2 text-xs text-gray-500">since {format(new Date(k.created_at), 'MMM dd, yyyy')}</span>
                    {k.revoked_at && (
                      <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800">revoked</span>
                    )}
                  </div>
                  {!k.revoked_at && (
                    <button
                      onClick={() => handleRevokeKey(k.id)}
                      className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default Admin;
