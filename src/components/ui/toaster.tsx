import { useToast } from "@/hooks/use-toast";
import { useExamFocus } from "@/lib/examFocus";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();
  const examFocus = useExamFocus(); // popup umum disembunyikan saat siswa mengerjakan ujian

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport className={examFocus ? "hidden" : undefined} />
    </ToastProvider>
  );
}
