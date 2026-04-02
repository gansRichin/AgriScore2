import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/Footer';

export default function Login() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('applicant');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (tab === 'login') {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // Auth state change will handle redirect
    } else {
      const { error } = await signUp(email, password, fullName, role);
      if (error) {
        setError(error.message);
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-4xl">🌾</span>
            <h1 className="font-display text-3xl font-bold text-primary">AgriScore</h1>
          </div>
          <p className="text-muted-foreground text-sm">Система субсидирования АПК</p>
        </div>

        {/* Card */}
        <div className="agri-card p-6">
          {/* Tabs */}
          <div className="flex mb-6 border-b border-primary/20">
            <button
              onClick={() => setTab('login')}
              className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                tab === 'login' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
              }`}
            >
              Войти
            </button>
            <button
              onClick={() => setTab('register')}
              className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                tab === 'register' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
              }`}
            >
              Зарегистрироваться
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <>
                <input
                  type="text"
                  placeholder="ФИО"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="agri-input w-full px-3 py-2.5 rounded-lg text-sm"
                  required
                />
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="agri-select w-full px-3 py-2.5 rounded-lg text-sm"
                >
                  <option value="applicant">Заявитель</option>
                  <option value="expert">Эксперт</option>
                </select>
              </>
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="agri-input w-full px-3 py-2.5 rounded-lg text-sm"
              required
            />
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="agri-input w-full px-3 py-2.5 rounded-lg text-sm"
              required
              minLength={6}
            />

            {error && <p className="text-destructive text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? '...' : tab === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-3 rounded-lg bg-secondary/50 text-xs space-y-1">
            <p className="text-muted-foreground font-medium mb-1">Демо-доступ:</p>
            <p><span className="text-primary">Заявитель:</span> farmer@agri.kz / Demo1234!</p>
            <p><span className="text-primary">Эксперт:</span> expert@agri.kz / Demo1234!</p>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
