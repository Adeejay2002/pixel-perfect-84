import { Download, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Files live in /public/downloads/ (served from the site root as /downloads/...)
export const SETUP_URL = "/downloads/Jnex-POS-Setup.exe";
export const SETUP_NAME = "Jnex-POS-Setup.exe";
export const GUIDE_URL = "/downloads/Jnex-POS-User-Guide-Sinhala.pdf";
export const GUIDE_NAME = "Jnex-POS-User-Guide-Sinhala.pdf";

const btnGreen =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-success px-6 py-3 font-semibold text-success-foreground shadow-soft transition hover:brightness-105";
const btnOutline =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-primary/30 bg-card px-6 py-3 font-semibold text-primary transition hover:bg-secondary";

export function TrialDownloadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-navy">
            දවස් 3ක් free පාවිච්චි කරලා බලන්න
          </DialogTitle>
          <DialogDescription className="pt-1 text-base">
            මුලින්ම Setup එක download කරලා install කරගන්න. ඊට පස්සේ පාවිච්චි කරන විදිහ දැනගන්න User Guide එකත් download කරගන්න.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-3">
          <a href={SETUP_URL} download={SETUP_NAME} className={btnGreen}>
            <Download className="h-5 w-5" />
            Setup එක Download කරගන්න
          </a>
          <a href={GUIDE_URL} download={GUIDE_NAME} className={btnOutline}>
            <BookOpen className="h-5 w-5" />
            User Guide එක Download කරගන්න
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
