import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Footer } from '@/components/Footer';
import { formatCurrency, formatDate, AppStatus } from '@/lib/constants';
import { Download } from 'lucide-react';

export default function ExpertRegistry() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const exportCSV = () => {
    const headers = ['№ п/п', 'Дата поступления', 'Область', 'Акимат', 'Номер заявки', 'Направление', 'Вид субсидии', 'Статус', 'Норматив', 'Сумма', 'Район'];
    const rows = apps.map((a, i) => [
      i + 1,
      formatDate(a.created_at),
      a.address_region,
      a.address_akimat,
      a.application_number,
      a.subsidy_direction,
      a.subsidy_name,
      a.status,
      a.normative,
      a.total_amount,
      a.address_district,
    ].join(';'));
    const csv = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'registry.csv';
    link.click();
  };

  const stats = {
    total: apps.length,
    approved: apps.filter(a => a.status === 'approved' || a.status === 'executed').length,
    rejected: apps.filter(a => a.status === 'rejected').length,
  };

  return (
    <AppLayout>
      <div className="fade-in max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">Реестр заявок</h1>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            <Download className="h-4 w-4" /> Экспорт CSV
          </button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Загрузка...</p>
        ) : (
          <div className="agri-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary/20 text-muted-foreground text-xs">
                  <th className="px-3 py-3 text-left">№ п/п</th>
                  <th className="px-3 py-3 text-left">Дата</th>
                  <th className="px-3 py-3 text-left">Область</th>
                  <th className="px-3 py-3 text-left">Акимат</th>
                  <th className="px-3 py-3 text-left">№ заявки</th>
                  <th className="px-3 py-3 text-left">Направление</th>
                  <th className="px-3 py-3 text-left">Вид субсидии</th>
                  <th className="px-3 py-3 text-center">Статус</th>
                  <th className="px-3 py-3 text-right">Норматив</th>
                  <th className="px-3 py-3 text-right">Сумма</th>
                  <th className="px-3 py-3 text-left">Район</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app, i) => (
                  <tr key={app.id} className="border-b border-primary/10 row-hover transition-colors">
                    <td className="px-3 py-3">{i + 1}</td>
                    <td className="px-3 py-3">{formatDate(app.created_at)}</td>
                    <td className="px-3 py-3">{app.address_region}</td>
                    <td className="px-3 py-3">{app.address_akimat}</td>
                    <td className="px-3 py-3 font-mono text-xs">{app.application_number}</td>
                    <td className="px-3 py-3 max-w-[150px] truncate">{app.subsidy_direction}</td>
                    <td className="px-3 py-3 max-w-[150px] truncate">{app.subsidy_name}</td>
                    <td className="px-3 py-3 text-center"><StatusBadge status={app.status as AppStatus} /></td>
                    <td className="px-3 py-3 text-right">{formatCurrency(app.normative ?? 0)}</td>
                    <td className="px-3 py-3 text-right text-primary font-medium">{formatCurrency(app.total_amount ?? 0)}</td>
                    <td className="px-3 py-3">{app.address_district}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-6 mt-4 text-sm text-muted-foreground">
          <span>Всего заявок: {stats.total}</span>
          <span>Одобрено: {stats.approved}</span>
          <span>Отклонено: {stats.rejected}</span>
        </div>

        <Footer />
      </div>
    </AppLayout>
  );
}
