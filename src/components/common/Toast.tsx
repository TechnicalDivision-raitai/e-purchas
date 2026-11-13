import { useProcurement } from '../../storage/useProcurementStore';

export function Toast() {
  const { toastMessage } = useProcurement();

  if (!toastMessage) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg border border-[#285a96] bg-[#0c2647] px-5 py-3 text-xs font-medium text-white shadow-lg"
    >
      {toastMessage}
    </div>
  );
}
