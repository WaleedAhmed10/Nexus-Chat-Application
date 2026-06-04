import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";
import Loader from "./components/Loader";

const AppInner = () => {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <AuthPage />;
  return (
    <SocketProvider>
      <ChatPage />
    </SocketProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
