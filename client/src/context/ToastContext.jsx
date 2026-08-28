import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const ToastContext = createContext(null);
let sequence = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback(id => setItems(current => current.filter(item => item.id !== id)), []);
  const toast = useCallback((message, type = 'success') => {
    const id = ++sequence;
    setItems(current => [...current, { id, message, type }]);
    window.setTimeout(() => remove(id), 4200);
  }, [remove]);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {items.map(item => {
            const Icon = item.type === 'error' ? AlertCircle : item.type === 'info' ? Info : CheckCircle2;
            return (
              <motion.div key={item.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}
                className="surface flex items-start gap-3 p-4">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${item.type === 'error' ? 'text-red-500' : item.type === 'info' ? 'text-primary-500' : 'text-emerald-500'}`} />
                <p className="min-w-0 flex-1 text-sm font-medium">{item.message}</p>
                <button onClick={() => remove(item.id)} aria-label="Dismiss notification"><X className="h-4 w-4 text-slate-400" /></button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
