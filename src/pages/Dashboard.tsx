import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Footer } from '@/components/Footer';
import { formatCurrency, formatDate, AppStatus } from '@/lib/constants';
import { PlusCircle, ChevronRight } from 'lucide-react';

interface AppRow {
  id: string;
  application_number: string;
  created_at: string;
  subsidy_direction: string;
  total_amount: number;
  status: AppStatus;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('applications')
      .select('id, application_number, created_at, subsidy_direction, total_amount, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setApps((data as AppRow[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  return (
    <AppLayout>
      <div className="fade-in max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">Мои заявки</h1>
          <Link
            to="/application/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <PlusCircle className="h-4 w-4" />
            Новая заявка
          </Link>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Загрузка...</p>
        ) : apps.length === 0 ? (
          <div className="agri-card p-12 text-center">
            <p className="text-muted-foreground">Заявок пока нет — подайте первую заявку.</p>
          </div>
        ) : (
          <div className="agri-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary/20 text-muted-foreground text-xs">
                  <th className="px-4 py-3 text-left">№ заявки</th>
                  <th className="px-4 py-3 text-left">Дата</th>
                  <th className="px-4 py-3 text-left">Направление</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                  <th className="px-4 py-3 text-center">Статус</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {apps.map(app => (
                  <tr key={app.id} className="border-b border-primary/10 row-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{app.application_number}</td>
                    <td className="px-4 py-3">{formatDate(app.created_at)}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{app.subsidy_direction}</td>
                    <td className="px-4 py-3 text-right text-primary font-medium">{formatCurrency(app.total_amount ?? 0)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={app.status} /></td>
                    <td className="px-4 py-3">
                      <Link to={`/application/${app.id}`} className="text-primary hover:opacity-70">
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
