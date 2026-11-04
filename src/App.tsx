import { useEffect, useState } from 'react';
import PlannerPage from './pages/PlannerPage';
import SetupPage from './components/SetupPage';
import {
  resolveCredentialsAsync,
  type AmapCredentials,
} from './config/credentials';
import { fetchBundledTrip } from './state/cloud';
import type { TripSnapshot } from './state/tripReducer';

export default function App() {
  // undefined = 还在读取配置，null = 没配置，需要引导页。
  const [credentials, setCredentials] = useState<AmapCredentials | null | undefined>(undefined);
  const [bundledTrip, setBundledTrip] = useState<TripSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([resolveCredentialsAsync(), fetchBundledTrip()]).then(
      ([credentialValue, trip]) => {
        if (!alive) return;
        setCredentials(credentialValue);
        setBundledTrip(trip);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  if (credentials === undefined) {
    return (
      <div className="setup-shell">
        <div className="setup-brand">
          <div className="brand-top">
            <span className="brand-word">行程标点</span>
          </div>
          <p className="lede">正在读取地图配置…</p>
        </div>
      </div>
    );
  }

  if (!credentials) {
    return <SetupPage />;
  }

  return <PlannerPage credentials={credentials} bundledTrip={bundledTrip} />;
}
