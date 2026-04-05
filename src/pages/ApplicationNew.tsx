import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { Footer } from '@/components/Footer';
import {
  REGIONS, DIRECTIONS, SUBSIDIES, FARM_TYPES,
  formatCurrency,
} from '@/lib/constants';
import { PlusCircle, Trash2, AlertTriangle } from 'lucide-react';

interface Animal {
  inj: string;
  bull_number: string;
  conflict: boolean;
}

export default function ApplicationNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [injError, setInjError] = useState('');

  // Form state
  const [producerName, setProducerName] = useState('');
  const [iinBin, setIinBin] = useState('');
  const [farmType, setFarmType] = useState('товарное');
  const [region, setRegion] = useState('');
  const [akimat, setAkimat] = useState('');
  const [district, setDistrict] = useState('');
  const [direction, setDirection] = useState('');
  const [subsidyName, setSubsidyName] = useState('');
  const [normative, setNormative] = useState(0);
  const [headCount, setHeadCount] = useState(1);
  const [hasLand, setHasLand] = useState(false);
  const [hasISZH, setHasISZH] = useState(false);
  const [hasNoDebt, setHasNoDebt] = useState(false);
  const [hasPrevSubsidy, setHasPrevSubsidy] = useState(false);
  const [prevSubsidyUsed, setPrevSubsidyUsed] = useState(false);
  const [metObligations, setMetObligations] = useState(false);
  const [animals, setAnimals] = useState<Animal[]>([]);

  const totalAmount = normative * headCount;

  const subsidyOptions = direction ? SUBSIDIES[direction] ?? [] : [];

  const handleDirectionChange = (val: string) => {
    setDirection(val);
    setSubsidyName('');
    setNormative(0);
  };

  const handleSubsidyChange = (val: string) => {
    setSubsidyName(val);
    const found = subsidyOptions.find(s => s.name === val);
    if (found) setNormative(found.normative);
  };

  const addAnimal = () => {
    setAnimals([...animals, { inj: '', bull_number: '', conflict: false }]);
  };

  const removeAnimal = (idx: number) => {
    setAnimals(animals.filter((_, i) => i !== idx));
  };

  const updateAnimal = (idx: number, field: keyof Animal, value: string) => {
    const updated = [...animals];
    updated[idx] = { ...updated[idx], [field]: value };
    setAnimals(updated);
  };

  const checkSingleINJ = async (inj: string, idx: number) => {
    if (!inj) return;
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from('subsidy_history')
      .select('inj')
      .eq('inj', inj)
      .eq('year', year)
      .eq('status', 'executed');
    const updated = [...animals];
    updated[idx] = { ...updated[idx], conflict: (data?.length ?? 0) > 0 };
    setAnimals(updated);
  };

  const checkAllINJ = async (): Promise<boolean> => {
    const injList = animals.map(a => a.inj).filter(Boolean);
    if (injList.length === 0) return true;
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from('subsidy_history')
      .select('inj')
      .in('inj', injList)
      .eq('year', year)
      .eq('status', 'executed');
    const conflicts = data?.map(d => d.inj) ?? [];
    if (conflicts.length > 0) {
      setInjError(`ИНЖ уже субсидированы в ${year} году: ${conflicts.join(', ')}`);
      const updated = animals.map(a => ({
        ...a,
        conflict: conflicts.includes(a.inj),
      }));
      setAnimals(updated);
      return false;
    }
    setInjError('');
    return true;
  };

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);
    setInjError('');

    const injOk = await checkAllINJ();
    if (!injOk) {
      setLoading(false);
      return;
    }

    let ai_score = null;
    let ai_verdict = null;
    let ai_is_anomaly = null;
    let ai_shap = null;
    let ai_recommendation = null;

    try {
      const mlUrl = import.meta.env.VITE_ML_API_URL;
      if (mlUrl) {
        const reqBody = {
          region,
          akimat,
          direction,
          subsidy_name: subsidyName,
          district,
          normativ: normative,
          amount: totalAmount,
          month: new Date().getMonth() + 1
        };
        const res = await fetch(`${mlUrl}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        });
        
        if (res.ok) {
          const scoreData = await res.json();
          ai_score = scoreData.score;
          ai_verdict = scoreData.verdict;
          ai_is_anomaly = scoreData.is_anomaly;
          ai_shap = scoreData.ai_shap;

          const expBody = {
            score: scoreData.score,
            verdict: scoreData.verdict,
            ai_shap: scoreData.ai_shap,
            is_anomaly: scoreData.is_anomaly,
            anomalies: scoreData.anomalies,
            region,
            direction,
            district,
            normativ: normative,
            amount: totalAmount
          };
          const expRes = await fetch(`${mlUrl}/explain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expBody)
          });
          
          if (expRes.ok) {
            const expData = await expRes.json();
            ai_recommendation = expData.explanation;
          }
        } else {
          ai_score = -1;
        }
      }
    } catch (e) {
      console.error('ML Error', e);
      ai_score = -1;
    }

    const { data: app, error } = await supabase
      .from('applications')
      .insert({
        user_id: user.id,
        producer_name: producerName,
        iin_bin: iinBin,
        address_region: region,
        address_district: district,
        address_akimat: akimat,
        farm_type: farmType,
        subsidy_direction: direction,
        subsidy_name: subsidyName,
        normative,
        head_count: headCount,
        has_land: hasLand,
        has_iszh: hasISZH,
        has_no_debt: hasNoDebt,
        has_prev_subsidy: hasPrevSubsidy,
        prev_subsidy_used: prevSubsidyUsed,
        met_obligations: metObligations,
        status: 'under_review',
        submitted_at: new Date().toISOString(),
        ai_score,
        ai_verdict,
        ai_is_anomaly,
        ai_shap,
        ai_recommendation
      })
      .select()
      .single();

    if (error) {
      setInjError(error.message);
      setLoading(false);
      return;
    }

    // Insert animals
    if (animals.length > 0 && app) {
      await supabase.from('application_animals').insert(
        animals.filter(a => a.inj).map(a => ({
          application_id: app.id,
          inj: a.inj,
          bull_number: a.bull_number || null,
        }))
      );
    }

    setLoading(false);
    navigate(`/application/${app.id}`);
  };

  const inputClass = "agri-input w-full px-3 py-2.5 rounded-lg text-sm";
  const selectClass = "agri-select w-full px-3 py-2.5 rounded-lg text-sm";
  const labelClass = "block text-xs text-muted-foreground mb-1";

  return (
    <AppLayout>
      <div className="fade-in max-w-4xl mx-auto">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {['Заявление', 'Экспертиза', 'Реестр'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                i === 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              <span className={`text-sm ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              {i < 2 && <div className="w-8 h-px bg-primary/30" />}
            </div>
          ))}
        </div>

        <h1 className="font-display text-2xl font-bold mb-6">Новая заявка</h1>

        {/* Block 1: Producer data */}
        <div className="agri-card p-5 mb-4">
          <h2 className="font-display text-lg font-semibold mb-4 text-primary">Данные товаропроизводителя</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelClass}>Наименование заявителя</label>
              <input value={producerName} onChange={e => setProducerName(e.target.value)} className={inputClass} placeholder="ТОО «Агро-Ферма»" />
            </div>
            <div>
              <label className={labelClass}>ИИН/БИН</label>
              <input value={iinBin} onChange={e => setIinBin(e.target.value)} className={inputClass} placeholder="123456789012" />
            </div>
            <div>
              <label className={labelClass}>Тип хозяйства</label>
              <select value={farmType} onChange={e => setFarmType(e.target.value)} className={selectClass}>
                {FARM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Область</label>
              <select value={region} onChange={e => setRegion(e.target.value)} className={selectClass}>
                <option value="">Выберите область</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Акимат</label>
              <input value={akimat} onChange={e => setAkimat(e.target.value)} className={inputClass} placeholder="Акимат города..." />
            </div>
            <div>
              <label className={labelClass}>Район хозяйства</label>
              <input value={district} onChange={e => setDistrict(e.target.value)} className={inputClass} placeholder="Район..." />
            </div>
          </div>
        </div>

        {/* Block 2: Subsidy */}
        <div className="agri-card p-5 mb-4">
          <h2 className="font-display text-lg font-semibold mb-4 text-primary">Субсидия</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelClass}>Направление субсидирования</label>
              <select value={direction} onChange={e => handleDirectionChange(e.target.value)} className={selectClass}>
                <option value="">Выберите направление</option>
                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Вид субсидии</label>
              <select value={subsidyName} onChange={e => handleSubsidyChange(e.target.value)} className={selectClass} disabled={!direction}>
                <option value="">Выберите вид субсидии</option>
                {subsidyOptions.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Норматив ₸</label>
              <input type="number" value={normative} onChange={e => setNormative(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Количество голов / единиц</label>
              <input type="number" value={headCount} onChange={e => setHeadCount(Number(e.target.value))} className={inputClass} min={1} />
            </div>
          </div>
          <div className="mt-4 text-right">
            <span className="text-muted-foreground text-sm">Итоговая сумма: </span>
            <span className="text-2xl font-display font-bold text-primary">{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        {/* Block 3: Compliance */}
        <div className="agri-card p-5 mb-4">
          <h2 className="font-display text-lg font-semibold mb-4 text-primary">Критерии соответствия</h2>
          <div className="space-y-3">
            {[
              { label: 'Наличие учётного номера в ГИСС', checked: hasLand, set: setHasLand },
              { label: 'Регистрация животных в ИСЖ', checked: hasISZH, set: setHasISZH },
              { label: 'Отсутствие задолженностей по налогам', checked: hasNoDebt, set: setHasNoDebt },
              { label: 'Ранее получал субсидии', checked: hasPrevSubsidy, set: setHasPrevSubsidy },
            ].map(({ label, checked, set }) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer text-sm">
                <input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="accent-primary w-4 h-4" />
                {label}
              </label>
            ))}
            {hasPrevSubsidy && (
              <label className="flex items-center gap-3 cursor-pointer text-sm ml-6">
                <input type="checkbox" checked={prevSubsidyUsed} onChange={e => setPrevSubsidyUsed(e.target.checked)} className="accent-primary w-4 h-4" />
                Субсидии использованы целевым образом
              </label>
            )}
            <label className="flex items-center gap-3 cursor-pointer text-sm">
              <input type="checkbox" checked={metObligations} onChange={e => setMetObligations(e.target.checked)} className="accent-primary w-4 h-4" />
              Выполнение встречных обязательств
            </label>
          </div>
        </div>

        {/* Block 4: Animals */}
        <div className="agri-card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-primary">ИНЖ животных</h2>
            <button onClick={addAnimal} className="flex items-center gap-1 text-primary text-sm hover:opacity-70">
              <PlusCircle className="h-4 w-4" /> Добавить животное
            </button>
          </div>

          {animals.length === 0 ? (
            <p className="text-muted-foreground text-sm">Животные не добавлены</p>
          ) : (
            <div className="space-y-2">
              {animals.map((animal, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <input
                      placeholder="ИНЖ номер"
                      value={animal.inj}
                      onChange={e => updateAnimal(idx, 'inj', e.target.value)}
                      onBlur={() => checkSingleINJ(animal.inj, idx)}
                      className={`${inputClass} ${animal.conflict ? 'border-destructive' : ''}`}
                    />
                    {animal.conflict && (
                      <p className="text-destructive text-xs mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> уже субсидировано
                      </p>
                    )}
                  </div>
                  <input
                    placeholder="Номер быка"
                    value={animal.bull_number}
                    onChange={e => updateAnimal(idx, 'bull_number', e.target.value)}
                    className={`${inputClass} flex-1`}
                  />
                  <button onClick={() => removeAnimal(idx)} className="text-destructive hover:opacity-70 p-2">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <p className="text-muted-foreground text-xs">Внесено животных: {animals.length}</p>
            </div>
          )}
        </div>

        {injError && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/15 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {injError}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !producerName || !direction || !subsidyName}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Отправка...' : 'Отправить заявку →'}
        </button>

        <Footer />
      </div>
    </AppLayout>
  );
}
