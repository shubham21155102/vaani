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
import { Menu, X } from "lucide-react";
import { useState } from "react";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text selection:bg-accent/30">
      <Sidebar isOpen={mobileMenuOpen} close={() => setMobileMenuOpen(false)} />
      
      <div className="flex-1 min-w-0 flex flex-col relative h-full">
        <header className="sticky top-0 z-20 glass-panel border-b border-border/50 px-4 md:px-8 py-3 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden p-2 -ml-2 text-muted hover:text-accent transition-colors"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="text-sm font-display tracking-widest text-muted hidden sm:block uppercase">Studio</div>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <StatusPill />
            <UserMenu />
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 w-full max-w-6xl mx-auto animate-fade-in relative">
          {/* Every nested route is auth-gated by the RequireAuth wrapper
              around AppLayout below. No per-route guards needed here. */}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tts" element={<TTS />} />
            <Route path="/stt" element={<STT />} />
            <Route path="/agent" element={<Agent />} />
            <Route path="/voices" element={<Voices />} />
            <Route path="/keys" element={<Keys />} />
            <Route path="/usage" element={<Usage />} />
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
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
