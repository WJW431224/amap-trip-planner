import PlannerPage from './pages/PlannerPage';
import SetupPage from './components/SetupPage';
import { resolveCredentials } from './config/credentials';

export default function App() {
  const credentials = resolveCredentials();

  if (!credentials) {
    return <SetupPage />;
  }

  return <PlannerPage credentials={credentials} />;
}
