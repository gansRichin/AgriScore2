import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Footer } from '@/components/Footer';
import { formatCurrency, formatDate, AppStatus, calcComplianceScore } from '@/lib/constants';
import { ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle, Bot, ArrowUp, ArrowDown } from 'lucide-react';

export default function ExpertReview() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [animals, setAnimals] = useState<any[]>([]);
  const [injConflicts, setInjConflicts] = useState<string[]>([]);
  const [decision, setDecision] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    Promise.all([
      supabase.from('applications').select('*').eq('id', id).single(),
      supabase.from('application_animals').select('*').eq('application_id', id),
    ]).then(([appRes, animRes]) => {
      if (cancelled) return;
      setApp(appRes.data);
      setAnimals(animRes.data ?? []);
      setLoading(false);

      // Check INJ
      const injList = (animRes.data ?? []).map((a: any) => a.inj).filter(Boolean);
      if (injList.length > 0) {
        const year = new Date().getFullYear();
        supabase
          .from('subsidy_history')
          .select('inj')
          .in('inj', injList)
          .eq('year', year)
          .eq('status', 'executed')
          .then(({ data }) => {
            if (!cancelled) setInjConflicts(data?.map(d => d.inj) ?? []);
          });
      }

      const data = appRes.data;
      // Poll if score is null (not yet started) or score is set but recommendation is still missing
      const needsPoll = data && (
        data.ai_score === null ||
        (data.ai_score !== -1 && data.ai_recommendation === null)
      );

      if (needsPoll) {
        interval = setInterval(async () => {
          const res = await supabase.from('applications').select('*').eq('id', id).single();
          if (res.data && !cancelled) {
            setApp(res.data);
            // Stop polling once we have a final result (failed = -1, or score + recommendation both ready)
            const done = res.data.ai_score === -1 ||
              (res.data.ai_score !== null && res.data.ai_recommendation !== null);
            if (done && interval) {
              clearInterval(interval);
              interval = null;
            }
          }
        }, 2500);
      }
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [id]);

  const handleSubmit = async () => {
    if (!user || !app || !decision || !comment.trim()) return;
    setSubmitting(true);

    await supabase.from('expert_reviews').insert({
      application_id: app.id,
      expert_id: user.id,
      decision,
      comment: comment.trim(),
    });

    await supabase
      .from('applications')
      .update({ status: decision })
      .eq('id', app.id);

    // If approved, insert into subsidy_history
    if (decision === 'approved' || decision === 'executed') {
      const year = new Date().getFullYear();
      const historyRows = animals.map(a => ({
        inj: a.inj,
        application_id: app.id,
        year,
        status: decision,
        paid_amount: app.total_amount,
      }));
      if (historyRows.length > 0) {
        await supabase.from('subsidy_history').insert(historyRows);
      }
    }

    setSubmitting(false);
    navigate('/expert');
  };

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
    ['Дата подачи', app.submitted_at ? formatDate(app.submitted_at) : '—'],
  ];

  const alreadyReviewed = ['approved', 'rejected', 'waitlist', 'executed'].includes(app.status);

  const isAiLoading = app.ai_score === null ||
    (app.ai_score !== -1 && app.ai_score !== null && app.ai_recommendation === null);
  const isAiFailed = app.ai_score === -1;

  const getScoreColor = (s: number) => {
    if (s >= 70) return 'text-success';
    if (s >= 45) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBg = (s: number) => {
    if (s >= 70) return 'bg-success/15';
    if (s >= 45) return 'bg-warning/15';
    return 'bg-destructive/15';
  };

  const shapEntries = app.ai_shap
    ? Object.entries(app.ai_shap)
        .map(([k, v]) => ({ name: k, value: v as number }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    : [];

  const renderAiAnalysis = () => {
    if (isAiLoading) {
      return (
        <div className="agri-card p-5 animate-pulse mb-6">
          <h2 className="font-display text-lg font-semibold text-primary mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI Анализ заявки
          </h2>
          <div className="h-24 bg-muted/50 rounded-lg mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-muted/50 rounded w-full"></div>
            <div className="h-4 bg-muted/50 rounded w-3/4"></div>
          </div>
        </div>
      );
    }

    if (isAiFailed) {
      return (
        <div className="agri-card p-5 bg-muted/30 mb-6">
          <h2 className="font-display text-lg font-semibold text-primary mb-2 flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI Анализ недоступен
          </h2>
          <p className="text-sm text-muted-foreground">Анализ недоступен — примите решение вручную</p>
        </div>
      );
    }

    return (
      <div className="agri-card p-5 relative overflow-hidden mb-6">
        <div className="absolute -top-4 -right-4 p-4 opacity-[0.03] pointer-events-none">
          <Bot className="w-48 h-48" />
        </div>
        
        <h2 className="font-display text-lg font-semibold text-primary mb-6 flex items-center gap-2">
           <Bot className="h-5 w-5" /> AI Анализ заявки
        </h2>

        <div className="flex items-center gap-6 mb-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 ${getScoreColor(app.ai_score).replace('text-', 'border-')} border-opacity-30 relative`}>
             <span className={`text-3xl font-display font-bold ${getScoreColor(app.ai_score)}`}>{app.ai_score}</span>
          </div>
          <div>
             <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Вердикт системы</p>
             <span className={`px-3 py-1.5 rounded-md text-sm font-medium ${getScoreBg(app.ai_score)} ${getScoreColor(app.ai_score)}`}>
               {app.ai_verdict}
             </span>
          </div>
        </div>

        {app.ai_is_anomaly && (
          <div className="mb-6 p-3 rounded-lg bg-destructive/15 border border-destructive/20 text-destructive text-sm flex items-center gap-2 font-medium">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            ⚠ Аномалия — заявка выбивается из нормы
          </div>
        )}

        {shapEntries.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold mb-3">Факторы влияния:</p>
            <div className="space-y-1.5">
              {shapEntries.map((item, idx) => (
                 <div key={idx} className={`flex items-center justify-between p-2 rounded-md text-sm ${item.value > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                   <span className="flex items-center gap-2">
                     {item.value > 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                     {item.name}
                   </span>
                   <span className="font-mono font-medium">{item.value > 0 ? '+' : ''}{item.value.toFixed(2)}</span>
                 </div>
              ))}
            </div>
          </div>
        )}

        {app.ai_recommendation && (
          <div>
            <p className="text-sm font-semibold mb-2">Рекомендация:</p>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {app.ai_recommendation}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="fade-in max-w-6xl mx-auto">
        <button onClick={() => navigate('/expert')} className="flex items-center gap-2 text-primary text-sm mb-6 hover:opacity-70">
          <ArrowLeft className="h-4 w-4" /> Назад к очереди
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Заявка {app.application_number}</h1>
            <p className="text-muted-foreground text-sm mt-1">{formatDate(app.created_at)}</p>
          </div>
          <StatusBadge status={app.status as AppStatus} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Application data */}
          <div className="lg:col-span-3 space-y-4">
            {renderAiAnalysis()}

            <div className="agri-card p-5">
              <h2 className="font-display text-lg font-semibold text-primary mb-4">Данные заявки</h2>
              <div className="grid grid-cols-2 gap-3">
                {fields.map(([label, value]) => (
                  <div key={label as string}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <p className="text-sm">{value || '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance checkboxes */}
            <div className="agri-card p-5">
              <h2 className="font-display text-lg font-semibold text-primary mb-3">Критерии</h2>
              <div className="space-y-2 text-sm">
                {[
                  ['Учётный номер ГИСС', app.has_land],
                  ['Регистрация в ИСЖ', app.has_iszh],
                  ['Нет задолженностей', app.has_no_debt],
                  ['Встречные обязательства', app.met_obligations],
                  ['Ранее получал субсидии', app.has_prev_subsidy],
                  ...(app.has_prev_subsidy ? [['Субсидии использованы целевым', app.prev_subsidy_used]] : []),
                ].map(([label, val]) => (
                  <div key={label as string} className="flex items-center gap-2">
                    <span className={val ? 'text-success' : 'text-destructive'}>{val ? '✅' : '❌'}</span>
                    <span>{label as string}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Animals */}
            {animals.length > 0 && (
              <div className="agri-card p-5">
                <h2 className="font-display text-lg font-semibold text-primary mb-3">ИНЖ животных ({animals.length})</h2>
                <div className="space-y-1 text-sm">
                  {animals.map(a => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="font-mono">{a.inj}</span>
                      {a.bull_number && <span className="text-muted-foreground">/ бык: {a.bull_number}</span>}
                      {injConflicts.includes(a.inj) && (
                        <span className="text-destructive text-xs flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> конфликт
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Decision panel */}
          <div className="lg:col-span-2">
            <div className="agri-card p-5 lg:sticky lg:top-8">
              <h2 className="font-display text-lg font-semibold text-primary mb-4">Решение по заявке</h2>

              {/* INJ check */}
              <div className={`p-3 rounded-lg text-sm mb-4 ${injConflicts.length === 0 ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                {injConflicts.length === 0
                  ? '✅ Все ИНЖ проверены, конфликтов нет'
                  : `⚠ Конфликты ИНЖ: ${injConflicts.join(', ')}`
                }
              </div>

              {/* Total */}
              <div className="mb-4">
                <span className="text-xs text-muted-foreground">Причитающаяся сумма:</span>
                <p className="text-2xl font-display font-bold text-primary">{formatCurrency(app.total_amount ?? 0)}</p>
              </div>

              {/* Compliance score */}
              <div className="mb-4">
                <span className="text-xs text-muted-foreground">Соответствие критериям: {score}%</span>
                <div className="w-full bg-secondary rounded-full h-2 mt-1">
                  <div
                    className={`h-2 rounded-full transition-all ${score >= 80 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-destructive'}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>

              {alreadyReviewed ? (
                <p className="text-muted-foreground text-sm">Заявка уже рассмотрена.</p>
              ) : (
                <>
                  {/* Decision buttons */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <button
                      onClick={() => setDecision('approved')}
                      className={`p-3 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                        decision === 'approved' ? 'bg-success/25 text-success ring-1 ring-success' : 'bg-success/10 text-success hover:bg-success/20'
                      }`}
                    >
                      <CheckCircle className="h-5 w-5" /> Одобрить
                    </button>
                    <button
                      onClick={() => setDecision('rejected')}
                      className={`p-3 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                        decision === 'rejected' ? 'bg-destructive/25 text-destructive ring-1 ring-destructive' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                      }`}
                    >
                      <XCircle className="h-5 w-5" /> Отказать
                    </button>
                    <button
                      onClick={() => setDecision('waitlist')}
                      className={`p-3 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                        decision === 'waitlist' ? 'bg-warning/25 text-warning ring-1 ring-warning' : 'bg-warning/10 text-warning hover:bg-warning/20'
                      }`}
                    >
                      <Clock className="h-5 w-5" /> Ожидание
                    </button>
                  </div>

                  {/* Comment */}
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Комментарий комиссии..."
                    className="agri-input w-full px-3 py-2.5 rounded-lg text-sm h-24 resize-none mb-4"
                  />

                  <button
                    onClick={handleSubmit}
                    disabled={!decision || !comment.trim() || submitting}
                    className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {submitting ? 'Сохранение...' : 'Занести в реестр →'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </AppLayout>
  );
}
