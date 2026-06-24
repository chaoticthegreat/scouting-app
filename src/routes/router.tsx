// src/routes/router.tsx — no auth, no role gates. Every route is open; a silent
// anonymous session (see main.tsx -> ensureAnonSession) satisfies RLS.
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  type RouteObject,
} from 'react-router-dom';
import DashboardScreen from '../dash/DashboardScreen';
import HomeScreen from '../home/HomeScreen';
import ScoutHome from '../capture/ScoutHome';
import MyDataView from '../scout/MyDataView';
import QrSendScreen from '../qr/QrSendScreen';
import QrReceiveScreen from '../qr/QrReceiveScreen';
import SyncStatusScreen from '../sync/SyncStatusScreen';

export const routes: RouteObject[] = [
  { path: '/', element: <HomeScreen /> },
  { path: '/scout', element: <ScoutHome /> },
  { path: '/my-data', element: <MyDataView /> },
  // Pit scouting folds into the Scout Home Match/Pit toggle.
  { path: '/pit', element: <Navigate to="/scout?mode=pit" replace /> },
  { path: '/qr/send', element: <QrSendScreen /> },
  { path: '/qr/receive', element: <QrReceiveScreen /> },
  { path: '/dashboard', element: <DashboardScreen /> },
  { path: '/sync', element: <SyncStatusScreen /> },
  // Legacy admin entry point folds into the dashboard Setup tab.
  { path: '/admin', element: <Navigate to="/dashboard?tab=setup" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />;
}
