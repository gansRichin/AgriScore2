import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Footer } from '@/components/Footer';
import { formatCurrency, formatDate, AppStatus, calcComplianceScore } from '@/lib/constants';
import { ArrowLeft } from 'lucide-react';

export default function ApplicationDetail() {
  const { id } = useParams();
  const [app, setApp] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('applications').select('*').eq('id', id).single(),
      supabase.from('expert_reviews').select('*').eq('application_id', id).order('created_at', { ascending: false }).limit(1),
    ]).then(([appRes, revRes]) => {
      setApp(appRes.data);
      setReview(revRes.data?.[0] ?? null);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <AppLayout><p className="text-muted-foreground">Загрузка...</p></AppLayout>;
  if (!app) return <AppLayout><p className="text-destructive">Заявка не найдена</p></AppLayout>;

  const score = calcComplianceScore(app);

  const fields = [
    ['Наименование', app.producer_name],
    ['ИИН/БИН', app.iin_bin],
    ['Тип хозяйства', app.farm_type],
    ['Область', app.address_region],
    ['Акимат', app.address_akimat],
    ['Район', app.address_district],
    ['Направление', app.subsidy_direction],
    ['Вид субсидии', app.subsidy_name],
    ['Норматив', app.normative ? formatCurrency(app.normative) : '—'],
    ['Кол-во голов', app.head_count],
    ['Итого', app.total_amount ? formatCurrency(app.total_amount) : '—'],
  ];

  return (
    <AppLayout>
      <div className="fade-in max-w-3xl mx-auto">
        <Link to="/dashboard" className="flex items-center gap-2 text-primary text-sm mb-6 hover:opacity-70">
          <ArrowLeft className="h-4 w-4" /> Назад к заявкам
        </Link>

        {/* Status banner */}
        <div className="agri-card p-4 mb-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground">Заявка </span>
            <span className="font-mono text-sm">{app.application_number}</span>
          </div>
          <StatusBadge status={app.status as AppStatus} />
        </div>

        {/* Details */}
        <div className="agri-card p-5 mb-4">
          <h2 className="font-display text-lg font-semibold text-primary mb-4">Данные заявки</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map(([label, value]) => (
              <div key={label as string}>
                <span className="text-xs text-muted-foreground">{label}</span>
                <p className="text-sm">{value || '—'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance */}
        <div className="agri-card p-5 mb-4">
          <h2 className="font-display text-lg font-semibold text-primary mb-3">Соответствие критериям: {score}%</h2>
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${score >= 80 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-destructive'}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Expert review */}
        {review && (
          <div className="agri-card p-5 mb-4">
            <h2 className="font-display text-lg font-semibold text-primary mb-3">Решение эксперта</h2>
            <StatusBadge status={review.decision as AppStatus} />
            {review.comment && (
              <p className="mt-3 text-sm text-muted-foreground">{review.comment}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">{formatDate(review.created_at)}</p>
          </div>
        )}

        <Footer />
      </div>
    </AppLayout>
  );
}
