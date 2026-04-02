import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Footer } from '@/components/Footer';
import { formatCurrency, formatDate, AppStatus, REGIONS } from '@/lib/constants';
import { ChevronRight } from 'lucide-react';

export default function ExpertDashboard() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setApps(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = apps.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (regionFilter && a.address_region !== regionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(a.producer_name?.toLowerCase().includes(q) ||
          a.iin_bin?.toLowerCase().includes(q) ||
          a.application_number?.toLowerCase().includes(q))
      ) return false;
    }
    return true;
  });

  const stats = {
    total: apps.length,
    under_review: apps.filter(a => a.status === 'under_review').length,
    approved: apps.filter(a => a.status === 'approved' || a.status === 'executed').length,
    rejected: apps.filter(a => a.status === 'rejected').length,
  };

  return (
    <AppLayout>
      <div className="fade-in max-w-6xl mx-auto">
        <h1 className="font-display text-2xl font-bold mb-6">Очередь заявок</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Всего', value: stats.total },
            { label: 'На рассмотрении', value: stats.under_review },
            { label: 'Одобрено', value: stats.approved },
            { label: 'Отклонено', value: stats.rejected },
          ].map(s => (
            <div key={s.label} className="agri-card p-4 text-center">
              <p className="text-2xl font-display font-bold text-primary">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="agri-select px-3 py-2 rounded-lg text-sm">
            <option value="">Все статусы</option>
            <option value="under_review">На рассмотрении</option>
            <option value="approved">Одобрена</option>
            <option value="rejected">Отклонена</option>
            <option value="waitlist">Лист ожидания</option>
            <option value="executed">Исполнена</option>
          </select>
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="agri-select px-3 py-2 rounded-lg text-sm">
            <option value="">Все области</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени / ИИН..."
            className="agri-input px-3 py-2 rounded-lg text-sm flex-1 min-w-[200px]"
          />
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-muted-foreground text-sm">Загрузка...</p>
        ) : (
          <div className="agri-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary/20 text-muted-foreground text-xs">
                  <th className="px-4 py-3 text-left">№ заявки</th>
                  <th className="px-4 py-3 text-left">Заявитель</th>
                  <th className="px-4 py-3 text-left">Район</th>
                  <th className="px-4 py-3 text-left">Направление</th>
                  <th className="px-4 py-3 text-right">Сумма ₸</th>
                  <th className="px-4 py-3 text-center">Статус</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(app => (
                  <tr key={app.id} className="border-b border-primary/10 row-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{app.application_number}</td>
                    <td className="px-4 py-3">{app.producer_name}</td>
                    <td className="px-4 py-3">{app.address_district}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate">{app.subsidy_direction}</td>
                    <td className="px-4 py-3 text-right text-primary font-medium">{formatCurrency(app.total_amount ?? 0)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={app.status} /></td>
                    <td className="px-4 py-3">
                      <Link to={`/expert/application/${app.id}`} className="text-primary hover:opacity-70">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Footer />
      </div>
    </AppLayout>
  );
}
