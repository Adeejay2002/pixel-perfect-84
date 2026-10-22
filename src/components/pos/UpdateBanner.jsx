import { useEffect, useState } from "react";

// Small corner card shown when a new version of the app is available.
// Nothing downloads or installs until the owner clicks; it never blocks a sale.
// (Only exists inside Electron; in a browser window.posUpdater is undefined.)
export default function UpdateBanner() {
  const [state, setState] = useState(null);
  const [dismissedVersion, setDismissedVersion] = useState(null);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.posUpdater : null;
    if (!api) return undefined;
    let alive = true;
    api
      .getState()
      .then((s) => alive && setState(s))
      .catch(() => {});
    const off = api.onState((s) => alive && setState(s));
    return () => {
      alive = false;
      if (typeof off === "function") off();
    };
  }, []);

  if (!state) return null;
  const { status, version, percent } = state;
  if (!["available", "downloading", "downloaded", "error"].includes(status)) return null;
  if (status === "available" && dismissedVersion === version) return null;

  const api = window.posUpdater;
  const restart = () => {
    if (window.confirm("The app will close and restart to install the update.\nMake sure no sale is in progress. Continue?")) {
      api.install();
    }
  };

  const btn = "rounded-md px-3 py-1.5 text-xs font-bold";
  return (
    <div className="pos-no-print fixed bottom-5 right-5 z-[70] w-72 rounded-lg border border-white/10 bg-pos-tile p-4 text-sm text-foreground shadow-2xl">
      {status === "available" && (
        <>
          <div className="font-bold">Update available</div>
          <div className="mt-1 text-xs opacity-80">Version {version} is ready to download.</div>
          <div className="mt-3 flex gap-2">
            <button className={`${btn} bg-pos-green text-black`} onClick={() => api.download()}>
              Download
            </button>
            <button className={`${btn} bg-pos-hover`} onClick={() => setDismissedVersion(version)}>
              Later
            </button>
          </div>
        </>
      )}
      {status === "downloading" && (
        <>
          <div className="font-bold">Downloading update… {percent}%</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-pos-hover">
            <div className="h-full bg-pos-green" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 text-xs opacity-70">You can keep selling while it downloads.</div>
        </>
      )}
      {status === "downloaded" && (
        <>
          <div className="font-bold">Update {version} is ready</div>
          <div className="mt-1 text-xs opacity-80">Restart to install now, or it will install when you close the app.</div>
          <div className="mt-3 flex gap-2">
            <button className={`${btn} bg-pos-green text-black`} onClick={restart}>
              Restart &amp; install
            </button>
          </div>
        </>
      )}
      {status === "error" && (
        <>
          <div className="font-bold">Update download failed</div>
          <div className="mt-1 text-xs opacity-80">Check the internet connection and try again.</div>
          <div className="mt-3">
            <button className={`${btn} bg-pos-hover`} onClick={() => api.download()}>
              Retry
            </button>
          </div>
        </>
      )}
    </div>
  );
}
