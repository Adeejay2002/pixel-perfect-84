import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  WifiOff, Zap, Printer, KeyRound, ShoppingCart, Receipt, Package, Users,
  ShieldCheck, Palette, BarChart3, Check, Phone, MessageCircle, Menu, X, ChevronDown, Download,
} from "lucide-react";
import { TrialDownloadDialog } from "@/components/TrialDownloadDialog";
import logoMark from "@/assets/logo-mark.png";
import logoMarkWhite from "@/assets/logo-mark-white.png";
import {
  hero, laptop, pos as shotReport, pos1 as shotHistory, pos2 as shotMenu,
  pos3 as shotReceipt, pos4 as shotBilling, pos5 as shotLock,
} from "@/lib/images";

const SITE = "https://jnex.com.lk";
const TITLE = "POS System Sri Lanka | Jnex POS — Offline Billing Software";
const DESC = "Jnex POS — ශ්‍රී ලංකාවේ කඩ සඳහා Internet නැතුවත් වැඩ කරන POS system / billing software. බිල් ගහන්න, stock බලන්න, ණය ලියාගන්න. Rs 10,000 සිට, දවස් 3ක් free.";
const OG_IMG = `${SITE}/og-image.png`;
const PHONE_E164 = "+94764026876";

const faqsForSchema: [string, string][] = [
  ["Internet නැතුවත් වැඩ කරනවාද?", "ඔව්. Data ඔක්කොම ඔයාගේ computer එකේම save වෙනවා. Connection එකක් නැතුවත් බිල් ගහන්න පුළුවන්."],
  ["මොන printer එකද පාවිච්චි කරන්න පුළුවන්?", "XP-80T වගේ Thermal printer එකක් නම් හරි. 80mm, 58mm දෙකම තෝරගන්න පුළුවන්."],
  ["Free trial එක කාටද?", "කාටත් පුළුවන්. දවස් 3ක් සම්පූර්ණ system එක පාවිච්චි කරලා බලන්න."],
  ["Rs 10,000 කියන්නේ ජීවිතේටම ද?", "ඔව්, Rs 10,000 සිට පටන් ගන්නවා. එක පාරක් ගෙවනවා, මාසික ගාස්තුවක් නෑ."],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "Jnex Solution",
      url: SITE,
      logo: `${SITE}/icon-512.png`,
      areaServed: { "@type": "Country", name: "Sri Lanka" },
      contactPoint: [{ "@type": "ContactPoint", telephone: PHONE_E164, contactType: "sales", areaServed: "LK", availableLanguage: ["si", "en", "ta"] }],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "Jnex POS",
      inLanguage: "si-LK",
      publisher: { "@id": `${SITE}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#app`,
      name: "Jnex POS",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Windows",
      description: DESC,
      url: SITE,
      image: OG_IMG,
      inLanguage: "si-LK",
      publisher: { "@id": `${SITE}/#org` },
      offers: { "@type": "Offer", price: "10000", priceCurrency: "LKR", availability: "https://schema.org/InStock", url: SITE },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqsForSchema.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "keywords", content: "POS system Sri Lanka, POS software Sri Lanka, billing software Sri Lanka, offline POS, supermarket POS, shop billing system, thermal printer POS, Jnex POS, POS එක, බිල් ගහන software" },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: `${SITE}/` },
      { property: "og:image", content: OG_IMG },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Jnex POS — POS system for shops in Sri Lanka" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
      { name: "twitter:image", content: OG_IMG },
    ],
    links: [
      { rel: "canonical", href: `${SITE}/` },
      { rel: "preload", as: "image", href: hero.url, type: "image/webp" },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
  }),
  component: Index,
});

const WA = `https://wa.me/94764026876?text=${encodeURIComponent("Jnex POS free trial එකක් ගන්න කැමතියි")}`;
const TEL = "tel:+94764026876";
const PHONE_SHOW = "076 402 6876";
const WA_INFO = `https://wa.me/94764026876?text=${encodeURIComponent("Jnex POS ගැන විස්තර දැනගන්න කැමතියි")}`;

const btnGreen = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-success px-6 py-3 font-semibold text-success-foreground shadow-soft transition hover:brightness-105";
const btnOutline = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-primary/30 bg-card px-6 py-3 font-semibold text-primary transition hover:bg-secondary";

