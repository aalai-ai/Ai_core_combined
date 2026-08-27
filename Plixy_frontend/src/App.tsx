import { useState, useEffect } from "react";
import Assistant from "./components/Assistant/Assistant";
import CADStudio from "./pages/CADStudio";
import Navbar from "./components/Navbar/Navbar";
import Sidebar from "./components/Sidebar/Sidebar";
import Auth from "./components/Auth/Auth";
import { getUserChats } from "./services/api";

const App = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [chats, setChats] = useState<{ chatId: string; title: string }[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (user?._id) {
      fetchChats();
    }
  }, [user]);

  const fetchChats = async () => {
    try {
      const data = await getUserChats(user._id);
      setChats(data);
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    }
  };

  const handleAuthSuccess = (u: any, t: string) => {
    setUser(u);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    setToken(null);
    setChats([]);
    setActiveChatId(null);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  const [viewMode, setViewMode] = useState<'chat' | 'cad_studio'>('chat');

  if (!user || !token) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className={`app-container ${isCollapsed ? 'collapsed' : ''}`}>
      <Sidebar 
        isCollapsed={isCollapsed} 
        setIsCollapsed={setIsCollapsed}
        chats={chats}
        setChats={setChats}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        user={user}
        onLogout={handleLogout}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />
      <div className={"content"}>
        <Navbar theme={theme} toggleTheme={toggleTheme} />
        {viewMode === 'cad_studio' ? (
          <CADStudio />
        ) : (
          <Assistant 
            activeChatId={activeChatId} 
            userId={user._id}
            setChats={setChats}
            setActiveChatId={setActiveChatId}
          />
        )}
      </div>
    </div>
  );
};

export default App;
