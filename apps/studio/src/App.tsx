import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { StatusPill } from "./components/StatusPill";
import { UserMenu } from "./components/UserMenu";
import { AuthProvider, useAuth } from "./lib/auth";
import { Home } from "./pages/Home";
import { TTS } from "./pages/TTS";
import { STT } from "./pages/STT";
import { Voices } from "./pages/Voices";
import { Keys } from "./pages/Keys";
import { Usage } from "./pages/Usage";
import { Docs } from "./pages/Docs";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Agent } from "./pages/Agent";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function AppLayout() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-border px-8 py-3 flex items-center justify-between">
          <div className="text-sm text-muted">Studio</div>
          <div className="flex items-center gap-4">
            <StatusPill />
            <UserMenu />
          </div>
        </header>
        <main className="px-8 py-8 max-w-5xl">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tts" element={<TTS />} />
            <Route path="/stt" element={<STT />} />
            <Route
              path="/agent"
              element={
                <RequireAuth>
                  <Agent />
                </RequireAuth>
              }
            />
            <Route path="/voices" element={<Voices />} />
            <Route
              path="/keys"
              element={
                <RequireAuth>
                  <Keys />
                </RequireAuth>
              }
            />
            <Route
              path="/usage"
              element={
                <RequireAuth>
                  <Usage />
                </RequireAuth>
              }
            />
            <Route path="/docs" element={<Docs />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/*" element={<AppLayout />} />
      </Routes>
    </AuthProvider>
  );
}