function Frame({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-navy/10 bg-navy shadow-frame ${className}`}>
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-gold/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
      </div>
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </div>
  );
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`reveal ${className}`}>{children}</div>;
}

const features = [
  { icon: ShoppingCart, title: "Billing", img: shotBilling.url, alt: "Jnex POS බිල් ගහන තිරය", points: [
    "Touch කරලා ලේසියෙන් බිල් ගහන්න පුළුවන් screen එකක්",
    "Barcode scan කරලා හරි numpad එකෙන් හරි item දාන්න පුළුවන්",
    "Cash ගාණ ගහලා Enter එබුවම payment එක confirm වෙලා receipt එක print වෙනවා",
    "Cash / Card / Account (ණය) වලින් ගෙවන්න පුළුවන්",
    "Item එකකටත් මුළු bill එකටත් discount දාන්න පුළුවන්",
    "බිල් එකක් අතරමග නවත්තලා පස්සේ ආයෙ continue කරන්න පුළුවන් (Hold Sale)",
  ]},
  { icon: Receipt, title: "Receipt Printing", img: shotReceipt.url, alt: "Print කරපු receipt එකක පෙනුම", points: [
    "XP-80T වගේ Thermal printer එකෙන් කිසි popup එකක් නැතුව auto-print",
    "කඩේ logo එක receipt එකේ උඩින්ම මැදට",
    "80mm / 58mm paper width තෝරගන්න පුළුවන්",
    "Discount, cash/change, refund විස්තරත් receipt එකේ පේනවා",
  ]},
  { icon: Package, title: "Stock බලාගන්න", img: shotMenu.url, alt: "Owner menu එක — Inventory, Reports, Settings", points: [
    "Products, categories, stock ප්‍රමාණය බලාගන්න පුළුවන්",
    "Stock 5ට අඩු වුනාම ඉබේම alert එකක් එනවා",
    "Excel / Google Sheets වල හදපු CSV එකකින් products ඔක්කොම එකපාර දාගන්න පුළුවන්",
    "Cost price පේන්නේ owner ට විතරයි, cashier ට පේන්නේ නෑ",
  ]},
  { icon: Users, title: "ණය (ගිණුම්)", img: null, alt: "", points: [
    "Customer accounts හදලා ණය ලියාගන්න පුළුවන්",
    "ණය settle කරන්න බොත්තම් තියෙනවා",
    "Customers ලාවත් CSV එකකින් එකපාර දාගන්න පුළුවන්",
  ]},
  { icon: ShieldCheck, title: "ආරක්ෂාව", img: shotLock.url, alt: "Passcode ගහලා unlock කරන lock screen එක", points: [
    "Owner ටයි Cashier ටයි වෙන වෙනම passcode",
    "Shift එක මැද්දේ Lock කළොත් ආයෙ passcode එක ගහලා login වෙන්න ඕන",
    "Cashiers කීදෙනෙක් වුනත් add / remove කරන්න පුළුවන්",
  ]},
  { icon: Palette, title: "ඔයාගේම Branding", img: null, alt: "", points: [
    "කඩේ logo එක upload කරන්න, වෙනස් කරන්න, delete කරන්න පුළුවන් — receipt එකටත් ඉබේම වැටෙනවා",
    "ඔයාගේම app icon එකයි installer එකයි තියෙන Windows app එකක්",
  ]},
  { icon: BarChart3, title: "වාර්තා සහ Refund", img: shotReport.url, alt: "දවසේ revenue, cost, profit පෙන්නන sales report එක", points: [
    "දවස / සතිය / මාසය අනුව revenue, cost, profit බලාගන්න පුළුවන්",
    "Bill history එකෙන් item එකක් විතරක් හරි මුළු bill එකම හරි refund කරන්න පුළුවන්",
  ]},
];

const gallery = [
  { src: shotBilling.url, cap: "බිල් ගහන තිරය" },
  { src: shotReceipt.url, cap: "Print වෙන receipt එක" },
  { src: shotReport.url, cap: "දවසේ ලාභය එක බැල්මෙන්" },
  { src: shotHistory.url, cap: "Bill history සහ refund" },
  { src: shotMenu.url, cap: "Owner ට විතරක් පේන menu එක" },
  { src: shotLock.url, cap: "Passcode lock screen එක" },
];

const faqs = [
  ["Internet නැතුවත් වැඩ කරනවාද?", "ඔව්. Data ඔක්කොම ඔයාගේ computer එකේම save වෙනවා. Connection එකක් නැතුවත් බිල් ගහන්න පුළුවන්."],
  ["මොන printer එකද පාවිච්චි කරන්න පුළුවන්?", "XP-80T වගේ Thermal printer එකක් නම් හරි. 80mm, 58mm දෙකම තෝරගන්න පුළුවන්."],
  ["Cashier ට cost price පේනවාද?", "නෑ. Cost price පේන්නේ owner ට විතරයි."],
  ["Products එකපාර දාගන්න පුළුවන්ද?", "පුළුවන්. Excel / Google Sheets වල CSV එකක් හදලා එකපාර import කරන්න පුළුවන්."],
  ["Free trial එක කාටද?", "කාටත් පුළුවන්. දවස් 3ක් සම්පූර්ණ system එක පාවිච්චි කරලා බලන්න."],
  ["Trial එක ඉවර වුනාම මොකද වෙන්නේ?", "System එක lock වෙනවා, ඒත් ඔයාගේ data export කරගන්න පුළුවන්. ඉස්සරහට පාවිච්චි කරන්න ඕන නම් අපිට කතා කරන්න."],
  ["Rs 10,000 කියන්නේ ජීවිතේටම ද?", "ඔව්, Rs 10,000 සිට පටන් ගන්නවා. එක පාරක් ගෙවනවා, මාසික ගාස්තුවක් නෑ."],
  ["ඇයි සීමිත පිරිසකට විතරක්?", "කඩේ අයිතිකාරයෝ එක්ක කෙලින්ම වැඩ කරන්න කැමති නිසා, මුලින්ම ගන්න සීමිත පිරිසකට විතරයි මේ මිලට දෙන්නේ."],
];

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      <h2 className="text-2xl font-bold text-navy sm:text-4xl">{title}</h2>
      <div className="gold-divider mx-auto mt-4" />
      {sub && <p className="mt-4 text-muted-foreground">{sub}</p>}
    </Reveal>
  );
}

function Index() {
  const [open, setOpen] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { threshold: 0.12 },
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const nav = [
    ["විශේෂාංග", "#features"], ["තිර දර්ශන", "#screens"], ["Free trial", "#trial"], ["අමතන්න", "#contact"],
  ];

  return (
    <div className="overflow-x-hidden">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="#top" className="flex items-center gap-2.5 text-lg font-bold text-primary"><img src={logoMark} alt="Jnex Solution logo" className="h-9 w-auto" />Jnex <span className="text-navy">POS</span></a>
          <nav className="hidden items-center gap-7 md:flex">
            {nav.map(([l, h]) => <a key={h} href={h} className="text-sm font-medium text-navy/80 hover:text-primary">{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTrialOpen(true)} className={`${btnGreen} hidden min-h-10 px-4 py-2 text-sm sm:inline-flex`}>දවස් 3ක් free</button>
            <button aria-label="මෙනුව" onClick={() => setOpen(!open)} className="grid h-11 w-11 place-items-center rounded-full text-navy md:hidden">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-border bg-background px-4 pb-4 md:hidden">
            {nav.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)} className="block py-3 font-medium text-navy">{l}</a>)}
            <button type="button" onClick={() => { setOpen(false); setTrialOpen(true); }} className={`${btnGreen} mt-2 w-full`}>දවස් 3ක් free</button>
          </nav>
        )}
      </header>

      <TrialDownloadDialog open={trialOpen} onOpenChange={setTrialOpen} />

      {/* Hero */}
      <section id="top" className="circuit-bg">
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:pt-16">
          <Reveal>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">Jnex POS · POS System Sri Lanka</p>
            <h1 className="text-3xl font-bold text-navy sm:text-5xl">කඩේ බිල් ගහන එක <span className="text-primary">ලේසි කරගමු</span></h1>
            <p className="mt-5 text-lg text-muted-foreground">Internet නැතත් ප්‍රශ්නයක් නෑ. බිල් ගහන්න, stock බලන්න, ණය ලියාගන්න — හැමදේම ඔයාගේ computer එකෙන්ම.</p>
            <p className="mt-5 inline-block rounded-full border border-gold px-4 py-1.5 text-sm font-medium text-navy">Rs 10,000 සිට · එක පාරක් ගෙවුවාම ජීවිතේටම · සීමිත පිරිසකට විතරයි</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setTrialOpen(true)} className={btnGreen}>දවස් 3ක් free පාවිච්චි කරලා බලන්න</button>
              <a href={WA_INFO} target="_blank" rel="noreferrer" className={btnOutline}><Phone className="h-4 w-4" />අපිට කතා කරන්න</a>
            </div>
          </Reveal>
          <Reveal className="flex justify-center">
            <img src={hero.url} alt="කඩුවක් අතේ තියාගත්ත සාම්ප්‍රදායික වෙස් මුහුණු රණශූරයා" className="hero-mask hero-float max-h-[380px] w-full object-contain mix-blend-multiply md:max-h-[560px] md:w-[95%]" />
          </Reveal>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4">
          {[[WifiOff, "Internet ඕන නෑ"], [Zap, "ඉක්මනට බිල් ගහන්න පුළුවන්"], [Printer, "Thermal printer එකටත් හරි"], [KeyRound, "Owner / Cashier වෙනම passcode"]].map(([I, t]) => {
            const Icon = I as typeof Zap;
            return (
              <div key={t as string} className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Icon className="h-5 w-5" /></span>
                <span className="text-sm font-medium text-navy">{t as string}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <SectionHead title="විශේෂාංග" sub="කඩේකට දවස ගානේ ඕන වෙන දේවල් ඔක්කොම එක තැනක." />
        <div className="space-y-20">
          {features.map((f, i) => (
            <Reveal key={f.title} className={`grid items-center gap-8 md:grid-cols-2 ${f.img ? "" : "md:grid-cols-1"}`}>
              <div className={f.img && i % 2 ? "md:order-2" : ""}>
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-gold"><f.icon className="h-6 w-6" /></span>
                <h3 className="mt-4 text-2xl font-bold text-navy">{f.title}</h3>
                <ul className={`mt-5 space-y-3 ${f.img ? "" : "grid gap-3 space-y-0 sm:grid-cols-2"}`}>
                  {f.points.map((p) => (
                    <li key={p} className="flex gap-3 text-foreground/85">
                      <Check className="mt-1.5 h-4 w-4 shrink-0 text-primary" />{p}
                    </li>
                  ))}
                </ul>
              </div>
              {f.img && <Frame src={f.img} alt={f.alt} className={f.title === "Receipt Printing" ? "mx-auto max-w-sm" : ""} />}
            </Reveal>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="circuit-bg bg-secondary/60">
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2">
          <Reveal>
            <img src={laptop.url} alt="Laptop එකක වැඩ කරන සාම්ප්‍රදායික වෙස් මුහුණු රණශූරයා" loading="lazy" className="hero-fade w-full mix-blend-multiply" />
          </Reveal>
          <div>
            <Reveal><h2 className="text-2xl font-bold text-navy sm:text-4xl">ඇයි Jnex POS?</h2><div className="gold-divider mt-4" /></Reveal>
            <div className="mt-8 space-y-4">
              {[
                ["Internet ඕන නෑ", "Data ඔක්කොම තියෙන්නේ ඔයාගේම computer එකේ. Net නැති වෙලාවටත් බිල් ගහන්න පුළුවන්."],
                ["Checkout එක ගොඩක් ඉක්මන්", "Barcode scan කරන්න, නැත්නම් numpad එකෙන් ගහන්න. Cash ගාණ ගහලා Enter එබුවම receipt එක print වෙනවා."],
                ["ඔයාගේ කඩේ, ඔයාගේ logo", "Receipt එකේ උඩින්ම ඔයාගේ කඩේ logo එක මැදට print වෙනවා."],
              ].map(([t, d], i) => (
                <Reveal key={t} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <div className="flex gap-4">
                    <span className="font-display text-2xl font-bold text-gold">0{i + 1}</span>
                    <div><h3 className="text-lg font-bold text-navy">{t}</h3><p className="mt-1 text-muted-foreground">{d}</p></div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section id="screens" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <SectionHead title="තිර දර්ශන" sub="System එක ඇත්තටම පේන විදිහ. ලොකු කරලා බලන්න click කරන්න." />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.map((g, i) => (
            <Reveal key={g.cap}>
              <button onClick={() => setLightbox(i)} className="group block w-full text-left">
                <div className="aspect-[16/11] overflow-hidden rounded-2xl border border-navy/10 bg-navy shadow-soft">
                  <img src={g.src} alt={g.cap} loading="lazy" className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-105" />
                </div>
                <p className="mt-3 font-medium text-navy">{g.cap}</p>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      {lightbox !== null && (
        <div role="dialog" aria-modal className="fixed inset-0 z-50 grid place-items-center bg-navy/90 p-4" onClick={() => setLightbox(null)}>
          <button aria-label="වහන්න" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-card text-navy"><X /></button>
          <figure className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img src={gallery[lightbox]!.src} alt={gallery[lightbox]!.cap} className="max-h-[80vh] w-auto rounded-xl" />
            <figcaption className="mt-3 text-center text-navy-foreground">{gallery[lightbox]!.cap}</figcaption>
          </figure>
        </div>
      )}

      {/* Trial */}
      <section id="trial" className="bg-trial scroll-mt-16 text-navy-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-[1.3fr_1fr]">
          <Reveal>
            <h2 className="text-2xl font-bold sm:text-4xl">මුලින්ම පාවිච්චි කරලා බලන්න. කැමති නම් විතරක් ගන්න.</h2>
            <div className="gold-divider mt-5" />
            <p className="mt-5 text-lg text-navy-foreground/80">WhatsApp / කෝල්: <strong>{PHONE_SHOW}</strong></p>
            <p className="mt-3 text-lg text-navy-foreground/80">ඕනෑම කෙනෙකුට දවස් 3ක් free පාවිච්චි කරලා බලන්න පුළුවන්. ඊට පස්සේ ගන්න කැමති නම් Rs 10,000 සිට, එක පාරක් ගෙවුවාම ජීවිතේටම. මේක දෙන්නේ සීමිත පිරිසකට විතරයි.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setTrialOpen(true)} className={btnGreen}><Download className="h-5 w-5" />Free trial එක ගන්න</button>
              <a href={TEL} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-navy-foreground/30 px-6 py-3 font-semibold hover:bg-navy-foreground/10"><Phone className="h-4 w-4" />{PHONE_SHOW}</a>
            </div>
          </Reveal>
          <Reveal className="hidden md:block">
            <div className="overflow-hidden rounded-2xl bg-card p-2 shadow-frame">
              <img src={laptop.url} alt="Laptop එකක් එක්ක රණශූරයා" loading="lazy" className="rounded-xl" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-20">
        <SectionHead title="නිතර අසන ප්‍රශ්න" />
        <div className="space-y-3">
          {faqs.map(([q, a]) => (
            <Reveal key={q}>
              <details className="group rounded-2xl border border-border bg-card px-5 shadow-soft">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-navy">
                  {q}<ChevronDown className="h-5 w-5 shrink-0 text-primary transition group-open:rotate-180" />
                </summary>
                <p className="pb-5 text-muted-foreground">{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="circuit-bg scroll-mt-16 border-t border-border bg-card">
        <Reveal className="relative mx-auto max-w-2xl px-4 py-20 text-center">
          <h2 className="text-2xl font-bold text-navy sm:text-4xl">අමතන්න</h2>
          <div className="gold-divider mx-auto mt-4" />
          <p className="mt-5 text-lg text-muted-foreground">ඕන දෙයක් අහන්න, අපි උදව් කරන්නම්.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={TEL} className={btnOutline}><Phone className="h-4 w-4" />{PHONE_SHOW}</a>
            <a href={WA} target="_blank" rel="noreferrer" className={btnGreen}><MessageCircle className="h-5 w-5" />WhatsApp: {PHONE_SHOW}</a>
          </div>
        </Reveal>
      </section>

      <footer className="bg-navy pb-24 pt-8 text-center text-sm text-navy-foreground/70 sm:pb-6">
        <img src={logoMarkWhite} alt="Jnex Solution" className="mx-auto mb-3 h-12 w-auto opacity-90" />
        <a href={WA} target="_blank" rel="noreferrer" className="hover:text-navy-foreground">WhatsApp: {PHONE_SHOW}</a>
        <p className="mt-1">© 2026 Jnex Solution · Jnex POS — POS system Sri Lanka</p>
      </footer>
      <a href={WA} target="_blank" rel="noreferrer" aria-label="WhatsApp කරන්න" className="group fixed bottom-4 right-4 z-40 flex items-center gap-2">
        <span className="hidden rounded-full bg-card px-3 py-1.5 text-sm font-medium text-navy opacity-0 shadow-soft transition group-hover:opacity-100 md:block">WhatsApp කරන්න</span>
        <span className="grid h-14 w-14 place-items-center rounded-full bg-success text-success-foreground shadow-frame transition hover:brightness-105"><MessageCircle className="h-7 w-7" /></span>
      </a>
    </div>
  );
}
